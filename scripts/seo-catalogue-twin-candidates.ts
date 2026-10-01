// scripts/seo-catalogue-twin-candidates.ts
//
//   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
//     npx tsx scripts/seo-catalogue-twin-candidates.ts [--out docs/seo/catalogue-twin-candidates.csv]
//
// READ-ONLY, anon key only, one request at a time. Lists print catalogue
// records whose title is exactly an e-book's title but whose author does not
// match it, so the page does NOT link them (lib/catalogs/digital-twin.ts needs
// the ISBN or the title AND the author). Most are MoEYS textbooks: the print
// record credits the book's writers, the e-book credits the Ministry. A
// librarian decides which are the same work; nothing here links anything.

import { writeFileSync } from "node:fs";
import { normalizeTitle } from "../lib/books/duplicate-detection/normalize";
import { buildTwinIndex, findDigitalTwin } from "../lib/catalogs/digital-twin";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : "docs/seo/catalogue-twin-candidates.csv";
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (read-only, anon).");
  process.exit(2);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fetchAll<T>(q: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    await sleep(300);
    const res = await fetch(`${url}/rest/v1/${q}`, {
      headers: { apikey: key!, authorization: `Bearer ${key}`, range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`${q.split("?")[0]} ${res.status}: ${await res.text()}`);
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const csv = (v: string | number | null | undefined) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

type Book = { slug: string; title: string; isbn: string | null; authors: { name: string | null } | null };
type Record_ = { slug: string; title: string; author: string | null; isbn: string | null };

async function main(): Promise<void> {
  console.log(`Reading from ${new URL(url!).host} (anon, read-only, sequential)`);
  const books = await fetchAll<Book>("books?select=id,slug,title,isbn,authors(name)&is_published=eq.true&order=id.asc");
  const records = await fetchAll<Record_>("catalog_books?select=id,slug,title,author,isbn&is_active=eq.true&order=id.asc");
  const index = buildTwinIndex(books.map((b) => ({ slug: b.slug, title: b.title, isbn: b.isbn, authors: [b.authors?.name ?? null] })));
  const byTitle = new Map<string, Book[]>();
  for (const b of books) {
    const t = normalizeTitle(b.title);
    if (t) byTitle.set(t, [...(byTitle.get(t) ?? []), b]);
  }
  let linked = 0;
  const lines = [["catalogue_slug", "catalogue_title", "catalogue_author", "ebook_slug", "ebook_author", "same_work"].join(",")];
  for (const r of records) {
    if (findDigitalTwin(index, r)) {
      linked += 1;
      continue;
    }
    for (const b of byTitle.get(normalizeTitle(r.title)) ?? []) {
      lines.push([csv(r.slug), csv(r.title), csv(r.author), csv(b.slug), csv(b.authors?.name), ""].join(","));
    }
  }
  writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(
    `${records.length} catalogue records, ${books.length} e-books: ${linked} linked automatically; ` +
      `${lines.length - 1} title-only candidate pairs for review → ${OUT}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
