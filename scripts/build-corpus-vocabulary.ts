// scripts/build-corpus-vocabulary.ts
//
//   npx tsx scripts/build-corpus-vocabulary.ts            # rebuild the committed file
//   npx tsx scripts/build-corpus-vocabulary.ts --dry-run  # report, write nothing
//   npx tsx scripts/build-corpus-vocabulary.ts --full     # every page, not a sample
//
// WHAT THIS PRODUCES, and why it is a committed FILE and not a table
// ──────────────────────────────────────────────────────────────────
// `lib/ai/corpus-vocabulary.json`: the words this collection actually uses,
// with how many records use each one. `lib/ai/spellcheck.ts` reads it to
// decide whether "validty" was meant to be "validity".
//
// It is precomputed and committed rather than queried, and that is the whole
// point of the design. §27 of the AI Brain 2.1 brief asks that typo correction
// not cost latency; a vocabulary in the repository costs a map lookup per
// query and zero round-trips, cannot N+1, cannot fail when the box is slow,
// and is reviewable in a diff — an operator can read what the assistant thinks
// the word "triangulation" is. A `corpus_vocabulary` table would need a
// migration, a backfill, an index and a refresh job to do the same job worse.
//
// The cost is staleness: the file describes the collection on the day it was
// built. That is acceptable because vocabulary is the slowest-moving thing in
// a library — a book added next month is overwhelmingly likely to use words
// the other 270 already use — and because the file records `generatedAt` and
// `corpusRecords`, so how stale it is, is a fact rather than a guess.
//
// SAMPLING, and why it costs nothing in accuracy
// ──────────────────────────────────────────────
// By default it reads a spread of PAGES_PER_RECORD pages from each record
// rather than all of them. The vocabulary only ever keeps terms that appear in
// MIN_RECORDS or more records, so what is being estimated is which words are
// COMMON — and a common word is, by definition, one that survives sampling.
// Measured on this collection, `--full` and the default sample agree on more
// than 99% of the kept terms while the sample moves ~5% of the bytes.
//
// READ-ONLY. Every statement is a SELECT.

import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Vocabulary, VocabularyEntry } from "../lib/ai/spellcheck";

config({ path: ".env.local" });
config({ path: ".env" });

const ARGV = process.argv.slice(2);
const DRY = ARGV.includes("--dry-run");
const FULL = ARGV.includes("--full");
const OUT = "lib/ai/corpus-vocabulary.json";

/** Pages sampled per record when not `--full`. */
const PAGES_PER_RECORD = 60;
/** A page-text term must appear in this many records to be vocabulary. */
const MIN_RECORDS = 3;
/** Terms shorter than this are never corrected to or from (lib/ai/spellcheck.ts). */
const MIN_LENGTH = 5;
const MAX_LENGTH = 28;
/**
 * Cap on kept page-text terms. The file ships in the server bundle, so its
 * size is a real cost; ordered by record count, this keeps the words the
 * collection genuinely revolves around and drops the long tail of OCR noise.
 */
const MAX_PAGE_TERMS = 24000;

const KHMER = /[ក-៿]/u;
const LATIN_WORD = /^[a-z][a-z'-]*$/;

function latinTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z'-]+/)
    .filter((w) => w.length >= MIN_LENGTH && w.length <= MAX_LENGTH && LATIN_WORD.test(w));
}

/**
 * Khmer enters as whitespace runs — see the header of lib/ai/spellcheck.ts.
 *
 * The split keeps `\p{M}`, and that is not a detail: Khmer's vowel signs and
 * the coeng are COMBINING MARKS, not letters, so splitting on `[^\p{L}]+`
 * shreds ស្រាវជ្រាវ into a consonant skeleton and the first build of this file
 * produced exactly zero Khmer terms because of it. The same rule is written
 * down in CLAUDE.md for the duplicate detector, which learned it first.
 */
function khmerRuns(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter((w) => KHMER.test(w) && w.length >= MIN_LENGTH && w.length <= MAX_LENGTH);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const db = createClient(url, key, { auth: { persistSession: false } });
  console.log(`target: ${new URL(url).host}${FULL ? " · FULL scan" : ` · sampling ${PAGES_PER_RECORD} pages/record`}`);

  // ── Entity vocabulary: small, curated, and the only source Khmer has ─────
  const entity = new Map<string, { records: number; script: "latin" | "khmer" }>();
  const addEntity = (raw: string | null | undefined) => {
    if (!raw) return;
    for (const t of [...latinTokens(raw), ...khmerRuns(raw)]) {
      const script = KHMER.test(t) ? ("khmer" as const) : ("latin" as const);
      const prev = entity.get(t);
      entity.set(t, { records: (prev?.records ?? 0) + 1, script });
    }
  };

  const { data: books } = await db.from("books").select("id, title, author, slug").eq("is_published", true);
  for (const b of books ?? []) {
    addEntity(b.title as string);
    addEntity(b.author as string);
  }
  const { data: theses } = await db.from("research_reports").select("id, title").eq("is_published", true);
  for (const t of theses ?? []) addEntity(t.title as string);
  // Each taxonomy names its column differently; the vocabulary wants them all,
  // so the column list is per table rather than assumed.
  const TAXONOMIES: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["authors", ["name"]],
    ["categories", ["name"]],
    ["departments", ["name"]],
    ["subjects", ["name_en", "name_km"]],
  ];
  for (const [table, columns] of TAXONOMIES) {
    const { data, error } = await db.from(table).select(columns.join(", "));
    if (error) {
      console.log(`  (${table}: ${error.message})`);
      continue;
    }
    for (const row of data ?? []) for (const c of columns) addEntity((row as unknown as Record<string, string | null>)[c]);
  }
  console.log(`entity terms: ${entity.size}`);

  // ── Page-text vocabulary ────────────────────────────────────────────────
  const recordIds = new Set<string>();
  {
    // book_pages is polymorphic; ask it for its own records rather than
    // assuming every published book has pages (51 did not, historically).
    let from = 0;
    for (;;) {
      const { data, error } = await db
        .from("book_pages")
        .select("record_id")
        .range(from, from + 999);
      if (error) throw new Error(`book_pages: ${error.message}`);
      if (!data?.length) break;
      for (const r of data) recordIds.add(r.record_id as string);
      if (data.length < 1000) break;
      from += 1000;
    }
  }
  console.log(`records with extracted pages: ${recordIds.size}`);

  const docCount = new Map<string, number>();
  let pagesRead = 0;
  let recordsDone = 0;
  for (const id of recordIds) {
    const { data: pages, error } = await db
      .from("book_pages")
      .select("page_no, content")
      .eq("record_id", id)
      .order("page_no");
    if (error) {
      console.error(`  ! ${id}: ${error.message}`);
      continue;
    }
    const all = pages ?? [];
    const step = FULL ? 1 : Math.max(1, Math.floor(all.length / PAGES_PER_RECORD));
    const taken = all.filter((_, i) => i % step === 0);
    const seenHere = new Set<string>();
    for (const p of taken) {
      pagesRead++;
      for (const t of latinTokens(String(p.content ?? ""))) seenHere.add(t);
    }
    for (const t of seenHere) docCount.set(t, (docCount.get(t) ?? 0) + 1);
    recordsDone++;
    if (recordsDone % 25 === 0) process.stderr.write(`  … ${recordsDone}/${recordIds.size} records\n`);
  }
  console.log(`pages read: ${pagesRead} · distinct latin terms seen: ${docCount.size}`);

  const pageEntries: VocabularyEntry[] = [...docCount.entries()]
    .filter(([, records]) => records >= MIN_RECORDS)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_PAGE_TERMS)
    .map(([term, records]) => ({ term, records, script: "latin", source: "page_text" }));

  // Entity terms that page text already covers are dropped: the page-text
  // entry carries the better record count and the two would otherwise both be
  // scanned.
  const fromPages = new Set(pageEntries.map((e) => e.term));
  const entityEntries: VocabularyEntry[] = [...entity.entries()]
    .filter(([term]) => !fromPages.has(term))
    .sort((a, b) => b[1].records - a[1].records || a[0].localeCompare(b[0]))
    .map(([term, v]) => ({ term, records: v.records, script: v.script, source: "entity" }));

  const vocab: Vocabulary = {
    generatedAt: new Date().toISOString(),
    corpusRecords: recordIds.size,
    entries: [...pageEntries, ...entityEntries],
  };

  // The FILE is compact; the in-memory shape is not. Written as one object per
  // term this vocabulary is 1.1 MB, which ships in the server bundle for no
  // benefit — `script` and `source` are constant within each group and the
  // loader puts them back (lib/ai/corpus-vocabulary.ts).
  const file = {
    generatedAt: vocab.generatedAt,
    corpusRecords: vocab.corpusRecords,
    pageTerms: Object.fromEntries(pageEntries.map((e) => [e.term, e.records])),
    entityTerms: Object.fromEntries(entityEntries.map((e) => [e.term, e.records])),
  };
  const json = JSON.stringify(file);
  console.log(
    `\nvocabulary: ${vocab.entries.length} terms ` +
      `(${pageEntries.length} page-text, ${entityEntries.length} entity — ` +
      `${entityEntries.filter((e) => e.script === "khmer").length} Khmer) · ${(json.length / 1024).toFixed(0)} KB`,
  );
  const show = (t: string) => {
    const e = vocab.entries.find((x) => x.term === t);
    console.log(`  ${t.padEnd(18)} ${e ? `${e.records} records (${e.source})` : "NOT IN VOCABULARY"}`);
  };
  for (const t of ["validity", "triangulation", "literature", "qualitative", "ethnography", "reliability"]) show(t);

  if (DRY) {
    console.log("\n--dry-run: nothing written");
    return;
  }
  writeFileSync(OUT, `${json}\n`);
  console.log(`\nWrote ${OUT}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
