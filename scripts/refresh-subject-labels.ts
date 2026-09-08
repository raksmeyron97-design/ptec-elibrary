// scripts/refresh-subject-labels.ts
//
//   npx tsx scripts/refresh-subject-labels.ts            # report only
//   npx tsx scripts/refresh-subject-labels.ts --write    # update queries.json
//
// WHY THIS EXISTS
// ───────────────
// A `subject` query asks "what does the library have about X". Its labelled
// answer is therefore a SET, and the set is a property of the collection, not
// of one benchmark run — so it goes stale the moment the collection grows.
// Measured at 270 books: `ទស្សនវិជ្ជា` scored R@1 42% not because ranking got
// worse but because four philosophy books added after the 2026-09-04
// labelling now, correctly, outrank the two that were labelled then.
//
// The rule below is deliberately NOT "whatever the ranker returned first",
// which would grade the ranker against itself and could only ever score 100%.
// A book qualifies when a fact it carries in the DATABASE says it is about
// the subject: its own `subject`/`category` field matches the term, or its
// TITLE contains the term. Both are independent of retrieval, so a ranking
// regression can still fail this benchmark.

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const WRITE = process.argv.includes("--write");
const FILE = "scripts/search-benchmark/queries.json";

/** Same folding the search normalizer uses: keep Khmer marks, fold Latin. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: books, error } = await db
    .from("books")
    .select("slug,title,tags,category_id,is_published")
    .eq("is_published", true);
  if (error) throw new Error(error.message);
  // `subject` in the search payload is the CATEGORY's name, not a column on
  // books — resolve it the same way the route does.
  const { data: cats } = await db.from("categories").select("id,name");
  const catName = new Map((cats ?? []).map((c: any) => [c.id, c.name as string]));

  const doc = JSON.parse(readFileSync(FILE, "utf8"));
  const queries = Array.isArray(doc) ? doc : doc.queries;

  let added = 0;
  for (const q of queries) {
    if (q.category !== "subject") continue;
    const term = fold(q.q);
    const qualifying = (books ?? []).filter((b: any) => {
      if (!b.slug) return false;
      const title = fold(b.title ?? "");
      const subject = fold(catName.get(b.category_id) ?? "");
      // Deliberately NOT tags. A tag is a keyword someone attached, and
      // "qualitative research" as a tag on a general methods textbook made
      // that textbook a correct answer to the `qualitative research` subject
      // query — which inflates the label set until the query cannot fail.
      // Title-or-category is a claim the record makes about what it IS.
      return title.includes(term) || subject === term;
    });
    const have = new Set(q.expect.map((e: any) => e.slug));
    const fresh = qualifying.filter((b: any) => !have.has(b.slug));
    if (fresh.length) {
      console.log(`${q.id} «${q.q}» +${fresh.length}`);
      for (const b of fresh) console.log(`    + ${b.slug}`);
      q.expect.push(...fresh.map((b: any) => ({ type: "book", slug: b.slug })));
      added += fresh.length;
    }
  }
  console.log(`\n${added} labels added across subject queries.`);
  if (WRITE) {
    if (!Array.isArray(doc)) doc.querySetVersion = 2;
    if (!Array.isArray(doc))
      doc.collection = `PTEC e-Library public collection, subject labels refreshed ${new Date().toISOString().slice(0, 10)} (270 published books)`;
    writeFileSync(FILE, JSON.stringify(doc, null, 2) + "\n");
    console.log(`wrote ${FILE}`);
  } else {
    console.log("(dry run — pass --write to apply)");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
