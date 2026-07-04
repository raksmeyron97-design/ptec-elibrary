-- Migration 0020: Add created_at to books table
-- The initial schema included this column but it was missing from the deployed DB.
-- Adding it safely and backfilling existing rows with published_at as a best approximation.

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Backfill existing rows: use published_at as a proxy for creation time.
-- Rows where published_at is NULL get the current timestamp.
UPDATE public.books
  SET created_at = COALESCE(published_at::timestamptz, now())
  WHERE created_at IS NULL;
