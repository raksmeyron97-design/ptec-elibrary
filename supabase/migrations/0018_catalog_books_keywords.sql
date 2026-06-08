-- Add keywords to catalog_books for tag-based search
ALTER TABLE public.catalog_books
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_catalog_books_keywords
  ON public.catalog_books USING GIN (keywords);


