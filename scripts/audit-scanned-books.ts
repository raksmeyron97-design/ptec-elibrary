/* scripts/audit-scanned-books.ts
 *
 * Which published books would OCR actually help?
 *
 *   npx tsx scripts/audit-scanned-books.ts                  # report + write the queue
 *   npx tsx scripts/audit-scanned-books.ts --dry-run        # report only, write nothing
 *   npx tsx scripts/audit-scanned-books.ts --json           # machine-readable report
 *   npx tsx scripts/audit-scanned-books.ts --all            # include non-candidates
 *   npx tsx scripts/audit-scanned-books.ts --queue PATH     # somewhere other than the default
 *
 * READ-ONLY against the database. The only thing it writes is the queue file,
 * and `--dry-run` suppresses even that. It never touches `book_pages`,
 * `resource_index_state`, or any other table.
 *
 * ── What it is actually measuring ───────────────────────────────────────────
 *
 * Three independent signals, combined by `assessOcrCandidate` in
 * lib/ocr/candidates.ts (pure, and where the reasoning lives):
 *
 *   1. how much text `book_pages` holds for the record, per page
 *   2. what the last extraction attempt concluded (`resource_index_state`) and
 *      WHOSE problem it was (`failure_kind`, 0134)
 *   3. whether the book is in `scripts/damaged-khmer-books.json` for a reason
 *      no whitespace repair can reach
 *
 * The rule that keeps this honest is that a book is NOT a candidate merely
 * because it has no pages. Four different situations produce zero rows, and
 * three of them are about us rather than about the document — see the header
 * of lib/ocr/candidates.ts. Queueing those would spend hours of CPU rewriting
 * books whose real problem was a shell variable.
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assessOcrCandidate,
  pageStatsFromCounts,
  summarizePageText,
  CANDIDATE_CALIBRATION,
  type OcrBlockerReason,
  type OcrCandidateReason,
  type PageTextStats,
} from "../lib/ocr/candidates";
import type { TextDamageReason } from "../lib/semantic/text-quality";
import type { IndexStatus } from "../lib/indexing/state";
import type { FailureKind } from "../lib/indexing/retry";
import { describeTarget, judgeEnvironment, PROBE_SAMPLE_SIZE } from "../lib/indexing/environment";

const ARGV = process.argv.slice(2);
const has = (flag: string) => ARGV.includes(flag);
const valueOf = (flag: string): string | undefined => {
  const i = ARGV.indexOf(flag);
  return i >= 0 && i + 1 < ARGV.length ? ARGV[i + 1] : undefined;
};

const DRY_RUN = has("--dry-run");
const AS_JSON = has("--json");
const SHOW_ALL = has("--all");
const LIMIT = Number(valueOf("--limit") ?? "0") || 0;
const QUEUE_PATH = path.resolve(
  valueOf("--queue") ??
    process.env.OCR_QUEUE_PATH ??
    path.join(__dirname, "scanned-books-queue.json"),
);
const DAMAGE_PATH = path.join(__dirname, "damaged-khmer-books.json");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/** PostgREST caps an unranged select at 1000 rows; everything here pages. */
const PAGE = 1000;

/**
 * Most pages of one book whose text is fetched for the character statistics.
 *
 * A bound rather than a sample: the shortlist is books whose pages are almost
 * all short, so this rarely binds at all — and when it does, on a very long
 * book, the EXACT counts still come from stage 1 and only the mean is computed
 * over the first N pages, which is stated where it is printed.
 */
const TEXT_SAMPLE_CAP = 2000;

type BookRow = {
  id: string;
  slug: string | null;
  title: string;
  language: string | null;
  fileUrl: string | null;
};

type DamageEntry = { slug: string; title: string; reasons: TextDamageReason[] };

async function fetchPublishedBooks(): Promise<BookRow[]> {
  const rows: BookRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("books")
      .select("id, slug, title, language, book_files(file_url)")
      .eq("is_published", true)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`books scan failed: ${error.message}`);
    for (const b of data ?? []) {
      const files = (b.book_files ?? []) as Array<{ file_url: string | null }>;
      rows.push({
        id: b.id as string,
        slug: (b.slug as string | null) ?? null,
        title: (b.title as string) ?? "",
        language: (b.language as string | null) ?? null,
        fileUrl: files.map((f) => f.file_url).find((u): u is string => !!u) ?? null,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/**
 * Rows per book in `book_pages`, optionally only the SHORT ones.
 *
 * ── Why a LIKE pattern and not `length(content)` ────────────────────────────
 *
 * PostgREST exposes neither scalar functions in `select` nor aggregates on
 * this deployment (both were tried against the real API and refused:
 * "failed to parse select parameter" and "Use of aggregate functions is not
 * allowed"). What it does support is `LIKE`, and `_` matches exactly one
 * character — so a pattern of thirty underscores followed by `%` is precisely
 * "content is at least thirty characters long", evaluated inside Postgres.
 *
 * That matters more than it looks: it is the difference between counting the
 * collection's short pages in two scans of a uuid column and pulling every
 * character of every book across the wire to measure a string length in
 * JavaScript. `_` counts CHARACTERS rather than bytes, so Khmer counts the
 * same as ASCII, which is the only reason this is a legitimate measure for a
 * collection that is mostly Khmer.
 */
async function countPages(shortOnly: boolean): Promise<Map<string, number>> {
  const atLeastLowFloor = `${"_".repeat(CANDIDATE_CALIBRATION.lowTextPageChars)}%`;
  const counts = new Map<string, number>();
  const label = shortOnly ? "short pages" : "all pages";
  let scanned = 0;
  for (let from = 0; ; from += PAGE) {
    let query = db
      .from("book_pages")
      .select("record_id")
      .eq("record_type", "book")
      .order("record_id", { ascending: true })
      .order("page_no", { ascending: true })
      .range(from, from + PAGE - 1);
    if (shortOnly) query = query.not("content", "like", atLeastLowFloor);

    const { data, error } = await query;
    if (error) throw new Error(`book_pages scan failed: ${error.message}`);
    for (const row of data ?? []) {
      const id = row.record_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    scanned += data?.length ?? 0;
    // `book_pages` holds one row per PAGE — 210,806 of them in production, so
    // this is ~200 sequential round trips. Progress goes to stderr so a long
    // scan is legible without polluting `--json` on stdout.
    if (scanned % (PAGE * 25) === 0) {
      process.stderr.write(`  …${label}: ${scanned} rows over ${counts.size} book(s)\n`);
    }
    if (!data || data.length < PAGE) break;
  }
  process.stderr.write(`  ${label}: ${scanned} rows over ${counts.size} book(s)\n`);
  return counts;
}

/**
 * The per-page character counts for ONE book.
 *
 * Called only for the shortlist — books whose exact short-page ratio already
 * admits the low-text signal, plus the books in the damage catalog, whose
 * numbers belong in the queue an operator reads. Everywhere else the text is
 * never fetched and the character measures stay `null`.
 */
async function fetchPageLengths(recordId: string, cap: number): Promise<number[]> {
  const lengths: number[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const { data, error } = await db
      .from("book_pages")
      .select("content")
      .eq("record_type", "book")
      .eq("record_id", recordId)
      .order("page_no", { ascending: true })
      .range(from, Math.min(from + PAGE, cap) - 1);
    if (error) throw new Error(`book_pages read failed for ${recordId}: ${error.message}`);
    for (const row of data ?? []) lengths.push(String(row.content ?? "").length);
    if (!data || data.length < PAGE) break;
  }
  return lengths;
}

async function fetchIndexState(): Promise<
  Map<string, { status: IndexStatus; failureKind: FailureKind | null }>
> {
  const states = new Map<string, { status: IndexStatus; failureKind: FailureKind | null }>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("resource_index_state")
      .select("record_id, status, failure_kind")
      .eq("record_type", "book")
      .order("record_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      // Before migration 0133 the table is absent. Report it rather than
      // guessing: without it every zero-page book looks like "never
      // extracted", which is the conservative answer and is also the honest
      // one — we genuinely do not know what was tried.
      console.warn(`resource_index_state unavailable (${error.message}); treating all states as unknown.`);
      return states;
    }
    for (const row of data ?? []) {
      states.set(row.record_id as string, {
        status: row.status as IndexStatus,
        failureKind: (row.failure_kind as FailureKind | null) ?? null,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return states;
}

function loadDamageCatalog(): Map<string, DamageEntry> {
  const bySlug = new Map<string, DamageEntry>();
  if (!fs.existsSync(DAMAGE_PATH)) return bySlug;
  try {
    const parsed = JSON.parse(fs.readFileSync(DAMAGE_PATH, "utf8")) as DamageEntry[];
    for (const entry of parsed) {
      if (entry?.slug) bySlug.set(entry.slug, entry);
    }
  } catch (err) {
    console.warn(`damaged-khmer-books.json could not be read (${err instanceof Error ? err.message : err}).`);
  }
  return bySlug;
}

type Assessment = {
  id: string;
  slug: string | null;
  title: string;
  language: string | null;
  hasPdf: boolean;
  stats: PageTextStats;
  indexStatus: IndexStatus | null;
  failureKind: FailureKind | null;
  damageReasons: TextDamageReason[];
  candidate: boolean;
  reasons: OcrCandidateReason[];
  blockers: OcrBlockerReason[];
};

/** One decimal, or null when the value was never measured. */
function round1(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(1));
}

function tally<T extends string>(values: readonly T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

async function main() {
  const target = describeTarget();

  const [books, totalPages, shortPages, states] = await Promise.all([
    fetchPublishedBooks(),
    countPages(false),
    countPages(true),
    fetchIndexState(),
  ]);
  const damage = loadDamageCatalog();

  /* The same guard `scripts/extract-pdf-text.ts` runs, for the same reason.
     This script writes no database rows, so a mismatch cannot corrupt the
     library — but a queue built where no storage URL resolves would send the
     OCR run straight into STORAGE_UNRESOLVABLE on every book, and the queue
     file would look like a finding about the collection. */
  const verdict = judgeEnvironment(
    books
      .map((b) => b.fileUrl)
      .filter((u): u is string => !!u)
      .slice(0, PROBE_SAMPLE_SIZE),
  );

  /* Stage 1 — exact, and free of page text. Stage 2 fetches content for the
     shortlist only: books whose short-page ratio already admits the low-text
     signal, and books the damage catalog names (their numbers go into a queue
     an operator reads, so "unmeasured" would not do). */
  const assessments: Assessment[] = [];
  let sampled = 0;

  for (const book of books) {
    const pages = totalPages.get(book.id) ?? 0;
    const low = shortPages.get(book.id) ?? 0;
    const damageReasons = (book.slug ? damage.get(book.slug)?.reasons : undefined) ?? [];
    const state = states.get(book.id) ?? null;

    let stats: PageTextStats = pageStatsFromCounts(pages, low);
    const needsText =
      pages > 0 &&
      (damageReasons.length > 0 ||
        stats.lowTextPageRatio >= CANDIDATE_CALIBRATION.lowTextPageRatioFloor);
    if (needsText) {
      stats = summarizePageText(await fetchPageLengths(book.id, TEXT_SAMPLE_CAP));
      sampled++;
      // The cap can truncate a very long book; the exact counts stay exact.
      stats = { ...stats, pages, lowTextPages: low, lowTextPageRatio: pages > 0 ? low / pages : 0 };
    }

    const result = assessOcrCandidate({
      hasPdf: !!book.fileUrl,
      stats,
      indexState: state,
      damageReasons,
    });
    assessments.push({
      id: book.id,
      slug: book.slug,
      title: book.title,
      language: book.language,
      hasPdf: !!book.fileUrl,
      stats,
      indexStatus: state?.status ?? null,
      failureKind: state?.failureKind ?? null,
      damageReasons,
      ...result,
    });
  }

  const candidates = assessments.filter((a) => a.candidate);
  const limited = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates;

  const queue = {
    generatedAt: new Date().toISOString(),
    source: "audit-scanned-books",
    // The database this was measured against, so an operator cannot run an
    // apply pass against a different one by accident. Never a key, never a
    // URL with credentials — the same label describeTarget() prints.
    target: target.label,
    count: limited.length,
    books: limited.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      language: a.language,
      candidateReasons: a.reasons,
      blockers: a.blockers,
      indexStatus: a.indexStatus,
      failureKind: a.failureKind,
      bookPageCount: a.stats.pages,
      meanCharsPerPage: round1(a.stats.meanCharsPerPage),
      medianCharsPerPage: a.stats.medianCharsPerPage,
      maxCharsPerPage: a.stats.maxCharsPerPage,
      lowTextPageRatio: Number(a.stats.lowTextPageRatio.toFixed(3)),
      damageReasons: a.damageReasons,
    })),
  };
  // The file URL is deliberately NOT in the queue. A storage URL is a
  // permanent, credential-free download link (docs/BOOK-DOWNLOAD-PERMISSION.md)
  // and this file is meant to be readable, diffable and shareable. The OCR run
  // resolves the URL from the book id at the moment it needs it.

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        {
          target: target.label,
          environment: { ok: verdict.ok, hosts: verdict.hosts, reason: verdict.reason },
          totals: {
            publishedBooks: assessments.length,
            candidates: candidates.length,
            byReason: tally(candidates.flatMap((a) => a.reasons)),
            byBlocker: tally(assessments.filter((a) => !a.candidate).flatMap((a) => a.blockers)),
          },
          books: (SHOW_ALL ? assessments : candidates).map((a) => ({
            slug: a.slug,
            title: a.title,
            candidate: a.candidate,
            reasons: a.reasons,
            blockers: a.blockers,
            pages: a.stats.pages,
            meanCharsPerPage: round1(a.stats.meanCharsPerPage),
          })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`\nOCR candidate audit — ${target.label}`);
    console.log(`Storage hosts in the sample: ${verdict.hosts.join(", ") || "(none)"}`);
    if (!verdict.ok) {
      console.log(`\n⚠ ENVIRONMENT MISMATCH — ${verdict.reason}`);
      console.log("  The queue below would fail on every book. Fix the storage config first.\n");
    }
    console.log(`\nPublished books: ${assessments.length}`);
    console.log(`Page text read:  ${sampled} book(s) (the rest were counted, never fetched)`);
    console.log(`OCR candidates:  ${candidates.length}\n`);

    console.log("Candidate reasons (a book may carry several):");
    for (const [reason, n] of Object.entries(tally(candidates.flatMap((a) => a.reasons))).sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`  ${String(n).padStart(5)}  ${reason}`);
    }

    console.log("\nWhy the rest were not queued:");
    for (const [reason, n] of Object.entries(
      tally(assessments.filter((a) => !a.candidate).flatMap((a) => a.blockers)),
    ).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(5)}  ${reason}`);
    }

    const shown = SHOW_ALL ? assessments : limited;
    if (shown.length > 0) {
      console.log(`\n${SHOW_ALL ? "All books" : "Queued"} (${shown.length}):\n`);
      for (const [i, a] of shown.entries()) {
        const mark = a.candidate ? "▸" : "·";
        console.log(`${mark} [${i + 1}] ${a.title.slice(0, 64)}`);
        console.log(`      slug:    ${a.slug ?? "(none)"}`);
        console.log(
          `      pages:   ${a.stats.pages}` +
            (a.stats.pages > 0
              ? `  ${(a.stats.lowTextPageRatio * 100).toFixed(0)}% under ` +
                `${CANDIDATE_CALIBRATION.lowTextPageChars} chars` +
                (a.stats.meanCharsPerPage === null
                  ? " (text not read)"
                  : `, mean ${a.stats.meanCharsPerPage.toFixed(0)} chars/page`)
              : ""),
        );
        console.log(`      state:   ${a.indexStatus ?? "never attempted"}${a.failureKind ? ` (${a.failureKind})` : ""}`);
        if (a.reasons.length > 0) console.log(`      reasons: ${a.reasons.join(", ")}`);
        if (a.blockers.length > 0) console.log(`      notes:   ${a.blockers.join(", ")}`);
      }
    }
  }

  if (DRY_RUN) {
    console.log(`\nDRY RUN — queue not written (would hold ${limited.length} book(s) at ${QUEUE_PATH}).`);
    return;
  }

  fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
  fs.writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  console.log(`\nQueue written: ${QUEUE_PATH} (${limited.length} book(s))`);
  console.log("Next: npx tsx scripts/ocr-khmer-tesseract.ts --limit 1 --dry-run\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
