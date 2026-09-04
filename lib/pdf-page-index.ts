/* lib/pdf-page-index.ts
 *
 * Full-text page extraction for book/thesis/publication PDFs -> the book_pages table
 * (migration 0066), which powers "found inside" page hits in
 * /api/search/native.
 *
 * Used from two places:
 *   - Admin server actions (saveBookRecord, createThesis, updateThesis,
 *     createPublication, updatePublication) via
 *     `after()` — new uploads are indexed automatically in the background.
 *   - scripts/extract-pdf-text.ts — CLI backfill / re-extract safety net.
 *
 * Server/Node only (needs SUPABASE_SERVICE_ROLE_KEY) — never import from
 * client components. pdfjs and the legacy-R2 S3 client are imported lazily so
 * server-action modules that merely reference this file stay light.
 *
 * Pages with no extractable text (scanned images) are skipped — those records
 * simply aren't full-text searchable rather than being indexed as garbage.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toAllowedStorageUrl } from "@/lib/zima";
import { installDomMatrixPolyfill } from "./polyfills/dom-matrix";
import {
  outcomeFromError,
  outcomeFromResult,
  sourceDigest,
  writeIndexState,
  type IndexStatus,
} from "./indexing/state";

// pdfjs needs a `DOMMatrix` and Node has none; the standalone container has no
// way to get one either (see lib/polyfills/dom-matrix.ts). Installed at module
// scope so ANY route into this file is covered, and again immediately before
// the dynamic import in `extractPdfPages` — that is where it is load-bearing,
// and pdf.mjs throws during its own module evaluation if it is missing.
installDomMatrixPolyfill();

export const MAX_PAGE_CHARS = 8000; // cap outliers; a page of real prose is ~3-4k chars
export const MIN_PAGE_CHARS = 20;   // below this it's a blank/scanned page — skip
const INSERT_BATCH = 100;

export type PageRecordType = "book" | "research" | "publication";

export type IndexPdfResult =
  | { indexed: true; pages: number }
  | { indexed: false; reason: "unresolvable-url" | "fetch-failed" | "no-text-layer"; detail?: string };

/**
 * Strip anything that could forge a fake log line or terminal escape sequence
 * out of a value before it is interpolated into a log message. `recordId`
 * comes from a Server Action's `id` — a route/form parameter on the edit
 * path, not always a value this module minted itself — so CRLF and other
 * control characters must be removed before it reaches console.log/error.
 */
export function sanitizeLogId(value: string): string {
  return (
    value
      // Line breaks first, spelled out rather than folded into the control
      // range below. They are the actual forging vector — a `\r\n` in a record
      // id is what lets a caller append a whole fake log line — and stating
      // them explicitly is also what makes the removal legible to static
      // analysis, which cannot see a `\n` inside a unicode range and therefore
      // reported every one of these call sites as unsanitised (CodeQL
      // js/log-injection). Same output either way; the second pass already
      // covered them.
      .replace(/[\r\n]/g, "")
      // ...then every other C0/C1 control character: NUL, and the ESC that
      // starts a terminal colour sequence.
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
      .slice(0, 200)
  );
}

function serviceDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error("pdf-page-index: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Zima/public URLs pass through; legacy bare R2 keys get a short-lived
 * presigned GET (same behavior as the download route). Returns null when a
 * bare key can't be resolved (no R2 creds configured).
 */
export async function resolvePdfUrl(rawUrl: string): Promise<string | null> {
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl;
  if (!process.env.R2_ACCOUNT_ID) return null;
  try {
    const [{ S3Client, GetObjectCommand }, { getSignedUrl }] = await Promise.all([
      import("@aws-sdk/client-s3"),
      import("@aws-sdk/s3-request-presigner"),
    ]);
    const r2 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
    const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: rawUrl });
    return await getSignedUrl(r2, command, { expiresIn: 300 });
  } catch {
    return null;
  }
}

/** Per-page text via pdfjs. Empty/scanned pages are dropped. */
export async function extractPdfPages(bytes: ArrayBuffer): Promise<{ pageNo: number; content: string }[]> {
  installDomMatrixPolyfill();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Keep the loading task: pdfjs 6 dropped the PDFDocumentProxy.destroy()
  // shortcut, and tearing down the worker is only reachable from the task.
  // loadingTask.destroy() exists on 5 as well, so this is version-agnostic.
  const loadingTask = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const doc = await loadingTask.promise;
  const pages: { pageNo: number; content: string }[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const text = tc.items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((i: any) => (typeof i.str === "string" ? i.str : ""))
        .join(" ")
        // Postgres text columns reject NUL — some legacy-font PDFs emit them
        .replace(/\u0000/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length >= MIN_PAGE_CHARS) {
        pages.push({ pageNo: p, content: text.slice(0, MAX_PAGE_CHARS) });
      }
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages;
}

/**
 * Fetch a record's PDF, extract per-page text, and replace its book_pages
 * rows (idempotent). Throws on unexpected DB/parse errors; expected non-fatal
 * outcomes (unfetchable file, no text layer) come back as `indexed: false`.
 */
export async function indexPdfPages(opts: {
  recordType: PageRecordType;
  recordId: string;
  fileUrl: string;
  db?: SupabaseClient;
}): Promise<IndexPdfResult> {
  const db = opts.db ?? serviceDb();

  const resolved = await resolvePdfUrl(opts.fileUrl);
  if (!resolved) return { indexed: false, reason: "unresolvable-url" };

  // SSRF guard: `fileUrl` is a DB-sourced value; only fetch allow-listed
  // storage hosts (R2 presigned URLs and Zima/public URLs both qualify).
  // `toAllowedStorageUrl` returns the URL rebuilt on an allow-listed origin,
  // so what gets fetched is never the raw DB string.
  const url = toAllowedStorageUrl(resolved);
  if (!url) return { indexed: false, reason: "unresolvable-url" };

  const res = await fetch(url);
  if (!res.ok) return { indexed: false, reason: "fetch-failed", detail: `HTTP ${res.status}` };

  const pages = await extractPdfPages(await res.arrayBuffer());
  if (pages.length === 0) return { indexed: false, reason: "no-text-layer" };

  // Idempotent: replace any existing rows for this record.
  const { error: delError } = await db
    .from("book_pages")
    .delete()
    .eq("record_type", opts.recordType)
    .eq("record_id", opts.recordId);
  if (delError) throw new Error(delError.message);

  for (let i = 0; i < pages.length; i += INSERT_BATCH) {
    const batch = pages.slice(i, i + INSERT_BATCH).map((p) => ({
      record_type: opts.recordType,
      record_id: opts.recordId,
      page_no: p.pageNo,
      content: p.content,
    }));
    const { error } = await db.from("book_pages").insert(batch);
    if (error) throw new Error(error.message);
  }

  return { indexed: true, pages: pages.length };
}

/**
 * Background-safe wrapper for server actions: never throws.
 *
 * Call via `after(() => indexPdfPagesSafe(...))` so the admin's upload
 * response isn't blocked by PDF parsing. After a successful extraction it
 * chains chunk embedding (book_chunks, migration 0082) so new/replaced
 * uploads become passage-searchable without a manual backfill.
 *
 * EVERY outcome — success, either skip, and a thrown error — is recorded in
 * `resource_index_state` (migration 0133) before this returns. That write is
 * the point of the wrapper, not a nicety: this function's non-throwing
 * contract is what let a total production failure run for five weeks looking
 * exactly like a collection of scanned documents, because a `console.log` in a
 * container nobody tails is not an observation. A resource that reaches here
 * ends up with a status a human can be shown, or the failure to record THAT is
 * itself logged at error level.
 */
export async function indexPdfPagesSafe(
  recordType: PageRecordType,
  recordId: string,
  fileUrl: string,
): Promise<void> {
  const logId = sanitizeLogId(recordId);

  // One client for the extraction AND the bookkeeping, so the status row lands
  // in the same database the pages did. Built outside the try because without
  // a client there is nowhere to record an outcome — the one case this
  // function cannot make visible, so it is at least loud.
  let db: SupabaseClient;
  try {
    db = serviceDb();
  } catch (err) {
    console.error(
      "[pdf-index] %s:%s — no service client:",
      recordType,
      logId,
      err instanceof Error ? err.message : err,
    );
    return;
  }

  const digest = sourceDigest(fileUrl);
  let outcome: { status: IndexStatus; pages: number; detail?: string };
  let chunks = 0;

  try {
    const result = await indexPdfPages({ recordType, recordId, fileUrl, db });
    outcome = outcomeFromResult(result);

    if (result.indexed) {
      // Constant format string, values as arguments. A template literal makes
      // the whole message the format string, so a `%` inside a record id would
      // consume the next argument — and CodeQL reports it as a tainted format
      // string. The rendered line is identical.
      console.log("[pdf-index] %s:%s — indexed %d pages", recordType, logId, result.pages);
      const { embedRecordChunksSafe } = await import("./chunk-embed");
      const embedded = await embedRecordChunksSafe(recordType, recordId);
      chunks = embedded?.embedded ? embedded.chunks : 0;
    } else {
      console.log(
        "[pdf-index] %s:%s — skipped (%s)",
        recordType,
        logId,
        result.detail ? `${result.reason}: ${result.detail}` : result.reason,
      );
    }
  } catch (err) {
    outcome = outcomeFromError(err);
    console.error(
      "[pdf-index] %s:%s — failed:",
      recordType,
      logId,
      err instanceof Error ? err.message : err,
    );
  }

  await writeIndexState(db, {
    recordType,
    recordId,
    status: outcome.status,
    pages: outcome.pages,
    chunks,
    detail: outcome.detail,
    sourceDigest: digest,
  });
}
