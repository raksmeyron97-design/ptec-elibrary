-- 0027_perf_and_security.sql
-- Covering indexes for listing/sitemap queries, books_with_stats view,
-- and idempotent RLS assertions for tables added after 0019.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DO/IF EXISTS blocks.

-- ── 1. Covering indexes ───────────────────────────────────────────────────────

-- Speeds up the sitemap query (is_published + created_at DESC) and the
-- books listing page ORDER BY created_at with the published filter.
CREATE INDEX IF NOT EXISTS idx_books_published_created
  ON public.books (is_published, created_at DESC);

-- Speeds up the format-filter subquery in the books listing page
-- (SELECT book_id FROM book_files WHERE format = $1).
CREATE INDEX IF NOT EXISTS idx_book_files_format_book
  ON public.book_files (format, book_id);

-- ── 2. books_with_stats view ──────────────────────────────────────────────────
-- The `books_with_stats` view was not found in any prior migration (it was
-- created in the Supabase dashboard). We recreate it here so it is tracked in
-- version control and to guarantee security_invoker = true.
--
-- Purpose: expose pre-aggregated review_count and avg_rating alongside every
-- book row so the listing page can avoid embedding reviews(rating) — which
-- pulls every individual review row just to compute count/avg client-side.
--
-- security_invoker = true means the view runs with the calling user's
-- privileges and respects RLS on the underlying books and reviews tables.
-- Without it, a SECURITY DEFINER view would bypass RLS on supabase anon.

-- NOTE: We DROP then CREATE rather than CREATE OR REPLACE. CREATE OR REPLACE
-- VIEW can only APPEND columns to an existing view — it cannot reorder or rename
-- them. The dashboard-created view had a different column order (and predates
-- books.created_at from 0020), so b.* expands differently and REPLACE fails with
-- "cannot change name of view column". Dropping first sidesteps that entirely.
DROP VIEW IF EXISTS public.books_with_stats;

CREATE VIEW public.books_with_stats
WITH (security_invoker = true)
AS
SELECT
  b.*,
  COALESCE(r.review_count, 0)::int AS review_count,
  r.avg_rating
FROM public.books b
LEFT JOIN (
  SELECT
    book_id,
    COUNT(*)::int      AS review_count,
    AVG(rating)        AS avg_rating
  FROM public.reviews
  GROUP BY book_id
) r ON r.book_id = b.id;

-- Belt-and-suspenders: set the option even if the CREATE OR REPLACE above
-- already applied it. This line is idempotent.
ALTER VIEW public.books_with_stats SET (security_invoker = true);

-- Grant the same privileges as the underlying books table so the anon and
-- authenticated roles can query the view through PostgREST.
GRANT SELECT ON public.books_with_stats TO anon, authenticated;

-- ── 3. RLS defense-in-depth for tables added after migration 0019 ─────────────
-- All of these tables already have RLS enabled in their respective migrations
-- (0021 notifications/notification_reads, 0023 ai_usage, 0011/0015 research_*).
-- These ALTER TABLE statements are idempotent (enabling already-enabled RLS is
-- a no-op in Postgres) and guarded with DO/IF EXISTS so they are safe even in
-- environments where a table was not yet created.

DO $$
BEGIN
  -- notifications (created in 0021 with RLS)
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'notifications' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY';
  END IF;

  -- notification_reads (created in 0021 with RLS)
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'notification_reads' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY';
  END IF;

  -- ai_usage (created in 0023 with RLS)
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ai_usage' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY';
  END IF;

  -- research_reports (created in 0011 with RLS, predates 0019)
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'research_reports' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.research_reports ENABLE ROW LEVEL SECURITY';
  END IF;

  -- research_cohorts (created in 0015 with RLS)
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'research_cohorts' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.research_cohorts ENABLE ROW LEVEL SECURITY';
  END IF;

  -- research_academic_years (created in 0015 with RLS)
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'research_academic_years' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.research_academic_years ENABLE ROW LEVEL SECURITY';
  END IF;
END;
$$;
