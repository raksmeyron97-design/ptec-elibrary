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

export const MAX_PAGE_CHARS = 8000; // cap outliers; a page of real prose is ~3-4k chars
export const MIN_PAGE_CHARS = 20;   // below this it's a blank/scanned page — skip
const INSERT_BATCH = 100;

export type PageRecordType = "book" | "research" | "publication";

export type IndexPdfResult =
  | { indexed: true; pages: number }
  | { indexed: false; reason: "unresolvable-url" | "fetch-failed" | "no-text-layer"; detail?: string };

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
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
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
    await doc.destroy();
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

  const url = await resolvePdfUrl(opts.fileUrl);
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
 * Background-safe wrapper for server actions: never throws, only logs.
 * Call via `after(() => indexPdfPagesSafe(...))` so the admin's upload
 * response isn't blocked by PDF parsing.
 */
export async function indexPdfPagesSafe(
  recordType: PageRecordType,
  recordId: string,
  fileUrl: string,
): Promise<void> {
  try {
    const result = await indexPdfPages({ recordType, recordId, fileUrl });
    if (result.indexed) {
      console.log(`[pdf-index] ${recordType}:${recordId} — indexed ${result.pages} pages`);
    } else {
      console.log(`[pdf-index] ${recordType}:${recordId} — skipped (${result.reason}${result.detail ? `: ${result.detail}` : ""})`);
    }
  } catch (err) {
    console.error(`[pdf-index] ${recordType}:${recordId} — failed:`, err instanceof Error ? err.message : err);
  }
}
