-- 0103_public_resource_statistics.sql
--
-- ONE canonical aggregate for every public "how many resources" figure.
--
-- Background: the counting rule used to live in three places — the
-- get_home_stats() RPC, lib/collection-stats.ts, and ad-hoc count queries on
-- the auth screens and in /llms.txt. They drifted (homepage "120+" vs /books
-- "116"), because each one picked its own predicate. 0097 fixed the RPC's
-- arithmetic but left the rule duplicated. This migration makes the rule a
-- single database object that every consumer reads.
--
-- ── The rule ────────────────────────────────────────────────────────────────
--
--   digital_resources = published e-books + published theses
--                     + published publications
--
-- `is_published` is NOT a hand-maintained flag: a BEFORE trigger keeps it in
-- lock-step with `status` (0061 / 0075 / 0086), so is_published = true is
-- exactly "status = 'published'". Drafts, pending_review, scheduled (not yet
-- flipped) and archived rows are therefore all excluded by construction — no
-- separate deleted_at / archived_at predicate is needed, and adding one would
-- be a second rule that could drift.
--
-- Physical catalog records (catalog_books.is_active) are NOT digital
-- resources; they are reported separately and never blended in.
--
-- Learning paths are curated ROUTES THROUGH resources that are already
-- counted above (learning_path_steps point at books / research_reports /
-- catalog_books). Counting them as digital resources would count the same
-- underlying material twice, so they are reported as their own figure.
-- If the product ever redefines them as standalone resources, change the
-- `digital_resources` expression HERE and the DIGITAL_RESOURCE_KEYS list in
-- lib/collection-stats.ts together — nowhere else.
--
-- ── Counting shape ──────────────────────────────────────────────────────────
--
-- Every figure is a bare count over its own base table with NO joins, so a
-- resource with several authors, subjects, keywords, copies, reviews or
-- downloads is structurally incapable of being counted more than once. There
-- is likewise no version table in this schema: an edit mutates the canonical
-- row in place, so historical versions cannot inflate a count either.
--
-- ── Security ────────────────────────────────────────────────────────────────
--
-- security_invoker = true — deliberately NOT security definer. The view runs
-- under the caller's RLS, which already restricts anon to published rows; the
-- explicit WHERE clauses are the second belt. The view returns scalars only,
-- so no row-level detail (draft titles, private records) can leak through it.

-- ── 1. Public aggregate — one row, readable by anyone ───────────────────────
CREATE OR REPLACE VIEW public.public_resource_statistics
WITH (security_invoker = true) AS
SELECT
  (SELECT count(*) FROM public.books            WHERE is_published = true) AS books,
  (SELECT count(*) FROM public.research_reports WHERE is_published = true) AS theses,
  (SELECT count(*) FROM public.publications     WHERE is_published = true) AS publications,
  (SELECT count(*) FROM public.catalog_books    WHERE is_active    = true) AS physical_catalogs,
  (SELECT count(*) FROM public.learning_paths   WHERE is_published = true) AS learning_paths,
  (
      (SELECT count(*) FROM public.books            WHERE is_published = true)
    + (SELECT count(*) FROM public.research_reports WHERE is_published = true)
    + (SELECT count(*) FROM public.publications     WHERE is_published = true)
  ) AS digital_resources,
  -- Searchable = publicly visible AND carrying a pgvector embedding (0029).
  -- Semantic search retrieves from these; the rest are reachable only through
  -- the keyword fallback. Exposed so the gap is measurable rather than
  -- guessed at — see public_resource_search_health below.
  (
      (SELECT count(*) FROM public.books            WHERE is_published = true AND embedding IS NOT NULL)
    + (SELECT count(*) FROM public.research_reports WHERE is_published = true AND embedding IS NOT NULL)
    + (SELECT count(*) FROM public.publications     WHERE is_published = true AND embedding IS NOT NULL)
  ) AS searchable_resources,
  now() AS calculated_at;

COMMENT ON VIEW public.public_resource_statistics IS
  'Canonical public resource counters. Single source of truth for every public "how many resources" figure — see lib/collection-stats.ts. Aggregates only, no row detail.';

GRANT SELECT ON public.public_resource_statistics TO anon, authenticated;

-- ── 2. Search-index reconciliation — ADMIN ONLY ─────────────────────────────
-- Per-type published vs embedded, so the Data Quality screen can report drift
-- instead of the app silently labelling "searchable" as "total". Kept out of
-- anon/authenticated reach: the shape of the gap is operational detail.
--
-- There is no separate search_documents table in this schema — the embedding
-- lives in a column ON the resource row. That makes duplicate and orphaned
-- search documents structurally impossible; the only drift that can exist is
-- a MISSING embedding, which is what this view measures.
CREATE OR REPLACE VIEW public.public_resource_search_health
WITH (security_invoker = true) AS
SELECT 'book'::text AS resource_type,
       count(*)                                  AS published,
       count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded,
       count(*) FILTER (WHERE embedding IS NULL)     AS missing_embedding
  FROM public.books WHERE is_published = true
UNION ALL
SELECT 'thesis',
       count(*), count(*) FILTER (WHERE embedding IS NOT NULL), count(*) FILTER (WHERE embedding IS NULL)
  FROM public.research_reports WHERE is_published = true
UNION ALL
SELECT 'publication',
       count(*), count(*) FILTER (WHERE embedding IS NOT NULL), count(*) FILTER (WHERE embedding IS NULL)
  FROM public.publications WHERE is_published = true
UNION ALL
SELECT 'physical_catalog',
       count(*), count(*) FILTER (WHERE embedding IS NOT NULL), count(*) FILTER (WHERE embedding IS NULL)
  FROM public.catalog_books WHERE is_active = true;

COMMENT ON VIEW public.public_resource_search_health IS
  'Per-type published vs pgvector-embedded counts, for the admin Data Quality reconciliation. Service-role only.';

REVOKE ALL ON public.public_resource_search_health FROM PUBLIC;
REVOKE ALL ON public.public_resource_search_health FROM anon, authenticated;

-- ── 3. get_home_stats() now reads the view, so it cannot drift again ────────
-- Kept SECURITY DEFINER with a pinned search_path (it also reads profiles,
-- which anon cannot). The resource figure is no longer spelled out here.
CREATE OR REPLACE FUNCTION public.get_home_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'resources', (SELECT digital_resources FROM public.public_resource_statistics),
    'views',     coalesce((SELECT sum(view_count)     FROM public.books WHERE is_published = true), 0),
    'downloads', coalesce((SELECT sum(download_count) FROM public.books WHERE is_published = true), 0),
    'members',   (SELECT count(*) FROM public.profiles)
  );
$$;

-- ── 4. Indexes: deliberately none ───────────────────────────────────────────
-- Measured 2026-07-23 against the hosted DB (115 books, 1 thesis, 1
-- publication, 7 catalog records, 4 paths): the whole aggregate returns in
-- ~40-60 ms over PostgREST, dominated by network round-trip, not planning.
-- books already has four partial `WHERE is_published = true` indexes from
-- 0049 that support an index-only count. Adding partial indexes to tables
-- holding single-digit row counts would be pure write cost for a plan the
-- planner would ignore anyway. Revisit when any single table passes ~50k
-- rows; the aggregate is the query to EXPLAIN ANALYZE at that point.
