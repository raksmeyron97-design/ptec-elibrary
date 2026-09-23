// scripts/repair-truncated-titles.ts
//
//   npx tsx scripts/repair-truncated-titles.ts --dry-run
//   npx tsx scripts/repair-truncated-titles.ts --dry-run --json reports/truncated-titles.json
//   npx tsx scripts/repair-truncated-titles.ts --dry-run --titles-file titles.json
//   npx tsx scripts/repair-truncated-titles.ts --apply --limit 20
//
// DRY RUN BY DEFAULT. `--apply` is the only flag that writes, it writes only
// `exact` proposals, and it writes nothing else about the record.
//
// ── What it does ────────────────────────────────────────────────────────────
//
// Finds every published book whose title sits exactly on the truncation length
// (lib/admin/catalogue-text-report.ts), looks for a candidate full title in the
// PTEC library-system export under import-csv/, and reports what it would do.
// The decision itself is lib/books/title-restore.ts, which is pure and tested.
//
// ── Read this before running it against production ──────────────────────────
//
// Measured on 2026-09-23, production against `import-csv/title_books_in_PMB_System.xlsx`:
//
//   191 cut titles, 2,623 distinct candidate titles
//   1 exact continuation
//   0 ambiguous
//   ~16 close enough to show a human, none of them the same book
//   the rest, nothing
//
// The export is the PHYSICAL catalogue — it carries barcodes and DDC shelf
// numbers — and it overlaps the digital collection by 2.0% (38 of 1,873
// titles). The cut records are digital curriculum documents that are not in
// it. So this source can restore ONE title, and that is not a defect in this
// script: it is the answer to the question "is the full title in that file?".
//
// A source that can answer for the rest has to be the documents themselves —
// `book_pages` page 1, or a vision pass over the title page. `--source pages`
// is wired for the first of those; see the note on it below before trusting it.

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { GoogleGenAI, Type } from "@google/genai";

import { pagedScan } from "../lib/db/paged-scan";
import {
  verifyVisionTitle,
  type VisionTitleCheck,
} from "../lib/books/title-vision";
import {
  looksTruncated,
  proposeRestoredTitle,
  summarize,
  TITLE_TRUNCATION_LENGTH,
  type RestoreProposal,
  type TitleCandidate,
} from "../lib/books/title-restore";

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const APPLY = argv.includes("--apply");
const LIMIT = Number(flag("limit", "0")) || 0;
const JSON_OUT = flag("json");
const SOURCE = flag("source", "csv") as "csv" | "pages" | "vision";
/** Offline input: a JSON array of {id, title}. Lets the dry run be reproduced,
 *  and reviewed, without production credentials. */
const TITLES_FILE = flag("titles-file");
const CSV_DIR = flag("csv-dir", "import-csv") as string;

type BookRow = { id: string; title: string; cover_url?: string | null };

// ── Candidate sources ───────────────────────────────────────────────────────

/**
 * The library-system export. Read from the CSVs rather than the .xlsx: they are
 * the same 2,622 titles (verified 2026-09-23) and a CSV needs no parser.
 */
function csvCandidates(): TitleCandidate[] {
  const out: TitleCandidate[] = [];
  const seen = new Set<string>();
  for (const part of ["part1", "part2", "part3", "review"]) {
    const path = join(CSV_DIR, `ptec-books-${part}.csv`);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8").replace(/^﻿/, "");
    const [header, ...lines] = text.split(/\r?\n/);
    const cols = header.split(",");
    const iTitle = cols.indexOf("title");
    const iAuthor = cols.indexOf("author");
    const iBarcode = cols.indexOf("barcode");
    for (const line of lines) {
      if (!line.trim()) continue;
      const cells = splitCsvLine(line);
      const title = (cells[iTitle] ?? "").trim();
      if (!title || seen.has(title)) continue;
      seen.add(title);
      out.push({
        title,
        source: `pmb-csv:${part}`,
        author: (cells[iAuthor] ?? "").trim() || null,
        barcode: (cells[iBarcode] ?? "").trim() || null,
      });
    }
  }
  return out;
}

/** Minimal RFC4180 split — the export quotes any field containing a comma. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Page 1 of each indexed PDF — the title page.
 *
 * Wired, and deliberately NOT the default. Khmer page text in this collection
 * extracts unreliably: production page-1 rows carry real characters in an order
 * that spells nothing (`បច្ចេកវិទ េ យា` for `បច្ចេកវិទ្យា`), which is the
 * condition `assessKhmerText()` in lib/ai/page-quality.ts exists to refuse.
 * A title restored from one of those would be a new, different untruth in the
 * catalogue, so a proposal from this source is never `exact` by accident: it
 * still has to CONTINUE the cut title verbatim, and corrupted text cannot.
 */
async function pageCandidates(db: SupabaseClient): Promise<TitleCandidate[]> {
  const { data, error, truncated } = await pagedScan<{ record_id: string; content: string | null }>(
    (from, to) =>
      db
        .from("book_pages")
        .select("record_id, content")
        .eq("record_type", "book")
        .eq("page_no", 1)
        // `book_pages` is unique on (record_type, record_id, page_no). This
        // sweep pins the first and the last with .eq(), so record_id is what
        // makes the paging total — and it must come after record_type, which
        // is the rule lib/db/paginated-sweep.test.ts enforces.
        .order("record_type", { ascending: true })
        .order("page_no", { ascending: true })
        .order("record_id", { ascending: true })
        .range(from, to),
    200_000,
  );
  if (error) throw new Error(`book_pages: ${error.message ?? "read failed"}`);
  if (truncated) throw new Error("book_pages: scan hit the page ceiling");

  const out: TitleCandidate[] = [];
  for (const row of data) {
    const text = (row.content ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    // The title is on the first line or two of a title page, never the whole
    // page. Longer spans would match every cut title by containment alone.
    for (const span of [120, 200]) out.push({ title: text.slice(0, span), source: "book-pages" });
  }
  return out;
}

// ── The cover, read by a vision model ───────────────────────────────────────

const VISION_MODEL = "gemini-3.5-flash";
const VISION_FALLBACK = "gemini-2.5-flash";

/** Structured, so the model reports legibility instead of apologising in prose
 *  and leaving the script to parse an apology as a title. */
const VISION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description:
        "The book's full title EXACTLY as printed on the cover, including every sub-line that is part of the title (subject, grade, level). Transcribe; never translate, correct, reorder or summarise. Empty string if this image is not a cover or title page.",
    },
    fullyLegible: {
      type: Type.BOOLEAN,
      description:
        "True only if every character of the title was clearly readable. False if any part was cropped, blurred, obscured or guessed.",
    },
  },
  required: ["title", "fullyLegible"],
} as const;

type VisionRead = { title: string; fullyLegible: boolean };

/** A model that could not be reached at all, as opposed to one that answered.
 *  Thrown rather than returned so no call site can forget the difference. */
class VisionUnavailable extends Error {}

async function readCoverTitle(
  ai: GoogleGenAI,
  coverUrl: string,
): Promise<VisionRead | null> {
  const res = await fetch(coverUrl);
  if (!res.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/webp";

  const contents = [
    {
      role: "user" as const,
      parts: [
        { inlineData: { mimeType, data: bytes.toString("base64") } },
        {
          text:
            "You are transcribing a library book cover so the catalogue can record its full title. " +
            "Copy the title exactly as printed, in its own script — Khmer stays Khmer. " +
            "Include every line that belongs to the title, in the order printed. " +
            "Do not include the publisher, the ministry, the year, the author or any slogan.",
        },
      ],
    },
  ];
  const config = {
    responseMimeType: "application/json",
    responseSchema: VISION_SCHEMA,
    maxOutputTokens: 400,
    thinkingConfig: { thinkingBudget: 0 },
  };

  let lastError: unknown = null;
  for (const model of [VISION_MODEL, VISION_FALLBACK]) {
    try {
      const out = await ai.models.generateContent({ model, contents, config });
      const parsed = JSON.parse(out.text ?? "{}") as Partial<VisionRead>;
      return { title: (parsed.title ?? "").trim(), fullyLegible: parsed.fullyLegible === true };
    } catch (err) {
      lastError = err;
      console.error(`    ${model}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
    }
  }
  // Both models refused to answer. That says nothing about this cover.
  throw new VisionUnavailable(
    lastError instanceof Error ? lastError.message : "the vision model could not be reached",
  );
}

// ── Records to repair ───────────────────────────────────────────────────────

async function loadBooks(db: SupabaseClient | null): Promise<BookRow[]> {
  if (TITLES_FILE) {
    const rows = JSON.parse(readFileSync(TITLES_FILE, "utf8")) as BookRow[];
    return rows.filter((r) => r?.title);
  }
  if (!db) throw new Error("no database configured and no --titles-file given");
  const { data, error, truncated } = await pagedScan<BookRow>(
    (from, to) =>
      db
        .from("books")
        .select("id, title, cover_url")
        .eq("is_published", true)
        .order("id", { ascending: true })
        .range(from, to),
    200_000,
  );
  // Paged, because a one-shot read of `books` returns its first 1000 rows and
  // 191 cut titles are spread across 1,956 (lib/db/paged-scan.ts).
  if (error) throw new Error(`books: ${error.message ?? "read failed"}`);
  if (truncated) throw new Error("books: scan hit the page ceiling");
  return data;
}

// ── Report ──────────────────────────────────────────────────────────────────

function preview(value: string, width = 68): string {
  const chars = [...value];
  return chars.length <= width ? value : `${chars.slice(0, width - 1).join("")}…`;
}

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

  console.log(`\nTruncated-title repair — ${APPLY ? "APPLY" : "dry run"}`);
  console.log(`  records   : ${TITLES_FILE ?? (db ? new URL(url!).host : "(none)")}`);
  const sourceLabel =
    SOURCE === "csv" ? CSV_DIR : SOURCE === "pages" ? "book_pages page 1" : "each record's own cover, read by a vision model";
  console.log(`  candidates: ${sourceLabel}\n`);

  if (APPLY && !db) throw new Error("--apply needs database credentials");
  if (SOURCE === "pages" && !db) throw new Error("--source pages needs database credentials");

  const books = await loadBooks(db);
  const cut = books.filter((b) => looksTruncated(b.title));

  console.log(
    `  ${books.length} records, ${cut.length} with a title at exactly ${TITLE_TRUNCATION_LENGTH} code points`,
  );

  const subject = LIMIT > 0 ? cut.slice(0, LIMIT) : cut;

  if (SOURCE === "vision") {
    await runVision(subject, db);
    return;
  }

  const candidates = SOURCE === "csv" ? csvCandidates() : await pageCandidates(db!);
  console.log(`  ${candidates.length} candidate titles\n`);
  const proposals: (RestoreProposal & { id: string })[] = subject.map((b) => ({
    id: b.id,
    ...proposeRestoredTitle(b.title, candidates),
  }));

  const counts = summarize(proposals);
  console.log("  ── verdicts ──");
  console.log(`  exact      ${String(counts.exact).padStart(4)}   one candidate continues the title verbatim — appliable`);
  console.log(`  ambiguous  ${String(counts.ambiguous).padStart(4)}   several do; the text that would choose was the text removed`);
  console.log(`  review     ${String(counts.review).padStart(4)}   close, but a different record`);
  console.log(`  none       ${String(counts.none).padStart(4)}   nothing above the noise floor\n`);

  for (const p of proposals.filter((x) => x.confidence === "exact")) {
    console.log("  EXACT");
    console.log(`    before : ${preview(p.current)}`);
    console.log(`    after  : ${preview(p.proposed!, 110)}`);
    console.log(`    source : ${p.candidates[0].source}\n`);
  }
  for (const p of proposals.filter((x) => x.confidence === "ambiguous")) {
    console.log("  AMBIGUOUS — refused");
    console.log(`    title  : ${preview(p.current)}`);
    for (const c of p.candidates.slice(0, 4)) console.log(`      • ${preview(c.title, 100)}`);
    console.log();
  }
  const review = proposals.filter((x) => x.confidence === "review");
  for (const p of review.slice(0, 5)) {
    console.log(`  REVIEW (${p.candidates[0].score.toFixed(2)}) — not applied`);
    console.log(`    cut    : ${preview(p.current)}`);
    console.log(`    closest: ${preview(p.candidates[0].title, 110)}\n`);
  }
  if (review.length > 5) console.log(`  … and ${review.length - 5} more to review\n`);

  if (JSON_OUT) {
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(
      JSON_OUT,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), source: SOURCE, counts, proposals }, null, 2)}\n`,
    );
    console.log(`  Wrote ${JSON_OUT}`);
  }

  if (!APPLY) {
    console.log(`  Dry run — nothing was written. ${counts.exact} record(s) would change.\n`);
    return;
  }

  // Only `exact`. One statement per record, asking for the row back, so a
  // write that matched nothing is reported rather than counted as done
  // (lib/db/changed-row.ts is the same rule).
  let applied = 0;
  for (const p of proposals) {
    if (p.confidence !== "exact" || !p.proposed) continue;
    const { data, error } = await db!
      .from("books")
      .update({ title: p.proposed })
      .eq("id", p.id)
      .eq("title", p.current) // refuse if the row moved under us
      .select("id");
    if (error) { console.error(`  FAILED ${p.id}: ${error.message}`); continue; }
    if (!data?.length) { console.error(`  NO-OP  ${p.id}: the title changed since the scan`); continue; }
    applied += 1;
    console.log(`  applied ${p.id}`);
  }
  console.log(`\n  ${applied} title(s) restored. Slugs are NOT changed — see the note in the header.\n`);
}

/**
 * The vision pass: one cover per record, verified deterministically before
 * anything is written.
 *
 * Sequential on purpose. This spends a metered quota against production, the
 * records are few, and a burst of 191 concurrent image requests is the shape
 * that gets an API key rate-limited mid-run — leaving half a report and no way
 * to tell which half.
 */
async function runVision(subject: BookRow[], db: SupabaseClient | null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("--source vision needs GEMINI_API_KEY");
  if (APPLY && !db) throw new Error("--apply needs database credentials");
  const ai = new GoogleGenAI({ apiKey });

  const results: {
    id: string;
    stored: string;
    transcribed: string | null;
    check: VisionTitleCheck;
  }[] = [];

  for (const book of subject) {
    const cover = book.cover_url;
    console.log(`  ${book.title.slice(0, 44)}…`);
    if (!cover) {
      console.log("    no cover — skipped\n");
      results.push({
        id: book.id,
        stored: book.title,
        transcribed: null,
        check: { verdict: "reject", reason: "the record has no cover image", agreement: 0 },
      });
      continue;
    }
    let read: VisionRead | null = null;
    try {
      read = await readCoverTitle(ai, cover);
    } catch (err) {
      if (!(err instanceof VisionUnavailable)) throw err;
      // STOP. Continuing would spend the rest of the run writing "unreadable"
      // against every remaining cover, and that report would be read as
      // evidence about the collection rather than about the outage.
      console.error(
        `\n  The vision model is unavailable — stopping after ${results.length} of ${subject.length}.` +
          `\n  ${err.message.slice(0, 200)}\n` +
          `\n  No verdict is recorded for the records not reached. Nothing was written.\n`,
      );
      return;
    }
    const check = verifyVisionTitle({
      stored: book.title,
      transcribed: read?.title,
      fullyLegible: read?.fullyLegible === true,
    });
    results.push({ id: book.id, stored: book.title, transcribed: read?.title ?? null, check });
    console.log(`    read   : ${(read?.title ?? "(nothing)").slice(0, 90)}`);
    console.log(`    verdict: ${check.verdict.toUpperCase()} — ${check.reason}\n`);
  }

  const by = (v: string) => results.filter((r) => r.check.verdict === v).length;
  console.log("  ── verdicts ──");
  console.log(`  apply   ${String(by("apply")).padStart(4)}   the cover agrees with the stored opening and carries more of it`);
  console.log(`  review  ${String(by("review")).padStart(4)}   readable, but the model could not read the whole title`);
  console.log(`  reject  ${String(by("reject")).padStart(4)}   not the same title, not longer, or unreadable Khmer\n`);

  if (JSON_OUT) {
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(
      JSON_OUT,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), source: "vision", results }, null, 2)}\n`,
    );
    console.log(`  Wrote ${JSON_OUT}`);
  }

  if (!APPLY) {
    console.log(`  Dry run — nothing was written. ${by("apply")} record(s) would change.\n`);
    return;
  }

  let applied = 0;
  for (const r of results) {
    if (r.check.verdict !== "apply" || !r.transcribed) continue;
    const { data, error } = await db!
      .from("books")
      .update({ title: r.transcribed })
      .eq("id", r.id)
      .eq("title", r.stored)
      .select("id");
    if (error) { console.error(`  FAILED ${r.id}: ${error.message}`); continue; }
    if (!data?.length) { console.error(`  NO-OP  ${r.id}: the title changed since the scan`); continue; }
    applied += 1;
  }
  console.log(`\n  ${applied} title(s) restored from their covers. Slugs unchanged.\n`);
}

run().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

export {};
