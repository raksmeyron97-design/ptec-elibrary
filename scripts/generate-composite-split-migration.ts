// scripts/generate-composite-split-migration.ts
//
//   npx tsx scripts/generate-composite-split-migration.ts > supabase/migrations/0147_composite_author_split.sql
//
// READ-ONLY against the database. Emits the SQL that gives each person named
// inside a composite `authors` row their own record and their own credit in the
// canonical graph.
//
// ── Why the split is computed HERE and baked into SQL ────────────────────────
//
// The rule for "how many people does this byline name" is normalizeByline() —
// whole-string identity first, then splitByline(), refusing to separate what it
// cannot separate safely. Reproducing that in PL/pgSQL would be a second
// implementation of an intricate rule, and the two would drift; migration 0130
// refused the same trade for normalizeTitle() and 0146 refused it for subject
// matching. So the derivation runs once, against the shipped functions, and the
// migration carries its RESULT as reviewable literal data.
//
// The generated SQL matches on the composite's NAME, never on a uuid, so it is
// portable to any database (the CI seed simply matches nothing and the whole
// migration is a no-op) and re-runnable.
//
// ── What it deliberately does not touch ──────────────────────────────────────
//
// `books.author_id` stays exactly as it is. It is a SINGLE foreign key: a book
// with three authors can only point at one of them, so "reassigning" it would
// destroy two thirds of the fact it holds. That is the same trap that made
// filing the PISA books under a PISA category destructive (SEO 3.3 §5.3). The
// many-to-many credit lives in `resource_contributors`, which is what that
// table is for.

import { createClient } from "@supabase/supabase-js";
import { normalizeByline } from "../lib/resources/contributor-identity";
import { authorSlug } from "../lib/authors/slug";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

type Person = { name: string; slug: string };

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const [{ data: authors, error: ae }, { data: books, error: be }] = await Promise.all([
    db.from("authors").select("id, name, slug"),
    db.from("books").select("id, author_id"),
  ]);
  if (ae) throw new Error(`authors: ${ae.message}`);
  if (be) throw new Error(`books: ${be.message}`);

  const existingSlugs = new Set((authors ?? []).map((a: any) => a.slug).filter(Boolean));
  const existingNames = new Map((authors ?? []).map((a: any) => [a.name.trim().toLowerCase(), a]));

  /** composite name → the people it names, in byline order, and their ROLE. */
  const splits: { composite: string; people: Person[]; role: string }[] = [];
  /** Every person to create, deduplicated across composites. */
  const toCreate = new Map<string, Person>();

  for (const a of (authors ?? []) as any[]) {
    const parts = normalizeByline(a.name).contributors;
    if (parts.length < 2) continue;

    const people: Person[] = [];
    for (const c of parts) {
      const name = c.displayName.trim();
      const key = name.toLowerCase();
      const slug = authorSlug(name);
      if (!slug) {
        console.error(`-- SKIPPED (no addressable slug): ${name}`);
        continue;
      }
      people.push({ name, slug });
      // Someone already holding their own row keeps it — we credit them, we do
      // not create a duplicate.
      if (!existingNames.has(key)) toCreate.set(key, { name, slug });
    }
    // The role the byline STATES. 10 of these composites end in "(Editors)",
    // and crediting those scholars as authors of a book they edited would be a
    // false bibliographic claim — the exact class of error this project spent
    // SEO 3.1/3.2 removing. normalizeByline() already extracted it; ignoring it
    // would be choosing to discard a fact we hold.
    if (people.length > 1) splits.push({ composite: a.name, people, role: normalizeByline(a.name).role });
  }

  // A slug collision would silently merge two different people into one URL.
  const seen = new Map<string, string>();
  for (const p of toCreate.values()) {
    const clash = seen.get(p.slug) ?? (existingSlugs.has(p.slug) ? "an existing authors row" : null);
    if (clash) console.error(`-- SLUG COLLISION: ${p.name} and ${clash} both → ${p.slug}`);
    seen.set(p.slug, p.name);
  }

  const bookCount = new Map<string, number>();
  for (const b of (books ?? []) as any[]) {
    if (b.author_id) bookCount.set(b.author_id, (bookCount.get(b.author_id) ?? 0) + 1);
  }
  const edges = splits.reduce((n, s) => {
    const a = (authors ?? []).find((x: any) => x.name === s.composite) as any;
    return n + s.people.length * (bookCount.get(a?.id) ?? 0);
  }, 0);

  // One VALUES table drives all three statements, and every one of them is
  // gated on the composite actually existing in THIS database. Without that
  // gate the migration creates 113 authors with no works on any database that
  // lacks the source books — measured on the CI seed, which produced exactly
  // that: 113 contributors and 0 credit edges. A person exists here only
  // because a book credits them.
  const tuples: string[] = [];
  for (const s2 of splits) {
    s2.people.forEach((p2, i) => {
      tuples.push(`    (${q(s2.composite)}, ${q(p2.name)}, ${q(p2.slug)}, ${q(s2.role)}, ${i})`);
    });
  }

  const out: string[] = [];
  out.push(`-- 0147_composite_author_split.sql
--
-- Gives each person named inside a composite \`authors\` row their own record
-- and their own credit, so three scholars sharing one URL become three
-- scholars with three URLs.
--
-- GENERATED by scripts/generate-composite-split-migration.ts from the shipped
-- normalizeByline(), its extracted ROLE, and authorSlug(). Do not hand-edit:
-- regenerate. The split rule is intricate (whole-string identity first, then
-- splitByline(), refusing to separate what it cannot separate safely) and a
-- PL/pgSQL copy would drift from the one the application reads with — the same
-- call 0130 made for normalizeTitle() and 0146 made for subject matching.
--
-- EVERY statement is gated on the composite existing in this database, so a
-- database without these rows (the CI seed) is left completely untouched
-- rather than gaining ${toCreate.size} authors with no works.
--
-- \`books.author_id\` IS NOT TOUCHED. It is a single foreign key, so a book with
-- three authors can only point at one of them; "reassigning" it would destroy
-- two thirds of what it records. The many-to-many credit belongs in
-- \`resource_contributors\`, which is what that table is for.
--
-- Derived on ${new Date().toISOString().slice(0, 10)} from ${splits.length} composite row(s):
--   ${toCreate.size} new author record(s), ${edges} credit edge(s), role as the byline states it.`);

  out.push(`
-- A split-derived contributor is neither a librarian's keystroke ('manual')
-- nor a raw 0105 backfill ('authors'): it is derived from one. Recording that
-- honestly needs its own source value, and the CHECK has to allow it.
-- kindOfCanonicalRow() believes a stored 'person' only for 'manual', so these
-- rows are re-classified from the name on read — which for a single clean
-- name is a no-op, and is the safe direction regardless.
ALTER TABLE public.contributors DROP CONSTRAINT IF EXISTS contributors_source_check;
ALTER TABLE public.contributors ADD CONSTRAINT contributors_source_check
  CHECK (source IN ('manual', 'authors', 'publication_authors', 'thesis_text',
                    'thesis_advisor', 'composite_split'));`);

  out.push(`
-- The split, as data: which composite names whom, in which order, in what role.
--
-- A session-scoped temp table with explicit drops, NOT \`ON COMMIT DROP\`: that
-- form needs the caller to have opened a transaction, and while production's
-- applier does (infra/supabase/scripts/migrate.sh uses --single-transaction),
-- a plain \`psql < file\` on the box does not — the table would be dropped the
-- instant it was created, and the next statement fails on a relation that does
-- not exist. Depending on the caller's transaction mode is not a property this
-- file should have.
DROP TABLE IF EXISTS composite_split;
CREATE TEMP TABLE composite_split (composite text, person text, slug text, role text, seq integer);
INSERT INTO composite_split (composite, person, slug, role, seq) VALUES
${tuples.join(",\n")};

-- ── 1. One authors row per person, only where the composite is present ──────
-- authors_slug_key is a PARTIAL unique index (where slug is not null), so the
-- conflict target must repeat its predicate or Postgres cannot infer it.
INSERT INTO public.authors (name, slug)
SELECT DISTINCT s.person, s.slug
  FROM composite_split s
 WHERE EXISTS (SELECT 1 FROM public.authors a WHERE a.name = s.composite)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO NOTHING;

-- ── 2. One contributors row per person, linked to its authors row ───────────
INSERT INTO public.contributors (display_name, contributor_type, source, legacy_author_id)
SELECT DISTINCT a.name, 'person', 'composite_split', a.id
  FROM composite_split s
  JOIN public.authors a ON a.slug = s.slug
 WHERE EXISTS (SELECT 1 FROM public.authors c WHERE c.name = s.composite)
   AND NOT EXISTS (SELECT 1 FROM public.contributors c2 WHERE c2.legacy_author_id = a.id);

-- ── 3. Credit each person on every book their composite is attached to ──────
-- sequence follows byline order; role is the one the byline STATES, so an
-- edited volume credits editors rather than authors.
INSERT INTO public.resource_contributors (resource_type, resource_id, contributor_id, role, sequence)
SELECT 'book', b.id, c.id, s.role, s.seq
  FROM composite_split s
  JOIN public.authors ca ON ca.name = s.composite
  JOIN public.books b ON b.author_id = ca.id
  JOIN public.authors pa ON pa.slug = s.slug
  JOIN public.contributors c ON c.legacy_author_id = pa.id
ON CONFLICT (resource_type, resource_id, contributor_id, role) DO NOTHING;

DROP TABLE IF EXISTS composite_split;`);

  out.push(`
-- ── 4. Report ───────────────────────────────────────────────────────────────
DO $$
DECLARE v_people integer; v_edges integer;
BEGIN
  SELECT count(*) INTO v_people FROM public.contributors WHERE source = 'composite_split';
  SELECT count(*) INTO v_edges FROM public.resource_contributors rc
    JOIN public.contributors c ON c.id = rc.contributor_id WHERE c.source = 'composite_split';
  RAISE NOTICE '0147: % split contributor(s), % credit edge(s)', v_people, v_edges;
END $$;`);

  console.log(out.join("\n"));
  console.error(`-- generated: ${splits.length} composites, ${toCreate.size} new people, ${edges} edges`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
