/* scripts/enrich-catalog-book.ts
 *
 * Fill what ONE catalogue record is missing — description, publisher, year,
 * keywords, ISBN — without spending a single AI token, and print the MARC21 a
 * cataloguer types into Koha for the same values.
 *
 * Two ways in (the ptec-book-cataloger skill's two workflows):
 *
 *   1. A book with an ISBN — ask Open Library and Google Books (the same
 *      providers, cache and merge rules as the edit form's "Fetch by ISBN";
 *      lib/isbn/enrich.ts):
 *        npx tsx scripts/enrich-catalog-book.ts --slug <slug> --isbn <isbn>
 *
 *   2. A Khmer book or thesis with no international ISBN — the librarian
 *      copies the author's own abstract (មូលន័យសង្ខេប, usually pp. 2–6):
 *        npx tsx scripts/enrich-catalog-book.ts --slug <slug> --abstract "<text>" [--keywords "a; b; c"]
 *
 * WHAT IT WILL NOT DO. With no --apply it changes no record: it prints the plan.
 * (Provider answers still go into the shared ISBN lookup cache, as from the form.)
 * It never overwrites a field that already holds a value; a different value is
 * reported as a conflict, and replaced only when named in --replace
 * (e.g. --replace description,year). It never fills anything when the found
 * title is not this record's title — a mistyped ISBN fetches a real book, just
 * not this one — unless --title-ok says the librarian checked.
 *
 * KOHA. For a record linked to Koha, publisher, year, language and ISBN are
 * Koha's (docs/KOHA-SYNC.md): the sync overwrites them whenever Koha has a
 * value. They are still written here — the sync keeps them while Koha's are
 * empty — but the lasting fix is the MARC printed at the end, entered in Koha.
 * Description and keywords are the e-Library's own and survive the sync.
 *
 * Covers are not imported here: use the edit form, whose save path fetches,
 * checks and stores a found cover (lib/isbn/cover-source.ts).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; GOOGLE_BOOKS_API_KEY
 * (optional — without it Google's shared anonymous quota often runs out).
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { MAX_TEXT, normalizeIsbn } from "@/lib/catalog";
import { isDerivedDescription } from "@/lib/catalogs/derived-description";
import { parseIsbnInput } from "@/lib/isbn/identity";
import { lookupIsbnMetadata } from "@/lib/isbn/resolver";
import { createSupabaseIsbnCache } from "@/lib/isbn/cache";
import { createOpenLibraryProvider } from "@/lib/isbn/providers/open-library";
import { createGoogleBooksProvider } from "@/lib/isbn/providers/google-books";
import {
  marcForEnrichment,
  mergeIsbnCandidates,
  planIsbnFill,
  titlesLookAlike,
  type EnrichField,
  type EnrichPlan,
  type MergedIsbnRecord,
} from "@/lib/isbn/enrich";
import type { CatalogLanguage } from "@/lib/catalog-import";

const USAGE = `Usage:
  npx tsx scripts/enrich-catalog-book.ts --slug <slug> --isbn <isbn> [--apply] [--replace f1,f2] [--title-ok]
  npx tsx scripts/enrich-catalog-book.ts --slug <slug> --abstract "<text>" [--keywords "a; b"] [--apply] [--replace description]`;

const { values: args } = parseArgs({
  options: {
    slug: { type: "string" },
    isbn: { type: "string" },
    abstract: { type: "string" },
    keywords: { type: "string" },
    replace: { type: "string" },
    apply: { type: "boolean", default: false },
    "title-ok": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

function fail(msg: string): never {
  console.error(`✖ ${msg}\n\n${USAGE}`);
  process.exit(1);
}

if (args.help) {
  console.log(USAGE);
  process.exit(0);
}
if (!args.slug) fail("--slug is required.");
if (!args.isbn && !args.abstract) fail("Give --isbn, or --abstract for a book without one.");

const REPLACEABLE: EnrichField[] = ["description", "publisher", "year", "language", "keywords"];
const replace = new Set((args.replace ?? "").split(",").map((s) => s.trim()).filter(Boolean));
for (const f of replace) if (!REPLACEABLE.includes(f as EnrichField)) fail(`--replace: unknown field "${f}" (one of ${REPLACEABLE.join(", ")}).`);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) fail("Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.");

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Row = {
  id: string; slug: string; title: string; author: string | null; isbn: string | null; publisher: string | null;
  year: number | null; language: CatalogLanguage; description: string | null; keywords: string[] | null;
  category: string | null; department: string | null; ddc: string | null; shelf_location: string | null;
  cover_url: string | null; koha_biblio_id: number | null;
};

const clip = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const show = (v: unknown) => (Array.isArray(v) ? v.join("; ") : clip(String(v ?? "")));

async function main() {
  const { data: row, error } = await db
    .from("catalog_books")
    .select("id, slug, title, author, isbn, publisher, year, language, description, keywords, category, department, ddc, shelf_location, cover_url, koha_biblio_id")
    .eq("slug", args.slug!)
    .maybeSingle<Row>();
  if (error) fail(`Could not read the record: ${error.message}`);
  if (!row) fail(`No catalogue record has the slug "${args.slug}".`);

  console.log(`Record   ${row.title}${row.author ? ` — ${row.author}` : ""}`);
  console.log(`         ${row.slug}${row.koha_biblio_id != null ? ` · Koha biblio ${row.koha_biblio_id}` : ""}\n`);

  // ── What was found ────────────────────────────────────────────────────────
  let found: MergedIsbnRecord;
  let isbn13: string | null = null;

  if (args.isbn) {
    const parsed = parseIsbnInput(args.isbn);
    if (!parsed.ok) fail(`--isbn: ${parsed.reason.replace(/_/g, " ")}.`);
    isbn13 = parsed.isbn13;

    const { candidates, outcomes } = await lookupIsbnMetadata(parsed.isbn13, parsed.isbn10, {
      providers: [
        { name: "open_library", lookup: createOpenLibraryProvider({ fetch: (u, i) => fetch(u, i) }) },
        { name: "google_books", lookup: createGoogleBooksProvider({ fetch: (u, i) => fetch(u, i), apiKey: process.env.GOOGLE_BOOKS_API_KEY?.trim() || null }) },
      ],
      cache: createSupabaseIsbnCache(db),
    });
    for (const o of outcomes) {
      const what = o.status === "found" ? `${o.count} record(s)${o.cached ? " (cached)" : ""}`
        : o.status === "not_found" ? `not found${o.cached ? " (cached)" : ""}`
        : o.status === "error" ? `ERROR ${o.kind}: ${o.message}` : "skipped";
      console.log(`Source   ${o.provider.padEnd(13)} ${what}`);
    }
    if (candidates.length === 0) {
      console.log(outcomes.every((o) => o.status === "not_found")
        ? "\nNo source knows this ISBN. For a book without one, use --abstract."
        : "\nNothing found, but not every source answered — try again later.");
      return;
    }

    const same = candidates.filter((c) => titlesLookAlike(row.title, c.title) || (!!c.subtitle && titlesLookAlike(row.title, `${c.title} ${c.subtitle}`)));
    if (same.length === 0 && !args["title-ok"]) {
      console.log(`\n⚠ This ISBN is "${candidates[0].title}" (${candidates[0].provider}) — not "${row.title}".`);
      console.log("  Nothing filled. Check the ISBN printed in the book; if it really is this book, rerun with --title-ok.");
      process.exitCode = 2;
      return;
    }
    found = mergeIsbnCandidates(same.length ? same : candidates)!;
  } else {
    const abstract = args.abstract!.replace(/\r\n/g, "\n").trim();
    if (!abstract) fail("--abstract is empty.");
    if (abstract.length > MAX_TEXT.description) fail(`--abstract is ${abstract.length} characters; the limit is ${MAX_TEXT.description}.`);
    const keywords = [...new Set((args.keywords ?? "").split(/[;,\n]/).map((k) => k.trim()).filter(Boolean))].slice(0, 20);
    // "librarian" is not a provider; the plan only uses this for attribution.
    found = {
      title: row.title,
      description: { value: abstract, provider: "open_library" },
      publisher: null, year: null, language: null, coverImportUrl: null,
      keywords: keywords.length ? { value: keywords, provider: "open_library" } : null,
    };
  }

  // ── The plan ──────────────────────────────────────────────────────────────
  const plan: EnrichPlan = planIsbnFill(
    {
      description: row.description ?? "",
      descriptionIsDerived: isDerivedDescription({
        description: row.description, title: row.title, author: row.author, category: row.category,
        department: row.department, ddc: row.ddc, publisher: row.publisher, shelfLocation: row.shelf_location,
      }),
      publisher: row.publisher ?? "",
      year: row.year != null ? String(row.year) : "",
      language: row.language,
      keywords: row.keywords ?? [],
      coverIsGenerated: false, // never imported here — see the header
    },
    found,
  );
  // --abstract with --keywords: chosen keywords replace only on request, like everything else.
  if (!args.isbn && found.keywords && (row.keywords ?? []).length > 0) {
    plan.conflicts.push({ field: "keywords", current: row.keywords ?? [], found: found.keywords.value });
  }

  const update: Record<string, unknown> = {};
  const via = args.isbn ? (f: EnrichField) => ` (${plan.sources[f]})` : () => " (librarian)";
  console.log("");
  for (const [f, v] of Object.entries(plan.fill) as [EnrichField, string | string[]][]) {
    console.log(`Fill     ${f.padEnd(12)} ${show(v)}${via(f)}`);
    update[f] = v;
  }
  for (const c of plan.conflicts) {
    const take = replace.has(c.field);
    console.log(`${take ? "Replace " : "Keep    "} ${c.field.padEnd(12)} now: ${show(c.current)}`);
    console.log(`${" ".repeat(22)}found: ${show(c.found)}${via(c.field)}${take ? "" : `  → --replace ${c.field}${c.suggested ? "  (the current one only restates the record)" : ""}`}`);
    if (take) update[c.field] = c.found;
  }
  if (isbn13 && !row.isbn) {
    console.log(`Fill     ${"isbn".padEnd(12)} ${isbn13}`);
    update.isbn = normalizeIsbn(isbn13);
  }
  if ("year" in update) update.year = Number(update.year);

  // ── For Koha ──────────────────────────────────────────────────────────────
  const marc = marcForEnrichment({
    isbn: (update.isbn as string | undefined) ?? null,
    publisher: (update.publisher as string | undefined) ?? null,
    year: (update.year as number | undefined) ?? null,
    language: (update.language as CatalogLanguage | undefined) ?? null,
    description: (update.description as string | undefined) ?? null,
    keywords: (update.keywords as string[] | undefined) ?? null,
  });
  if (marc.length) {
    console.log(`\nKoha MARC21${row.koha_biblio_id != null ? ` — biblio ${row.koha_biblio_id}, Cataloging › Edit record` : " — when this book is catalogued in Koha"}:`);
    for (const l of marc) console.log(`  ${clip(l, 400)}`);
    const kohaOwned = (["isbn", "publisher", "year", "language"] as const).filter((f) => f in update);
    if (row.koha_biblio_id != null && kohaOwned.length) {
      console.log(`  (${kohaOwned.join(", ")}: Koha's fields — the sync replaces the e-Library's values once Koha has its own.)`);
    }
  }

  if (Object.keys(update).length === 0) {
    console.log("\nNothing to change.");
    return;
  }
  if (!args.apply) {
    console.log("\nDry run — the record is unchanged. Add --apply to save these values to the e-Library.");
    return;
  }

  const { error: writeError } = await db.from("catalog_books").update(update).eq("id", row.id);
  if (writeError) fail(`Not saved: ${writeError.message}`);
  console.log(`\n✓ Saved ${Object.keys(update).join(", ")} on ${row.slug}.`);
  console.log("  The public page refreshes on its next revalidation (or save the record once in the admin).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
