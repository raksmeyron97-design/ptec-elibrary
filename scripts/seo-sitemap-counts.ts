// scripts/seo-sitemap-counts.ts
//
//   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
//     npx tsx scripts/seo-sitemap-counts.ts --base http://localhost:3200
//
// READ-ONLY. Does each sitemap child advertise every published record of its
// type, and nothing more? Counts the record URLs in each child of the sitemap
// index (lib/seo/sitemap-entries.ts) and compares them with the published rows
// the database holds, through the anon key — the same visibility a reader has.
// Exits 1 on any mismatch. Subjects and authors are PRINTED, not compared:
// both are gated by depth and identity rules (lib/subjects/indexability.ts,
// lib/authors/sitemap-filter.ts), so a raw row count is not what they should equal.
//
// The sitemap once carried 1,690 of 1,695 books with nothing erroring
// (docs/seo/SEO-4.0-AUDIT.md F-1). This is the check that would have said so.

import { sitemapIndexChildren, rebaseUrl, urlBlocks } from "../lib/verify/sitemap";

const baseIdx = process.argv.indexOf("--base");
const BASE = baseIdx > -1 ? process.argv[baseIdx + 1] : "http://localhost:3200";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE || !KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for the database behind --base.");
  process.exit(2);
}

async function text(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function dbCount(query: string): Promise<number> {
  const res = await fetch(`${SUPABASE}/rest/v1/${query}`, {
    method: "HEAD",
    headers: { apikey: KEY!, authorization: `Bearer ${KEY}`, prefer: "count=exact" },
  });
  const range = res.headers.get("content-range") ?? "";
  const total = Number(range.split("/")[1]);
  if (!res.ok || !Number.isFinite(total)) throw new Error(`count ${query}: HTTP ${res.status} ${range}`);
  return total;
}

/** Record URLs of one child: `/<prefix><slug>` with nothing after the slug. */
function records(xml: string, prefix: RegExp): number {
  return urlBlocks(xml)
    .map((b) => b.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "")
    .filter((loc) => prefix.test(new URL(loc).pathname)).length;
}

const EXPECTED: { type: string; prefix: RegExp; query: string | null }[] = [
  { type: "books", prefix: /^\/books\/[^/]+$/, query: "books?select=id&is_published=eq.true" },
  { type: "theses", prefix: /^\/theses\/(?!summary$)[^/]+$/, query: "research_reports?select=id&is_published=eq.true" },
  { type: "journals", prefix: /^\/journals\/articles\/[^/]+$/, query: "publications?select=id&is_published=eq.true" },
  { type: "posts", prefix: /^\/posts\/[^/]+$/, query: "posts?select=id&is_published=eq.true&visibility=eq.public" },
  { type: "paths", prefix: /^\/paths\/[^/]+$/, query: "learning_paths?select=id&is_published=eq.true" },
  { type: "subjects", prefix: /^\/subjects\/[^/]+$/, query: null },
  { type: "authors", prefix: /^\/authors\/[^/]+$/, query: null },
];

async function main(): Promise<void> {
  console.log(`Sitemap counts — ${BASE} vs ${new URL(SUPABASE!).host}\n`);
  const index = await text(`${new URL(BASE).origin}/sitemap.xml`);
  const children = sitemapIndexChildren(index);
  if (!children) throw new Error("/sitemap.xml is not a sitemap index");
  const byType = new Map(children.map((c) => [new URL(c).pathname.replace(/^\/sitemaps\/|\.xml$/g, ""), c]));
  console.log(`index: ${children.length} children (${[...byType.keys()].join(", ")})`);

  let mismatches = 0;
  for (const { type, prefix, query } of EXPECTED) {
    const child = byType.get(type);
    const inSitemap = child ? records(await text(rebaseUrl(child, BASE)), prefix) : 0;
    if (query === null) {
      console.log(`  ${type.padEnd(9)} ${String(inSitemap).padStart(6)} in sitemap (gated; not compared)`);
      continue;
    }
    const inDb = await dbCount(query);
    const ok = inSitemap === inDb;
    if (!ok) mismatches++;
    console.log(`  ${type.padEnd(9)} ${String(inSitemap).padStart(6)} in sitemap  ${String(inDb).padStart(6)} published  ${ok ? "ok" : "MISMATCH"}`);
  }
  console.log(mismatches ? `\n${mismatches} mismatch(es).` : "\nEvery compared type matches.");
  process.exitCode = mismatches ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});

export {};
