/* scripts/audit-book-duplicates.ts
 *
 * READ-ONLY report of everything in the collection that looks like it was
 * entered twice: duplicate books, author records that differ only in casing or
 * an honorific, and category/department values that fold to the same thing.
 *
 * IT CHANGES NOTHING, AND THAT IS THE POINT. Merging two authors moves every
 * byline they hold; retiring a book takes it off the public shelf. Those are
 * deliberate admin workflows with an audit trail (/admin/books/duplicates and
 * /admin/publications/authors), and a script that did them in bulk would be a
 * way to lose data quietly. This one produces the list a human works through.
 *
 * It scores with lib/books/duplicate-detection — the same rules the upload
 * gate and the bulk importer use — so a book this report calls a duplicate is
 * a book the upload form would have warned about.
 *
 * Run:
 *   npx tsx scripts/audit-book-duplicates.ts
 *   npx tsx scripts/audit-book-duplicates.ts --json > duplicates.json
 *
 * Env (.env.local / .env):
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import {
  normalizePersonName,
  normalizeTaxonomyValue,
  personInitialKey,
} from "../lib/books/duplicate-detection/normalize";
import { assessBatch, summarizeBatch, type BatchRow } from "../lib/books/duplicate-detection/batch";
import type { DuplicateCandidate } from "../lib/books/duplicate-detection/signals";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const asJson = process.argv.includes("--json");
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type BookRow = {
  id: string;
  slug: string | null;
  title: string | null;
  isbn: string | null;
  publisher: string | null;
  published_at: string | null;
  status: string | null;
  is_published: boolean | null;
  authors: { name: string | null } | { name: string | null }[] | null;
};

function authorName(row: BookRow): string | null {
  const rel = row.authors;
  if (Array.isArray(rel)) return rel[0]?.name ?? null;
  return rel?.name ?? null;
}

async function main() {
  const { data: bookRows, error } = await db
    .from("books")
    .select("id, slug, title, isbn, publisher, published_at, status, is_published, authors(name)")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("✖ Could not read books:", error.message);
    process.exit(1);
  }

  const books = (bookRows ?? []) as unknown as BookRow[];

  /* Each book is scored against the ones catalogued BEFORE it — the same
     shape the bulk importer uses, so the oldest record of a pair is the one
     treated as canonical and the newer one is what gets reported. */
  const rows: BatchRow[] = books
    .filter((book) => book.title)
    .map((book) => ({
      id: book.id,
      title: book.title!,
      author: authorName(book),
      isbn: book.isbn,
      year: book.published_at ? new Date(book.published_at).getUTCFullYear() : null,
      publisher: book.publisher,
    }));
  const byId = new Map(books.map((book) => [book.id, book]));

  const verdicts = assessBatch(rows, [] as DuplicateCandidate[]);
  const summary = summarizeBatch(rows.length, verdicts);

  // ── Authors that differ only in casing, padding or an honorific ──────────
  const { data: authorRows } = await db.from("authors").select("id, name").order("name");
  const exactGroups = new Map<string, { id: string; name: string }[]>();
  const initialGroups = new Map<string, { id: string; name: string }[]>();
  for (const author of (authorRows ?? []) as { id: string; name: string }[]) {
    const key = normalizePersonName(author.name);
    if (key) exactGroups.set(key, [...(exactGroups.get(key) ?? []), author]);
    const initials = personInitialKey(author.name);
    if (initials) initialGroups.set(initials, [...(initialGroups.get(initials) ?? []), author]);
  }
  const sameAuthor = [...exactGroups.values()].filter((group) => group.length > 1);
  // Reported separately and much more quietly: "J. Smith" and "John Smith" MAY
  // be one person, and may equally be two. Nothing here decides that.
  const maybeSameAuthor = [...initialGroups.values()].filter(
    (group) => group.length > 1 && new Set(group.map((a) => normalizePersonName(a.name))).size > 1,
  );

  // ── Taxonomy values that fold to the same thing ──────────────────────────
  const taxonomy: Record<string, { id: string; name: string }[][]> = {};
  for (const table of ["categories", "departments"] as const) {
    const { data } = await db.from(table).select("id, name").order("name");
    const groups = new Map<string, { id: string; name: string }[]>();
    for (const row of (data ?? []) as { id: string; name: string }[]) {
      const key = normalizeTaxonomyValue(row.name);
      if (key) groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    taxonomy[table] = [...groups.values()].filter((group) => group.length > 1);
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          summary,
          books: [...verdicts.values()].map((verdict) => ({
            id: verdict.id,
            title: byId.get(verdict.id)?.title ?? null,
            slug: byId.get(verdict.id)?.slug ?? null,
            blocked: verdict.blocked,
            score: verdict.match.score,
            confidence: verdict.match.confidence,
            reasons: verdict.match.reasons,
            duplicateOfId: verdict.matchRowId ?? verdict.match.bookId,
            duplicateOfTitle: verdict.match.title,
          })),
          authors: { sameAuthor, maybeSameAuthor },
          taxonomy,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nBooks scanned: ${rows.length}`);
  console.log(
    `  identifier collisions: ${summary.blocked}   strong: ${summary.strong}   possible: ${summary.possible}   clean: ${summary.clean}`,
  );
  for (const verdict of [...verdicts.values()].sort((a, b) => b.match.score - a.match.score)) {
    const book = byId.get(verdict.id);
    const tag = verdict.blocked ? "BLOCK" : verdict.match.confidence === "high" ? "STRONG" : "maybe";
    console.log(
      `  [${tag.padEnd(6)}] ${verdict.match.score}%  "${book?.title ?? verdict.id}"\n` +
        `            duplicate of "${verdict.match.title}"  (${verdict.match.reasons.join(", ")})\n` +
        `            /admin/edit/${verdict.id}`,
    );
  }

  console.log(`\nAuthor records that fold to one name: ${sameAuthor.length}`);
  for (const group of sameAuthor) {
    console.log(`  ${group.map((a) => `"${a.name}"`).join("  ==  ")}`);
  }
  console.log(`\nAuthor records that MIGHT be one person: ${maybeSameAuthor.length}`);
  for (const group of maybeSameAuthor) {
    console.log(`  ${group.map((a) => `"${a.name}"`).join("  ?=  ")}`);
  }

  for (const [table, groups] of Object.entries(taxonomy)) {
    console.log(`\n${table} values that fold to one: ${groups.length}`);
    for (const group of groups) {
      console.log(`  ${group.map((row) => `"${row.name}"`).join("  ==  ")}`);
    }
  }

  console.log(
    "\nNothing was changed. Retire duplicate books at /admin/books/duplicates and merge\n" +
      "author records at /admin/publications/authors — both keep an audit trail.\n",
  );
}

main().catch((err) => {
  console.error("✖ audit-book-duplicates failed:", err);
  process.exit(1);
});
