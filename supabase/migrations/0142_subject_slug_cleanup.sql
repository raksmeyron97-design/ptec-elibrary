-- 0142_subject_slug_cleanup.sql
--
-- Replace the nine generated `book-<epoch>` category slugs with the Khmer slug
-- the app mints for those names today.
--
-- WHY
-- ───
-- slugify() (lib/book-utils.ts) falls back to `book-${Date.now()}` when
-- unicodeSlug() returns empty. It no longer does for Khmer — unicodeSlug keeps
-- \p{L}\p{M}\p{N}, so a Khmer name slugs to itself — but before that fix every
-- Khmer category got a timestamp. Nine survived, and they hold ~200 of the
-- library's 270 published books: /subjects/book-1781238023578 is Research,
-- with 65 books under it. They are indexed and sitemap-advertised, so the old
-- URLs 301 to the new ones from next.config.ts.
--
-- WHY THE TARGETS ARE LITERAL, NOT COMPUTED
-- ─────────────────────────────────────────
-- Reproducing unicodeSlug()'s \p{L}\p{M}\p{N} semantics in SQL would create a
-- second definition of "the slug for this name", and the two would drift — the
-- same reason migration 0130 refused to reimplement normalizeTitle() in SQL.
-- The pairs below are literal, and lib/seo/subject-slug-redirects.test.ts reads
-- THIS FILE and fails if it disagrees with the TypeScript table or with what
-- the real slugify() produces from `name`.
--
-- WHY A SLUG CHANGE CANNOT MOVE A BOOK
-- ────────────────────────────────────
-- Nothing associates a resource with a subject by slug. Books carry a real FK
-- (books.category_id); theses, publications and catalog rows associate by NAME
-- (lib/subjects/matching.ts). Storage folders derive from the name too, via
-- storageCategorySegment(), never the slug. This migration touches one column
-- that is used for exactly one thing: the URL.
--
-- SAFETY
-- ──────
--   * Idempotent — a second run matches nothing. The e2e job applies this
--     chain to a fresh stack where these rows do not exist; every pair simply
--     no-ops there.
--   * Collision-safe — categories.slug is UNIQUE. A target already held by a
--     DIFFERENT row RAISES rather than corrupting anything.
--   * Loud, not silent — a skipped rename would leave next.config.ts 301ing to
--     a slug that does not exist, i.e. a redirect into a 404. Better to fail
--     the deploy.
--
-- Applied on the ZimaOS box by infra/supabase/scripts/migrate.sh during deploy
-- (migrate.yml is in self-hosted mode and does not reach production).
--
-- Pre-flight against the live table:  npx tsx scripts/audit-subject-slugs.ts

do $$
declare
  pair   record;
  cat_id uuid;
  cat_nm text;
  holder uuid;
  renamed int := 0;
  skipped int := 0;
begin
  for pair in
    select * from (values
      ('book-1781238023578', 'ស្រាវជ្រាវ',              'ស្រាវជ្រាវ'),
      ('book-1781238033853', 'គរុកោសល្យ',               'គរុកោសល្យ'),
      ('book-1781238024978', 'ស្រាវជ្រាវប្រតិបត្តិ',    'ស្រាវជ្រាវប្រតិបត្តិ'),
      ('book-1781238124806', 'វិទ្យាសាស្ត្រ',           'វិទ្យាសាស្ត្រ'),
      ('book-1781238075501', 'គណិតវិទ្យា',              'គណិតវិទ្យា'),
      ('book-1781238041127', 'ភាសាអង់គ្លេសសិក្សា',      'ភាសាអង់គ្លេសសិក្សា'),
      ('book-1781238035277', 'ស្រាវជ្រាវបែបគុណភាព',     'ស្រាវជ្រាវបែបគុណភាព'),
      ('book-1781238028353', 'ស្ថិតិ-និងវិភាគទិន្នន័យ', 'ស្ថិតិ និងវិភាគទិន្នន័យ'),
      ('book-1781238123460', 'កម្មវិធីសិក្សា',          'កម្មវិធីសិក្សា')
    ) as t(old_slug, new_slug, expected_name)
  loop
    select id, name into cat_id, cat_nm
      from public.categories
     where slug = pair.old_slug;

    -- Already migrated, or a database that never had these rows (seed, e2e).
    if cat_id is null then
      skipped := skipped + 1;
      continue;
    end if;

    -- The target must be free. UNIQUE would reject it anyway; this turns a
    -- constraint violation into a sentence naming both categories.
    select id into holder
      from public.categories
     where slug = pair.new_slug and id <> cat_id;

    if holder is not null then
      raise exception
        'subject slug collision: % (%) cannot take slug "%" — already held by category %. '
        'Resolve by hand, then re-run. next.config.ts 301s to this slug, so leaving it '
        'unmigrated would redirect an indexed URL into a 404.',
        cat_nm, pair.old_slug, pair.new_slug, holder;
    end if;

    -- Name drift is reported, never fatal: the redirect target is fixed in
    -- next.config.ts, so the column must match it regardless of a rename.
    if cat_nm is distinct from pair.expected_name then
      raise notice
        'subject % renamed since this migration was written (expected "%", found "%") — '
        'slug still set to "%" to match next.config.ts',
        pair.old_slug, pair.expected_name, cat_nm, pair.new_slug;
    end if;

    update public.categories set slug = pair.new_slug where id = cat_id;
    renamed := renamed + 1;
  end loop;

  raise notice 'subject slug cleanup: % renamed, % already clean or absent', renamed, skipped;
end $$;
