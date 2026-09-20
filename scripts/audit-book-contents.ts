// scripts/audit-book-contents.ts
//
//   npx tsx scripts/audit-book-contents.ts                 # counts only
//   npx tsx scripts/audit-book-contents.ts --books 40      # a smaller sample
//
// SEO5-08 STEP 1. A COUNTS-ONLY dry run: how many books actually have a
// detectable table of contents, and how much of it survives the text-health
// gate. Nothing is built on top of this until the numbers say it is worth
// building.
//
// ── Why a dry run at all ─────────────────────────────────────────────────────
//
// Lesson titles are what students type into Google, and a book page today is
// a catalogue record. A per-book contents section would change that — IF the
// contents pages are there and readable. Two reasons to doubt it: the
// collection is largely Khmer, and Khmer contents detection was broken in two
// independent ways until this commit (an English-only heading regex, and
// `\d` being ASCII-only so Khmer page numbers counted as zero locators).
//
// ── READ-ONLY, and bounded by construction ───────────────────────────────────
//
//   * Only `.select()` calls appear in this file. There is no insert, update,
//     upsert, delete or rpc anywhere in it — enforced by a source scan in
//     lib/semantic/contents-dry-run.test.ts rather than by promise.
//     (A `BEGIN ... READ ONLY` is not reachable through PostgREST; absence of
//     a write path is the guarantee this script can actually offer, and it is
//     stated rather than implied.)
//   * Every request carries a hard timeout.
//   * Books are read in batches of at most BOOK_BATCH, with a pause between.
//   * For each book only the FRONT window (pages 1-30) and the BACK window
//     (the last 15 pages) are fetched — never the whole document.
//   * Output is counts. No page text, no titles, no slugs are printed.
//
// ── Front and back are counted separately, on purpose ────────────────────────
//
// `classifyPage()` decides "contents" by POSITION: the same page at the back
// of the book is `back-matter`. Khmer books often print មាតិកា at the END, so
// a run that counted only `contents` would under-report Khmer by however many
// do that — and would look like "Khmer detection still broken" when the truth
// is "Khmer books put it somewhere else".

import { createClient } from "@supabase/supabase-js";
import { classifyPage, type PageInput } from "../lib/semantic/passages";
import { analyzeTextHealth } from "../lib/semantic/text-quality";

// `export {}` at the foot: without it TypeScript treats a script with no
// top-level import as a global script and its consts collide with siblings.

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

/** Pages 1-N at the front. */
const FRONT_WINDOW = 30;
/** The last N pages. */
const BACK_WINDOW = 15;
/** Books per batch. */
const BOOK_BATCH = 100;
/** Pause between batches, so a long run is not a load test. */
const BATCH_PAUSE_MS = 750;
/** Per-request deadline. */
const REQUEST_TIMEOUT_MS = 30_000;

const MAX_BOOKS = Number(flag("books", "0"));

const url = process.env.AUDIT_SUPABASE_URL ?? "";
const key = process.env.AUDIT_SUPABASE_SERVICE_ROLE_KEY ?? "";

function hostOf(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return "(unparseable)";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = { record_id: string; page_no: number; content: string | null };

type Tally = {
  books: number;
  booksWithPages: number;
  frontContents: number;
  backContents: number;
  eitherContents: number;
  locatorsUpperBound: number;
  locatorsHealthy: number;
  booksHealthyContents: number;
};

const blank = (): Tally => ({
  books: 0,
  booksWithPages: 0,
  frontContents: 0,
  backContents: 0,
  eitherContents: 0,
  locatorsUpperBound: 0,
  locatorsHealthy: 0,
  booksHealthyContents: 0,
});

/**
 * An UPPER BOUND on the entries a contents page could yield.
 *
 * `book_pages.content` is stored WHITESPACE-COLLAPSED — measured on
 * production, 0 of 25 sampled pages contained a newline, average length 306
 * characters. So a contents page is one long run,
 * "Chapter 1 Introduction 1 Chapter 2 Method 12 …", and a line-based parser
 * returns zero on every book. The first version of this script did exactly
 * that and reported 1 entry across 9 Khmer books.
 *
 * Without line breaks there is no reliable title/locator boundary, so this
 * counts LOCATORS — a bare number preceded by at least one word — and calls
 * the result an upper bound rather than an entry count. That is enough for a
 * go/no-go, and it is deliberately NOT presented as a parser: shipping
 * titles would need the boundary problem solved, which is the real finding
 * of this dry run.
 */
function countLocatorsUpperBound(content: string): number {
  const tokens = content.split(/\s+/).filter(Boolean);
  let n = 0;
  for (let i = 1; i < tokens.length; i++) {
    if (NUMERIC.test(tokens[i]) && !NUMERIC.test(tokens[i - 1])) n++;
  }
  return n;
}

const NUMERIC = /^[\d០-៩]{1,4}[.,)។]?$/u;

async function run(): Promise<void> {
  // ── The target, printed FIRST ──────────────────────────────────────────
  console.log("\n── SEO5-08 contents dry run ─────────────────────────────");
  console.log(`  target host : ${hostOf(url) || "(unset)"}`);
  console.log(`  mode        : READ-ONLY (no write path in this file)`);
  console.log(`  windows     : front 1-${FRONT_WINDOW}, back last ${BACK_WINDOW}`);
  console.log(`  batching    : ${BOOK_BATCH} books, ${BATCH_PAUSE_MS}ms apart`);
  console.log(`  output      : counts only\n`);

  if (!url || !key) {
    console.error(
      "Set AUDIT_SUPABASE_URL and AUDIT_SUPABASE_SERVICE_ROLE_KEY for the database you\n" +
        "intend to read. They are deliberately NOT the app's own variables, so a stray\n" +
        ".env cannot point this at something you did not choose.\n",
    );
    process.exit(2);
  }

  const db = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) =>
        fetch(input as RequestInfo, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    },
  });

  // Which books have extracted text at all.
  //
  // PAGINATED. PostgREST caps a response at its `max-rows` setting (1,000
  // here) and `.limit(200000)` does NOT raise it — it silently returns the
  // first 1,000. The first run of this script reported "11 books have
  // extracted pages" against a table holding 234,571 rows, and looked like
  // a finding about the collection rather than a bug in the reader.
  const PAGE = 1000;
  const idSet = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("book_pages")
      .select("record_id")
      .eq("record_type", "book")
      .order("record_id", { ascending: true })
      .order("page_no", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`could not list indexed books: ${error.message}`);
      process.exit(1);
    }
    for (const r of data ?? []) idSet.add(r.record_id as string);
    if (!data || data.length < PAGE) break;
    if (from > 0 && from % 50_000 === 0) process.stdout.write(`  …scanned ${from} page rows\n`);
  }
  const allIds = [...idSet];
  const ids = MAX_BOOKS > 0 ? allIds.slice(0, MAX_BOOKS) : allIds;
  console.log(`${allIds.length} books have extracted pages; sampling ${ids.length}.\n`);

  const km = blank();
  const other = blank();
  let scriptUnknown = 0;

  for (let i = 0; i < ids.length; i += BOOK_BATCH) {
    const batch = ids.slice(i, i + BOOK_BATCH);

    // Highest page number per book, so the BACK window can be bounded.
    const { data: maxRows, error: maxErr } = await db
      .from("book_pages")
      .select("record_id, page_no")
      .eq("record_type", "book")
      .in("record_id", batch)
      .order("page_no", { ascending: false })
      .limit(batch.length * 400);
    if (maxErr) {
      console.error(`batch ${i / BOOK_BATCH + 1}: ${maxErr.message}`);
      continue;
    }
    const lastPage = new Map<string, number>();
    for (const r of maxRows ?? []) {
      const id = r.record_id as string;
      const p = Number(r.page_no);
      if (!lastPage.has(id) || p > (lastPage.get(id) as number)) lastPage.set(id, p);
    }

    // Only the two windows. An `.or()` of two ranges per book would be one
    // enormous filter string, so the front window is fetched for the batch
    // and the back window per book.
    //
    // PAGINATED, for the same reason the id scan is: 100 books x 30 pages is
    // 3,000 rows and PostgREST returns the first 1,000. Unpaginated, the
    // later two thirds of every batch came back with no front pages at all
    // and were reported as "books with no text" — a bug that reads exactly
    // like a finding about the collection.
    const byBook = new Map<string, Row[]>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("book_pages")
        .select("record_id, page_no, content")
        .eq("record_type", "book")
        .in("record_id", batch)
        .lte("page_no", FRONT_WINDOW)
        .order("record_id", { ascending: true })
        .order("page_no", { ascending: true })
        .range(from, from + 999);
      if (error) {
        console.error(`batch ${i / BOOK_BATCH + 1} front: ${error.message}`);
        break;
      }
      for (const r of (data ?? []) as Row[]) {
        byBook.set(r.record_id, [...(byBook.get(r.record_id) ?? []), r]);
      }
      if (!data || data.length < 1000) break;
    }

    for (const id of batch) {
      const total = lastPage.get(id) ?? 0;
      const backFrom = Math.max(FRONT_WINDOW + 1, total - BACK_WINDOW + 1);
      let backRows: Row[] = [];
      if (total > FRONT_WINDOW) {
        const { data } = await db
          .from("book_pages")
          .select("record_id, page_no, content")
          .eq("record_type", "book")
          .eq("record_id", id)
          .gte("page_no", backFrom)
          .limit(BACK_WINDOW);
        backRows = (data ?? []) as Row[];
      }

      const front = byBook.get(id) ?? [];
      const pages = [...front, ...backRows].filter((r) => (r.content ?? "").trim().length > 0);

      // Script is decided from the book's own text, not from a column: the
      // question is what the CONTENTS page is written in.
      const sample = pages.map((p) => p.content ?? "").join(" ").slice(0, 4000);
      const isKhmer = /[ក-៿]/.test(sample);
      const t = isKhmer ? km : other;
      if (pages.length === 0) scriptUnknown++;

      t.books++;
      if (pages.length === 0) continue;
      t.booksWithPages++;

      let sawFront = false;
      let sawBack = false;
      let entries = 0;
      let healthyEntries = 0;

      for (const r of pages) {
        const page: PageInput = { pageNo: Number(r.page_no), content: r.content ?? "" };
        const kind = classifyPage(page, total || pages.length, page.content);
        const isContentsShaped =
          kind === "contents" || (kind === "back-matter" && page.pageNo >= backFrom);
        if (!isContentsShaped) continue;
        if (kind === "contents") sawFront = true;
        else sawBack = true;

        const n = countLocatorsUpperBound(page.content);
        entries += n;
        // The health gate a real feature would have to pass: text that
        // extracted as meaningless code points must never be published as
        // a lesson title.
        // "healthy" only: "unknown" is too little text to judge, and
        // publishing a lesson title we cannot vouch for is the failure
        // mode analyzeTextHealth exists to prevent.
        if (analyzeTextHealth(page.content).verdict === "healthy") healthyEntries += n;
      }

      if (sawFront) t.frontContents++;
      if (sawBack) t.backContents++;
      if (sawFront || sawBack) t.eitherContents++;
      t.locatorsUpperBound += entries;
      t.locatorsHealthy += healthyEntries;
      if (healthyEntries > 0) t.booksHealthyContents++;
    }

    process.stdout.write(`  …${Math.min(i + BOOK_BATCH, ids.length)}/${ids.length}\n`);
    if (i + BOOK_BATCH < ids.length) await sleep(BATCH_PAUSE_MS);
  }

  const pct = (a: number, b: number) => (b === 0 ? "—" : `${((a / b) * 100).toFixed(1)}%`);
  const report = (label: string, t: Tally) => {
    console.log(`\n── ${label} ─────────────────────────────`);
    console.log(`  books sampled              ${t.books}`);
    console.log(`  with text in the windows   ${t.booksWithPages}`);
    console.log(`  contents at the FRONT      ${t.frontContents}  (${pct(t.frontContents, t.booksWithPages)})`);
    console.log(`  contents at the BACK       ${t.backContents}  (${pct(t.backContents, t.booksWithPages)})`);
    console.log(`  either                     ${t.eitherContents}  (${pct(t.eitherContents, t.booksWithPages)})`);
    console.log(`  locators (UPPER BOUND)     ${t.locatorsUpperBound}`);
    console.log(`  of those, health-passing   ${t.locatorsHealthy}  (${pct(t.locatorsHealthy, t.locatorsUpperBound)})`);
    console.log(`  books with USABLE contents ${t.booksHealthyContents}  (${pct(t.booksHealthyContents, t.booksWithPages)})`);
  };

  report("Khmer", km);
  report("Latin / other", other);

  const totalUsable = km.booksHealthyContents + other.booksHealthyContents;
  const totalBooks = km.booksWithPages + other.booksWithPages;
  console.log(`\n── Verdict input ───────────────────────────────────────`);
  console.log(`  usable contents overall    ${totalUsable}/${totalBooks}  (${pct(totalUsable, totalBooks)})`);
  console.log(`  books with no text in the windows  ${scriptUnknown}`);
  console.log(`\nCOUNTS ONLY. Nothing was written. No page text was printed.\n`);
  process.exit(0);
}

run().catch((err) => {
  console.error(`\ndry run failed: ${(err as Error).message}\n`);
  process.exit(1);
});

export {};
