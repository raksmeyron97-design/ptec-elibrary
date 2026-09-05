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

/**
 * Write budget per statement, in characters of page text.
 *
 * A fixed ROW count was the bug. `book_pages.content` carries a GIN trigram
 * index (0066), so the cost of an insert is proportional to the TEXT it
 * carries, not to the number of rows — and a row here is anything from 20 to
 * 8,000 characters. At the old batch of 100 rows, a book of dense prose sent
 * ~300 kB of text and ~100k trigrams into one statement and blew through
 * Postgres's statement timeout.
 *
 * That was not theoretical. Eight books in production are recorded `failed`
 * with `canceling statement due to statement timeout`, and three of them hold
 * EXACTLY 100 rows with a max page number of 101–103: one batch committed and
 * the next one died. A book of short pages sails through the same code.
 *
 * 120k characters is roughly a third of what was failing, and it bounds the
 * statement by the thing that actually costs — so a book of 8,000-character
 * pages sends 15 rows and a book of 300-character pages sends 400, and both
 * cost about the same.
 */
const INSERT_CHAR_BUDGET = 120_000;
/** Belt and braces: never send more rows than this regardless of size. */
const INSERT_MAX_ROWS = 400;
/** Pages deleted per statement — the same GIN cost applies in reverse. */
const DELETE_PAGE_STRIDE = 500;

/** Postgres `query_canceled` — a statement that ran out of time. Retryable
 *  with less work, unlike a constraint violation. */
const STATEMENT_TIMEOUT = "57014";

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
 * Split pages into statements bounded by the text they carry.
 *
 * A single page larger than the budget still goes out on its own — it is one
 * row and cannot be split further, and MAX_PAGE_CHARS already caps it well
 * below anything that could time out alone.
 */
export function budgetedBatches(
  pages: readonly { pageNo: number; content: string }[],
): { pageNo: number; content: string }[][] {
  const batches: { pageNo: number; content: string }[][] = [];
  let current: { pageNo: number; content: string }[] = [];
  let chars = 0;

  for (const page of pages) {
    const wouldExceed = chars + page.content.length > INSERT_CHAR_BUDGET;
    if (current.length > 0 && (wouldExceed || current.length >= INSERT_MAX_ROWS)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(page);
    chars += page.content.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Insert one batch, halving it and retrying if the database says the statement
 * ran out of time.
 *
 * The character budget is sized so this should not fire. It exists because the
 * budget is a guess about a database whose timeout this code does not control
 * and cannot see — a busy instance, a colder cache or a tightened
 * `statement_timeout` all move the line. Halving converges in a few steps and
 * ends at a single row, which is the smallest unit that exists; if THAT times
 * out the failure is real and belongs to a human, so it propagates.
 */
async function insertBatch(
  db: SupabaseClient,
  recordType: PageRecordType,
  recordId: string,
  batch: readonly { pageNo: number; content: string }[],
): Promise<void> {
  if (batch.length === 0) return;

  const rows = batch.map((p) => ({
    record_type: recordType,
    record_id: recordId,
    page_no: p.pageNo,
    content: p.content,
  }));

  const { error } = await db.from("book_pages").insert(rows);
  if (!error) return;
  if (error.code !== STATEMENT_TIMEOUT || batch.length === 1) {
    throw Object.assign(new Error(error.message), { code: error.code });
  }

  const mid = Math.floor(batch.length / 2);
  await insertBatch(db, recordType, recordId, batch.slice(0, mid));
  await insertBatch(db, recordType, recordId, batch.slice(mid));
}

/**
 * Remove every page row for a record, in bounded statements.
 *
 * Deleting 1,622 rows from a GIN-indexed table is the same shape of statement
 * as inserting them, so it gets the same treatment: page-number strides rather
 * than one unbounded `DELETE … WHERE record_id = …`. The final unbounded sweep
 * catches anything outside the observed range (a row from an older extraction
 * with more pages) and is cheap by then because the bulk is already gone.
 */
async function deleteRecordPages(
  db: SupabaseClient,
  recordType: PageRecordType,
  recordId: string,
): Promise<void> {
  const { data: highest } = await db
    .from("book_pages")
    .select("page_no")
    .eq("record_type", recordType)
    .eq("record_id", recordId)
    .order("page_no", { ascending: false })
    .limit(1)
    .maybeSingle<{ page_no: number }>();

  const maxPage = highest?.page_no ?? 0;
  for (let from = 0; from <= maxPage; from += DELETE_PAGE_STRIDE) {
    const { error } = await db
      .from("book_pages")
      .delete()
      .eq("record_type", recordType)
      .eq("record_id", recordId)
      .gte("page_no", from)
      .lt("page_no", from + DELETE_PAGE_STRIDE);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
  }

  const { error } = await db
    .from("book_pages")
    .delete()
    .eq("record_type", recordType)
    .eq("record_id", recordId);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
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
  await deleteRecordPages(db, opts.recordType, opts.recordId);

  try {
    for (const batch of budgetedBatches(pages)) {
      await insertBatch(db, opts.recordType, opts.recordId, batch);
    }
  } catch (err) {
    // A half-written index is worse than none, and it is what production
    // currently holds: three records carry pages 1–101 of a 400- to 700-page
    // book because the second insert batch timed out after the first
    // committed. `resource_index_state` says `failed`, correctly — but
    // /api/search/native reads `book_pages`, not that table, so those books
    // answer "found inside" for their first hundred pages and stay silent
    // about the rest, indistinguishable from a book that really does only
    // mention a phrase early on.
    //
    // So the record is emptied before the failure propagates. Absent is an
    // honest state that the reconciler will retry; truncated is a lie that
    // nothing detects.
    await deleteRecordPages(db, opts.recordType, opts.recordId).catch(() => {});
    throw err;
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
