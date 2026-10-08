// scripts/audit-language-mislabels.ts — READ-ONLY (SEO audit 2026-10, WI-7b).
//
//   npx tsx scripts/audit-language-mislabels.ts                 # local stack
//   npx tsx scripts/audit-language-mislabels.ts --production    # only as O-5 allows
//
// Books whose `language` disagrees with the script of their own title — a
// mostly-Khmer title tagged English, or an all-Latin title tagged Khmer.
// Writes reports/language-mislabels-<date>.csv:
//   id, slug, title, language, finding, khmer_share
// No database write: the librarian corrects each one in the edit form.

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { escapeCsvCell } from "../lib/export/csv";
import { languageMismatch, scriptShares } from "../lib/books/title-audit";
import { auditTarget } from "../lib/books/audit-target";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const argv = process.argv.slice(2);

async function run() {
  const target = auditTarget(SUPABASE_URL, argv);
  console.log(`\naudit-language-mislabels  database=${target.host}  (${target.reason})\n`);
  if (!target.allowed || !SERVICE_KEY) {
    console.error(target.allowed ? "✖ SUPABASE_SERVICE_ROLE_KEY is not set." : `✖ Refusing: ${target.reason}.`);
    process.exit(2);
  }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  type Book = { id: string; slug: string; title: string; language: string | null };
  const books: Book[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("books").select("id, slug, title, language").order("id").range(from, from + 999);
    if (error) throw new Error(`books read failed: ${error.message}`);
    books.push(...((data ?? []) as Book[]));
    if ((data ?? []).length < 1000) break;
  }

  const rows = books.flatMap((b) => {
    const finding = languageMismatch(b.language, b.title ?? "");
    return finding ? [[b.id, b.slug, b.title, b.language ?? "", finding, scriptShares(b.title ?? "").khmer.toFixed(2)]] : [];
  });

  mkdirSync("reports", { recursive: true });
  const out = `reports/language-mislabels-${new Date().toISOString().slice(0, 10)}.csv`;
  const header = ["id", "slug", "title", "language", "finding", "khmer_share"];
  writeFileSync(out, `${[header, ...rows].map((r) => r.map((c) => escapeCsvCell(String(c))).join(",")).join("\n")}\n`);
  console.log(`  ${books.length} books, ${rows.length} mislabelled\n  Wrote ${out}\n`);
}

run().catch((err) => {
  console.error(`\n✖ ${(err as Error).message}\n`);
  process.exit(1);
});

export {};
