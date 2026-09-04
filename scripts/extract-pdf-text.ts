/* scripts/extract-pdf-text.ts
 *
 * Backfills book_pages with per-page text from every published
 * book/thesis/publication PDF, powering "found inside" page hits in
 * /api/search/native. The actual extraction lives in lib/pdf-page-index.ts,
 * which the upload server actions also call — new uploads are indexed
 * automatically, so this script is the backfill / repair safety net (e.g.
 * records whose background indexing was interrupted, or after changing the
 * extraction rules).
 *
 * Pages with no extractable text (scanned images) are skipped — those records
 * simply aren't full-text searchable rather than being indexed as garbage.
 * Gemini-OCR for scanned Khmer PDFs is a known possible follow-up,
 * deliberately out of scope here (cost).
 *
 * Idempotent: already-indexed records are skipped unless --all is passed
 * (which re-extracts everything).
 *
 * Run:
 *   npx tsx scripts/extract-pdf-text.ts          # only unindexed records
 *   npx tsx scripts/extract-pdf-text.ts --all    # re-extract everything
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and the R2_*
 * vars for legacy bare-key PDFs (same as check-file-health.ts).
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import { indexPdfPages, type PageRecordType } from "../lib/pdf-page-index";
import {
  RETRYABLE_STATUSES,
  outcomeFromError,
  outcomeFromResult,
  sourceDigest,
  writeIndexState,
  type IndexStatus,
} from "../lib/indexing/state";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const REEXTRACT_ALL = process.argv.includes("--all");

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Target = { recordType: PageRecordType; recordId: string; title: string; rawUrl: string };

/**
 * All indexed "type:id" pairs. book_pages has one row per PAGE (tens of
 * thousands), and PostgREST caps un-ranged selects at 1000 rows — an
 * un-paginated select silently misses most records and causes a full
 * needless re-extract. Page through explicitly.
 */
async function fetchIndexedRecordKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("book_pages")
      .select("record_type, record_id")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`book_pages scan failed: ${error.message}`);
    for (const r of data ?? []) keys.add(`${r.record_type}:${r.record_id}`);
    if (!data || data.length < PAGE) break;
  }
  return keys;
}

/**
 * Records whose most recent outcome was PERMANENT — a PDF that parsed cleanly
 * and had no text on any page. Re-fetching and re-parsing a scan on every
 * sweep costs bandwidth and CPU to learn the same thing again, so they are
 * skipped unless --all.
 *
 * `unfetchable` and `failed` are deliberately NOT in this set: those are a
 * storage blip and a bug respectively, and both are exactly what a repair run
 * exists to retry.
 */
async function fetchPermanentlySkippedKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  const { data, error } = await db
    .from("resource_index_state")
    .select("record_type, record_id, status");
  if (error) {
    // Before migration 0133 the table is absent. Fall back to the old
    // behaviour (retry everything) rather than failing the backfill.
    console.warn(`resource_index_state unavailable (${error.message}); not skipping any scans.`);
    return keys;
  }
  for (const r of data ?? []) {
    const status = r.status as IndexStatus;
    if (!RETRYABLE_STATUSES.has(status) && status !== "indexed") {
      keys.add(`${r.record_type}:${r.record_id}`);
    }
  }
  return keys;
}

async function main() {
  const [{ data: books }, { data: theses }, { data: publications }, indexedKeys, permanentKeys] =
    await Promise.all([
      db.from("books").select("id, title, book_files(file_url)").eq("is_published", true),
      db.from("research_reports").select("id, title, file_url").eq("is_published", true),
      db.from("publications").select("id, title, pdf_url").eq("is_published", true),
      REEXTRACT_ALL ? Promise.resolve(new Set<string>()) : fetchIndexedRecordKeys(),
      REEXTRACT_ALL ? Promise.resolve(new Set<string>()) : fetchPermanentlySkippedKeys(),
    ]);

  /* Two reasons to leave a record alone: it already has pages, or we already
     established it has none to get. Everything else — including a record that
     failed last time — is a target. */
  const alreadyIndexed = new Set<string>([...indexedKeys, ...permanentKeys]);

  const targets: Target[] = [];
  for (const b of books ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfUrl = (b.book_files as any[])?.find((f) => f.file_url)?.file_url;
    if (pdfUrl && !alreadyIndexed.has(`book:${b.id}`)) {
      targets.push({ recordType: "book", recordId: b.id, title: b.title, rawUrl: pdfUrl });
    }
  }
  for (const r of theses ?? []) {
    if (r.file_url && !alreadyIndexed.has(`research:${r.id}`)) {
      targets.push({ recordType: "research", recordId: r.id, title: r.title, rawUrl: r.file_url });
    }
  }
  for (const p of publications ?? []) {
    if (p.pdf_url && !alreadyIndexed.has(`publication:${p.id}`)) {
      targets.push({ recordType: "publication", recordId: p.id, title: p.title, rawUrl: p.pdf_url });
    }
  }

  console.log(`${targets.length} records to extract (${alreadyIndexed.size ? `${alreadyIndexed.size / 1} already indexed, skipped` : "fresh run"})…`);

  let done = 0, indexedCount = 0, skippedNoText = 0, failed = 0, totalPages = 0;
  for (const t of targets) {
    done++;
    const label = `[${done}/${targets.length}] ${t.title.slice(0, 50)}`;
    /* Every branch below records an outcome in resource_index_state, so the
       admin Data Quality panel reflects this run. A CLI sweep that indexed
       nothing and a CLI sweep that was never run must not look the same
       there — that equivalence is the defect this table was added for. */
    let outcome: { status: IndexStatus; pages: number; detail?: string };
    try {
      const result = await indexPdfPages({
        recordType: t.recordType,
        recordId: t.recordId,
        fileUrl: t.rawUrl,
        db,
      });
      outcome = outcomeFromResult(result);
      if (result.indexed) {
        totalPages += result.pages;
        indexedCount++;
        console.log(`${label} — ${result.pages} pages`);
      } else if (result.reason === "no-text-layer") {
        skippedNoText++;
        console.log(`${label} — no text layer (scanned?)`);
      } else {
        failed++;
        console.log(`${label} — SKIP (${result.reason}${result.detail ? `: ${result.detail}` : ""})`);
      }
    } catch (err) {
      outcome = outcomeFromError(err);
      failed++;
      console.log(`${label} — FAILED: ${err instanceof Error ? err.message.slice(0, 100) : err}`);
    }

    await writeIndexState(db, {
      recordType: t.recordType,
      recordId: t.recordId,
      status: outcome.status,
      pages: outcome.pages,
      // Chunk embedding is scripts/embed-library.ts's job; claiming a count
      // here would overstate what this run produced.
      chunks: 0,
      detail: outcome.detail,
      sourceDigest: sourceDigest(t.rawUrl),
    });
  }

  console.log(`\nDone. ${indexedCount} records indexed (${totalPages} pages), ${skippedNoText} had no text layer, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
