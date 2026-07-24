-- 0109_canonical_backfill_health.sql
-- Reconciliation surface for the targeted-consolidation backfills
-- (0105–0108). ADMIN ONLY.
--
-- Each row compares a LEGACY source count with the CANONICAL count the
-- backfill produced. When legacy = canonical the backfill is complete; a gap
-- is drift for a librarian to investigate (a malformed author string, a file
-- URL that failed the http/key heuristic, etc.). The app's Data Quality panel
-- reads this via lib/admin/canonical-backfill.ts.
--
-- security_invoker = true (NOT definer): it runs under the caller's RLS. It is
-- revoked from anon/authenticated so only the service role (admin server
-- actions) sees the operational counts — same posture as
-- public_resource_search_health (0103). It returns scalars only.
--
-- Idempotent: CREATE OR REPLACE. Additive only.

CREATE OR REPLACE VIEW public.canonical_backfill_health
WITH (security_invoker = true) AS
-- ── contributors ─────────────────────────────────────────────────────────────
SELECT 'book_authors'::text AS domain,
       (SELECT count(*) FROM public.books WHERE author_id IS NOT NULL) AS legacy_count,
       (SELECT count(DISTINCT resource_id) FROM public.resource_contributors
          WHERE resource_type = 'book' AND role = 'author') AS canonical_count
UNION ALL
SELECT 'publication_authorships',
       (SELECT count(*) FROM public.publication_authorships),
       (SELECT count(*) FROM public.resource_contributors
          WHERE resource_type = 'publication' AND role = 'author')
UNION ALL
SELECT 'thesis_with_authors',
       (SELECT count(*) FROM public.research_reports WHERE coalesce(btrim(author_names), '') <> ''),
       (SELECT count(DISTINCT resource_id) FROM public.resource_contributors
          WHERE resource_type = 'thesis' AND role = 'author')
UNION ALL
-- ── files ────────────────────────────────────────────────────────────────────
SELECT 'book_files',
       (SELECT count(*) FROM public.book_files WHERE coalesce(btrim(file_url), '') <> ''),
       (SELECT count(*) FROM public.resource_files
          WHERE resource_type = 'book' AND legacy_book_file_id IS NOT NULL)
UNION ALL
SELECT 'publication_files',
       (SELECT count(*) FROM public.publication_files WHERE coalesce(btrim(file_url), '') <> ''),
       (SELECT count(*) FROM public.resource_files
          WHERE resource_type = 'publication' AND legacy_publication_file_id IS NOT NULL)
UNION ALL
SELECT 'thesis_pdf',
       (SELECT count(*) FROM public.research_reports WHERE coalesce(btrim(file_url), '') <> ''),
       (SELECT count(*) FROM public.resource_files
          WHERE resource_type = 'thesis' AND file_role = 'primary_pdf')
UNION ALL
-- ── subjects ─────────────────────────────────────────────────────────────────
SELECT 'book_categories',
       (SELECT count(*) FROM public.books WHERE category_id IS NOT NULL),
       (SELECT count(DISTINCT resource_id) FROM public.resource_subjects WHERE resource_type = 'book')
UNION ALL
-- ── references ───────────────────────────────────────────────────────────────
SELECT 'publications_with_refs',
       (SELECT count(*) FROM public.publications
          WHERE jsonb_array_length(
                  CASE WHEN jsonb_typeof(coalesce("references", '[]'::jsonb)) = 'array'
                       THEN "references" ELSE '[]'::jsonb END) > 0),
       (SELECT count(DISTINCT resource_id) FROM public.resource_references WHERE resource_type = 'publication');

COMMENT ON VIEW public.canonical_backfill_health IS
  'Legacy vs canonical counts for the 0105-0108 backfills. Admin-only reconciliation; a nonzero legacy-canonical gap is drift to investigate. See lib/admin/canonical-backfill.ts.';

REVOKE ALL ON public.canonical_backfill_health FROM PUBLIC;
REVOKE ALL ON public.canonical_backfill_health FROM anon, authenticated;
