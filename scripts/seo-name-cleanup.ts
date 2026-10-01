// scripts/seo-name-cleanup.ts
//
//   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
//     npx tsx scripts/seo-name-cleanup.ts [--out docs/seo/name-cleanup.csv]
//
// READ-ONLY, anon key only. Lists catalogue author strings that MAY be
// personal names written surname-first without a comma — the PMB/Koha
// convention behind "Schack Edna O." (docs/seo/AUDIT-VERIFICATION.md F9) — for
// a librarian to decide. It changes nothing and decides nothing.
//
// Why a list and not a fix: word order alone cannot tell "Hattie John"
// (surname first, should read "John Hattie") from "Thang Leng Leng" (a family
// name that IS first) — and every Khmer name is family-name first by
// convention. A name with a comma is already handled by
// lib/catalogs/author-name.ts. So this lists only Latin-script names with no
// comma and two to four words; `suggested_if_inverted` is what the name would
// read as IF a librarian confirms it is inverted, and `decision` is left blank.

import { writeFileSync } from "node:fs";
import { escapeCsvCell } from "../lib/export/csv";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : "docs/seo/name-cleanup.csv";
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (read-only, anon).");
  process.exit(2);
}
console.log(`Reading catalogue authors from ${new URL(url).host} (anon, read-only)`);

type Row = { id: string; author: string | null; title: string | null };

async function fetchAll(): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; ) {
    const res = await fetch(
      `${url}/rest/v1/catalog_books?select=id,author,title&is_active=eq.true&author=not.is.null&order=id.asc`,
      { headers: { apikey: key!, authorization: `Bearer ${key}`, range: `${from}-${from + 999}` } },
    );
    if (!res.ok) throw new Error(`catalog_books ${res.status}: ${await res.text()}`);
    const page = (await res.json()) as Row[];
    if (page.length === 0) break;
    rows.push(...page);
    from += page.length;
  }
  return rows;
}

const LATIN_NAME = /^[\p{Script=Latin}][\p{Script=Latin}.'’\-]*(?:\s+[\p{Script=Latin}][\p{Script=Latin}.'’\-]*){1,3}$/u;
const NOT_A_PERSON = /\b(ministry|department|university|college|institute|unesco|unicef|oecd|organization|organisation|association|press|publishing|publisher|council|foundation|centre|center|team|group|committee|school|office|library|bank|agency|program|programme|project|world|national|international)\b/i;

// The shared cell writer (lib/export/csv.ts): RFC 4180 quoting AND the
// formula guard. These files are opened in Excel or Sheets by librarians, and a
// title or name beginning with =, +, - or @ would otherwise run as a formula.
const csv = (v: string | number | boolean | null | undefined) =>
  escapeCsvCell(typeof v === "boolean" ? String(v) : v);

async function main(): Promise<void> {
  const rows = await fetchAll();
  const byName = new Map<string, { count: number; title: string }>();
  for (const r of rows) {
    const name = (r.author ?? "").replace(/\s+/g, " ").trim();
    if (!name || name.includes(",") || !LATIN_NAME.test(name) || NOT_A_PERSON.test(name)) continue;
    const cur = byName.get(name);
    byName.set(name, { count: (cur?.count ?? 0) + 1, title: cur?.title ?? (r.title ?? "") });
  }
  const lines = [["author_as_catalogued", "records", "example_title", "suggested_if_inverted", "decision"].join(",")];
  const sorted = [...byName].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  for (const [name, { count, title }] of sorted) {
    const [first, ...rest] = name.split(" ");
    lines.push([csv(name), csv(count), csv(title.slice(0, 120)), csv(`${rest.join(" ")} ${first}`), ""].join(","));
  }
  writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(`${rows.length} catalogue records read; ${sorted.length} candidate names written to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
