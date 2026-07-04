-- 0049_listing_indexes.sql
-- Indexes for the books listing/search/detail query paths.
-- Safe to re-run: all statements use IF NOT EXISTS.

-- ── 1. Foreign-key join indexes ───────────────────────────────────────────────
-- Postgres does NOT auto-index FK columns. Every listing query embeds
-- authors/categories/departments, and every detail/listing query embeds
-- book_files and aggregates reviews per book (books_with_stats view).

CREATE INDEX IF NOT EXISTS idx_books_author_id     ON public.books (author_id);
CREATE INDEX IF NOT EXISTS idx_books_category_id   ON public.books (category_id);
CREATE INDEX IF NOT EXISTS idx_books_department_id ON public.books (department_id);

-- The existing idx_book_files_format_book (0027) leads with `format`, so it
-- cannot serve the plain book_id lookup used by every embedded select.
CREATE INDEX IF NOT EXISTS idx_book_files_book_id  ON public.book_files (book_id);

-- books_with_stats aggregates reviews GROUP BY book_id on every listing query.
CREATE INDEX IF NOT EXISTS idx_reviews_book_id     ON public.reviews (book_id);

-- ── 2. Sort-path indexes for the /books listing ───────────────────────────────
-- Partial (WHERE is_published) keeps them small and matches the query shape
-- exactly: .eq(is_published, true).order(<col>, nulls last).order(id desc).
-- `id DESC` is included as the keyset-pagination tie-breaker.

CREATE INDEX IF NOT EXISTS idx_books_pub_published_at
  ON public.books (published_at DESC NULLS LAST, id DESC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_books_pub_downloads
  ON public.books (download_count DESC NULLS LAST, id DESC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_books_pub_rating
  ON public.books (rating DESC NULLS LAST, id DESC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_books_pub_title
  ON public.books (title, id DESC)
  WHERE is_published = true;

-- ── 3. Author-name search ─────────────────────────────────────────────────────
-- Trigram index so an ILIKE search on author names stays fast if/when the
-- search path adds it (pg_trgm already enabled in 0007).
CREATE INDEX IF NOT EXISTS authors_name_trgm_idx
  ON public.authors USING GIN (name gin_trgm_ops);
