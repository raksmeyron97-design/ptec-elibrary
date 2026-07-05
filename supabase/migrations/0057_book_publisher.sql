-- 0057: Publisher field for books and the physical catalog
--
-- Backs "search by publisher" on /search. Nullable — existing rows are
-- treated as "publisher unknown" in the UI until catalogued; no backfill.

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS publisher text;

ALTER TABLE public.catalog_books
  ADD COLUMN IF NOT EXISTS publisher text;

CREATE INDEX IF NOT EXISTS books_publisher_idx
  ON public.books USING gin (to_tsvector('simple', coalesce(publisher, '')));

CREATE INDEX IF NOT EXISTS catalog_books_publisher_idx
  ON public.catalog_books USING gin (to_tsvector('simple', coalesce(publisher, '')));
