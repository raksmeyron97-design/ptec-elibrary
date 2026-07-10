/* lib/chunk-embed.ts
 *
 * Page-level semantic embeddings: turns a record's book_pages rows (0066)
 * into overlapping text chunks and embeds them into book_chunks (0082),
 * which powers passage retrieval in /api/search and page-cited RAG in
 * /api/chat via match_book_chunks().
 *
 * Used from two places (mirroring lib/pdf-page-index.ts):
 *   - indexPdfPagesSafe() chains embedRecordChunksSafe() after page
 *     extraction, so new/replaced uploads are embedded automatically.
 *   - scripts/embed-library.ts — CLI backfill / repair safety net.
 *
 * Server/Node only (needs SUPABASE_SERVICE_ROLE_KEY + GEMINI_API_KEY) —
 * never import from client components.
 *
 * Khmer safety: chunk boundaries are chosen at whitespace when possible and
 * otherwise snapped to Intl.Segmenter grapheme-cluster boundaries, so a
 * split can never land inside a coeng stack or combining sequence. The text
 * itself is passed through untouched (no normalization).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PageRecordType } from "./pdf-page-index";

export const CHUNK_SIZE = 1000;    // target chars per chunk (~ well under the embed token cap)
export const CHUNK_OVERLAP = 150;  // chars carried into the next chunk for context
export const MIN_CHUNK_CHARS = 40; // fragments below this aren't worth a vector

const EMBED_BATCH = 16;      // texts per Gemini embedContent call
const EMBED_BATCH_DELAY_MS = 200; // pause between embed calls (rate-limit headroom)
const INSERT_BATCH = 40;     // rows per insert (each carries a 768-dim vector)
const PAGE_FETCH = 500;      // book_pages rows fetched per DB page

export type ChunkEmbedResult =
  | { embedded: true; chunks: number; pages: number }
  | { embedded: false; reason: "no-pages" | "no-chunks" };

export type PageChunk = { pageNo: number; chunkNo: number; content: string };

function serviceDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error("chunk-embed: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Rate-limit-aware embedding: free-tier gemini-embedding-001 enforces
// per-minute request/token quotas, so a burst of batches can 429 mid-record.
// Honor the server's suggested retryDelay when present, otherwise back off
// hard enough to clear a per-minute window. A PER-DAY quota error is not
// retryable — fail fast so callers don't spin for hours.
const QUOTA_BACKOFFS_MS = [2_000, 35_000, 65_000];

/** True when the error is an exhausted DAILY quota (waiting won't help). */
export function isDailyQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /perday/i.test(msg);
}

function retryDelayMs(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/retryDelay[^0-9]*(\d+)/i);
  return m ? Number(m[1]) * 1000 : null;
}

async function embedWithBackoff(texts: string[]): Promise<number[][]> {
  const { generateDocumentEmbeddings } = await import("./gemini-embeddings");
  let lastErr: unknown;
  for (let attempt = 0; ; attempt++) {
    try {
      return await generateDocumentEmbeddings(texts);
    } catch (err) {
      lastErr = err;
      if (isDailyQuotaError(err) || attempt >= QUOTA_BACKOFFS_MS.length) break;
      await sleep(retryDelayMs(err) ?? QUOTA_BACKOFFS_MS[attempt]);
    }
  }
  throw lastErr;
}

/** Grapheme-cluster start offsets for `text`, plus text.length as sentinel. */
function graphemeBoundaries(text: string): number[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const boundaries: number[] = [];
  for (const seg of segmenter.segment(text)) boundaries.push(seg.index);
  boundaries.push(text.length);
  return boundaries;
}

/** Largest boundary <= index (binary search). */
function floorBoundary(boundaries: number[], index: number): number {
  let lo = 0;
  let hi = boundaries.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (boundaries[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return boundaries[lo];
}

/**
 * Split one page's text into overlapping chunks. Every chunk is a verbatim
 * substring of the input (modulo edge trimming) — no lossy rewriting.
 */
export function chunkPageText(content: string): string[] {
  const text = content.trim();
  if (!text) return [];
  // Fits in one chunk (with slack so we don't emit a tiny tail chunk).
  if (text.length <= CHUNK_SIZE * 1.3) {
    return text.length >= MIN_CHUNK_CHARS ? [text] : [];
  }

  const boundaries = graphemeBoundaries(text);
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    if (text.length - start <= CHUNK_SIZE * 1.3) {
      chunks.push(text.slice(start).trim());
      break;
    }

    // Prefer breaking at whitespace within the last portion of the window;
    // Khmer text often has no spaces, so fall back to a grapheme boundary.
    const target = start + CHUNK_SIZE;
    let end = -1;
    for (let i = target; i > target - 200 && i > start; i--) {
      if (/\s/.test(text[i])) {
        end = i;
        break;
      }
    }
    if (end <= start) end = floorBoundary(boundaries, target);
    if (end <= start) end = target; // degenerate input; force progress

    chunks.push(text.slice(start, end).trim());

    let next = floorBoundary(boundaries, end - CHUNK_OVERLAP);
    // Snap the overlap start forward to a word boundary when one is near, so
    // chunks don't open mid-word ("esearcher…"). Spaceless Khmer is unaffected.
    for (let i = next; i < next + 40 && i < end - 1; i++) {
      if (/\s/.test(text[i])) {
        next = i + 1;
        break;
      }
    }
    if (next <= start) next = end; // overlap would stall — skip it
    start = next;
  }

  return chunks.filter((c) => c.length >= MIN_CHUNK_CHARS);
}

/** All of a record's pages chunked, with page numbers preserved. */
export function chunkPages(pages: { pageNo: number; content: string }[]): PageChunk[] {
  const out: PageChunk[] = [];
  for (const page of pages) {
    chunkPageText(page.content).forEach((content, chunkNo) => {
      out.push({ pageNo: page.pageNo, chunkNo, content });
    });
  }
  return out;
}

async function fetchRecordPages(
  db: SupabaseClient,
  recordType: PageRecordType,
  recordId: string,
): Promise<{ pageNo: number; content: string }[]> {
  const pages: { pageNo: number; content: string }[] = [];
  for (let from = 0; ; from += PAGE_FETCH) {
    const { data, error } = await db
      .from("book_pages")
      .select("page_no, content")
      .eq("record_type", recordType)
      .eq("record_id", recordId)
      .order("page_no", { ascending: true })
      .range(from, from + PAGE_FETCH - 1);
    if (error) throw new Error(`book_pages fetch failed: ${error.message}`);
    for (const row of data ?? []) pages.push({ pageNo: row.page_no, content: row.content });
    if (!data || data.length < PAGE_FETCH) break;
  }
  return pages;
}

/**
 * Chunk + embed one record's extracted pages into book_chunks (idempotent:
 * existing rows for the record are replaced). All embeddings are computed
 * BEFORE any DB write, so an embed failure can never leave the record with
 * its old rows deleted (same delete-then-insert caution as book_pages).
 */
export async function embedRecordChunks(opts: {
  recordType: PageRecordType;
  recordId: string;
  db?: SupabaseClient;
  onProgress?: (done: number, total: number) => void;
}): Promise<ChunkEmbedResult> {
  const db = opts.db ?? serviceDb();

  const pages = await fetchRecordPages(db, opts.recordType, opts.recordId);
  if (pages.length === 0) return { embedded: false, reason: "no-pages" };

  const chunks = chunkPages(pages);
  if (chunks.length === 0) return { embedded: false, reason: "no-chunks" };

  const vectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const texts = chunks.slice(i, i + EMBED_BATCH).map((c) => c.content);
    vectors.push(...(await embedWithBackoff(texts)));
    opts.onProgress?.(Math.min(i + EMBED_BATCH, chunks.length), chunks.length);
    if (i + EMBED_BATCH < chunks.length) await sleep(EMBED_BATCH_DELAY_MS);
  }

  const { error: delError } = await db
    .from("book_chunks")
    .delete()
    .eq("record_type", opts.recordType)
    .eq("record_id", opts.recordId);
  if (delError) throw new Error(delError.message);

  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const batch = chunks.slice(i, i + INSERT_BATCH).map((c, k) => ({
      record_type: opts.recordType,
      record_id: opts.recordId,
      page_no: c.pageNo,
      chunk_no: c.chunkNo,
      content: c.content,
      embedding: vectors[i + k],
    }));
    const { error } = await db.from("book_chunks").insert(batch);
    if (error) throw new Error(error.message);
  }

  return { embedded: true, chunks: chunks.length, pages: pages.length };
}

/**
 * Background-safe wrapper: never throws, only logs. Chained from
 * indexPdfPagesSafe() so upload responses aren't blocked and an embedding
 * failure (e.g. Gemini outage) degrades to "no passages yet" — the backfill
 * script repairs those records on its next run.
 */
export async function embedRecordChunksSafe(
  recordType: PageRecordType,
  recordId: string,
): Promise<void> {
  try {
    const result = await embedRecordChunks({ recordType, recordId });
    if (result.embedded) {
      console.log(`[chunk-embed] ${recordType}:${recordId} — embedded ${result.chunks} chunks from ${result.pages} pages`);
    } else {
      console.log(`[chunk-embed] ${recordType}:${recordId} — skipped (${result.reason})`);
    }
  } catch (err) {
    console.error(`[chunk-embed] ${recordType}:${recordId} — failed:`, err instanceof Error ? err.message : err);
  }
}
