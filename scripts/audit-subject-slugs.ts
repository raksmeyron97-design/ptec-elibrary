// scripts/audit-subject-slugs.ts
//
//   npx tsx scripts/audit-subject-slugs.ts
//
// Reports and changes NOTHING. It answers one question: which `categories`
// rows still carry a generated `book-<epoch>` slug, what would replace them,
// and is that replacement safe.
//
// WHY THIS EXISTS
// ───────────────
// `slugify()` falls back to `book-${Date.now()}` when unicodeSlug() returns
// empty. It no longer does for Khmer — unicodeSlug keeps \p{L}\p{M}\p{N}, so a
// Khmer name slugs to itself — but before that fix every Khmer category got a
// timestamp. Nine survived, and because they hold the bulk of the collection
// they are the library's most-linked subject URLs.
//
// The target slug is NOT invented here: it is `slugify(name)`, the same
// function the app uses today, which is why the other categories already read
// as Khmer. Running this before and after migration 0146 is how an operator
// checks the mapping against the live table rather than trusting the SQL.
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { slugify } from "../lib/book-utils";

const LEGACY_SLUG = /^book-\d+$/;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  console.log(`target: ${url}\n`);
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: cats, error } = await db.from("categories").select("id, name, slug").order("name");
  if (error) throw new Error(`categories: ${error.message}`);
  const all = cats ?? [];

  const legacy = all.filter((c) => LEGACY_SLUG.test(c.slug));
  const clean = all.filter((c) => !LEGACY_SLUG.test(c.slug));

  // Book counts come from the real FK. Theses/publications/catalog associate by
  // NAME (lib/subjects/matching.ts), so a slug change cannot affect them at all
  // — which is the core safety property of this migration.
  const { data: books, error: bookErr } = await db
    .from("books")
    .select("category_id")
    .eq("is_published", true)
    .limit(5000);
  if (bookErr) throw new Error(`books: ${bookErr.message}`);
  const bookCount = new Map<string, number>();
  for (const b of books ?? []) {
    if (b.category_id) bookCount.set(b.category_id, (bookCount.get(b.category_id) ?? 0) + 1);
  }

  console.log(`categories: ${all.length} total — ${legacy.length} legacy, ${clean.length} clean`);
  console.log(`published books: ${(books ?? []).length}\n`);

  if (legacy.length === 0) {
    console.log("No legacy slugs remain. Migration 0146 has been applied (or was never needed).");
    return;
  }

  const taken = new Set(clean.map((c) => c.slug));
  const proposedTargets = new Set<string>();
  let unsafe = 0;

  console.log("books  old slug              →  proposed slug (= slugify(name))");
  console.log("─".repeat(78));
  for (const c of [...legacy].sort((a, b) => (bookCount.get(b.id) ?? 0) - (bookCount.get(a.id) ?? 0))) {
    const target = slugify(c.name);
    const problems: string[] = [];
    if (LEGACY_SLUG.test(target)) problems.push("slugify still returns a timestamp");
    if (taken.has(target)) problems.push("collides with an existing slug");
    if (proposedTargets.has(target)) problems.push("collides with another proposed slug");
    proposedTargets.add(target);
    if (problems.length) unsafe++;
    console.log(
      `${String(bookCount.get(c.id) ?? 0).padStart(5)}  ${c.slug.padEnd(20)} →  ${target}` +
        (problems.length ? `   *** ${problems.join("; ")} ***` : ""),
    );
  }

  const covered = legacy.reduce((n, c) => n + (bookCount.get(c.id) ?? 0), 0);
  console.log("─".repeat(78));
  console.log(`\n${covered} of ${(books ?? []).length} published books sit under a legacy slug.`);
  console.log(unsafe === 0 ? "\nAll proposed slugs are safe (unique, non-empty, no collision)." : `\n${unsafe} UNSAFE — do not migrate.`);
  console.log("\nSQL pairs for the migration (old, new):");
  for (const c of legacy) console.log(`    ('${c.slug}', '${slugify(c.name)}'),`);
  process.exitCode = unsafe === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
