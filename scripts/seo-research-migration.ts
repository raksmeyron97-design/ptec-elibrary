// scripts/seo-research-migration.ts
//
//   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
//     npx tsx scripts/seo-research-migration.ts [--out docs/seo/research-migration.csv]
//
// READ-ONLY, anon key only, one request at a time. SEO Phase 3.6: lists
// candidates for the research collection for librarians to CONFIRM. Nothing
// is moved, and no URL changes until a librarian has confirmed a row and the
// move ships with a permanent redirect and a test (docs/seo/RUNBOOK.md).
//
// Two sources:
//   1. Published e-books under /books whose title, publisher or tags say they
//      are PTEC research — action-research compilations by later cohorts,
//      conference proceedings, research reports. A signal, not a verdict:
//      a textbook ABOUT action research matches too, which is why the
//      `signal` column says what matched and `decision` is left blank.
//   2. The research on the college's old Google Site, as the brief names it.
//      Those rows carry no metadata because none is in this database; a
//      librarian fills it in from the site itself.

import { writeFileSync } from "node:fs";
import { escapeCsvCell } from "../lib/export/csv";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : "docs/seo/research-migration.csv";
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (read-only, anon).");
  process.exit(2);
}

type Book = {
  slug: string;
  title: string;
  publisher: string | null;
  tags: string[] | null;
  published_at: string | null;
  authors: { name: string | null } | null;
  categories: { name: string | null } | null;
};

// What makes a book LOOK like PTEC's own research. Each pattern names itself
// in the output so a librarian can see why a row is here.
const SIGNALS: { label: string; test: (b: Book) => boolean }[] = [
  { label: "title: action research", test: (b) => /action\s*research|ស្រាវជ្រាវ\s*(?:សកម្មភាព|ប្រតិបត្តិ)/iu.test(b.title) },
  { label: "title: research report", test: (b) => /research\s+report|របាយការណ៍\s*ស្រាវជ្រាវ/iu.test(b.title) },
  { label: "title: conference / proceedings / abstracts", test: (b) => /conference|proceedings|abstracts?\b|សន្និសីទ/iu.test(b.title) },
  { label: "title: cohort / batch / generation", test: (b) => /cohort|batch|ជំនាន់|វគ្គ/iu.test(b.title) },
  { label: "title: PTEC", test: (b) => /\bPTEC\b|វ\.?គ\.?ភ|វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ|Teacher Education College/iu.test(b.title) },
  { label: "publisher: PTEC", test: (b) => /\bPTEC\b|វ\.?គ\.?ភ|Teacher Education College/iu.test(b.publisher ?? "") },
  { label: "author: PTEC", test: (b) => /\bPTEC\b|វ\.?គ\.?ភ|Teacher Education College/iu.test(b.authors?.name ?? "") },
];

// The old Google Site's research, as the programme brief lists it. No
// metadata is invented: the librarian completes these rows from the site.
const GOOGLE_SITE_ITEMS = [
  "Action Research Series, volume 1",
  "Action Research Series, volume 2",
  "Action Research Series, volume 3",
  "Action Research Top 10 (2023)",
  "Conference abstracts (2024)",
  "Conference abstracts (2025)",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fetchAll<T>(q: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    await sleep(400);
    const res = await fetch(`${url}/rest/v1/${q}`, {
      headers: { apikey: key!, authorization: `Bearer ${key}`, range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`${q.split("?")[0]} ${res.status}: ${await res.text()}`);
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

// The shared cell writer (lib/export/csv.ts): RFC 4180 quoting AND the
// formula guard. These files are opened in Excel or Sheets by librarians, and a
// title or name beginning with =, +, - or @ would otherwise run as a formula.
const csv = (v: string | number | boolean | null | undefined) =>
  escapeCsvCell(typeof v === "boolean" ? String(v) : v);

async function main(): Promise<void> {
  console.log(`Reading from ${new URL(url!).host} (anon, read-only, sequential)`);
  const books = await fetchAll<Book>(
    "books?select=id,slug,title,publisher,tags,published_at,authors(name),categories(name)&is_published=eq.true&order=id.asc",
  );
  const header = ["source", "current_url", "title", "author", "publisher", "category", "year", "signal", "proposed_type", "decision", "notes"];
  const lines = [header.join(",")];
  let matched = 0;
  for (const b of books) {
    const hits = SIGNALS.filter((s) => s.test(b)).map((s) => s.label);
    if (hits.length === 0) continue;
    matched += 1;
    lines.push(
      [
        "books",
        `/books/${b.slug}`,
        csv(b.title.slice(0, 200)),
        csv(b.authors?.name),
        csv(b.publisher),
        csv(b.categories?.name),
        (b.published_at ?? "").slice(0, 4),
        csv(hits.join("; ")),
        "",
        "",
        "",
      ].join(","),
    );
  }
  for (const item of GOOGLE_SITE_ITEMS) {
    lines.push(["old Google Site", "", csv(item), "", "", "", "", "named in the SEO brief", "", "", "metadata to be taken from the site"].join(","));
  }
  writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(`${books.length} published e-books; ${matched} look like PTEC research; ${GOOGLE_SITE_ITEMS.length} Google Site items → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
