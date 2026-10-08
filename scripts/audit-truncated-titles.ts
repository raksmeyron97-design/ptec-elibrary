// scripts/audit-truncated-titles.ts — READ-ONLY (SEO audit 2026-10, WI-7).
//
//   npx tsx scripts/audit-truncated-titles.ts                 # local stack
//   npx tsx scripts/audit-truncated-titles.ts --production    # only as O-5 allows
//
// Published books whose title is exactly 65 characters, or ends in a word the
// corpus has never seen, and — for each — the first line on pages 1–2 of its
// own text that BEGINS with that title. Writes
// reports/truncated-titles-<date>.csv:
//   id, slug, current_title, reason, candidate_full_title, evidence_page, confidence
// No database write. A librarian checks each candidate against the PDF cover
// and edits the title in the normal edit form; the slug never changes on edit.
// Never retire a record because its title matches another (CLAUDE.md).

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { escapeCsvCell } from "../lib/export/csv";
import { findTitleCandidate, looksTruncated } from "../lib/books/title-audit";
import { auditTarget } from "../lib/books/audit-target";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const argv = process.argv.slice(2);

async function run() {
  const target = auditTarget(SUPABASE_URL, argv);
  console.log(`\naudit-truncated-titles  database=${target.host}  (${target.reason})\n`);
  if (!target.allowed || !SERVICE_KEY) {
    console.error(target.allowed ? "✖ SUPABASE_SERVICE_ROLE_KEY is not set." : `✖ Refusing: ${target.reason}.`);
    process.exit(2);
  }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const vocab = JSON.parse(readFileSync("lib/ai/corpus-vocabulary.json", "utf8")) as { pageTerms?: Record<string, number> };
  const vocabulary = new Set(Object.keys(vocab.pageTerms ?? {}));

  type Book = { id: string; slug: string; title: string };
  const books: Book[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("books").select("id, slug, title").eq("is_published", true).order("id").range(from, from + 999);
    if (error) throw new Error(`books read failed: ${error.message}`);
    books.push(...((data ?? []) as Book[]));
    if ((data ?? []).length < 1000) break;
  }

  const flagged = books
    .map((b) => ({ book: b, verdict: looksTruncated(b.title ?? "", vocabulary) }))
    .filter((x) => x.verdict.truncated);
  console.log(`  ${books.length} published books, ${flagged.length} look truncated`);

  const rows: string[][] = [];
  let found = 0;
  for (const { book, verdict } of flagged) {
    const { data, error } = await db
      .from("book_pages")
      .select("page_no, content")
      .eq("record_type", "book")
      .eq("record_id", book.id)
      .in("page_no", [1, 2]);
    const pages = new Map<number, string>(error ? [] : (data ?? []).map((p) => [p.page_no as number, (p.content as string) ?? ""]));
    const hit = findTitleCandidate(book.title, pages);
    if (hit) found++;
    rows.push([
      book.id,
      book.slug,
      book.title,
      verdict.reason ?? "",
      hit?.candidate ?? "",
      hit ? String(hit.page) : "",
      hit?.confidence ?? (error ? "page_read_failed" : pages.size === 0 ? "no_page_text" : "no_match"),
    ]);
  }

  mkdirSync("reports", { recursive: true });
  const out = `reports/truncated-titles-${new Date().toISOString().slice(0, 10)}.csv`;
  const header = ["id", "slug", "current_title", "reason", "candidate_full_title", "evidence_page", "confidence"];
  writeFileSync(out, `${[header, ...rows].map((r) => r.map((c) => escapeCsvCell(c)).join(",")).join("\n")}\n`);
  console.log(`  ${found} candidate(s) found\n  Wrote ${out}\n`);
}

run().catch((err) => {
  console.error(`\n✖ ${(err as Error).message}\n`);
  process.exit(1);
});

export {};
