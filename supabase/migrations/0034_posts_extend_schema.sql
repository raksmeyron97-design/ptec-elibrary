-- 0034_posts_extend_schema.sql
-- Add columns that the application expects but are missing from the initial schema.
-- Safe to re-run: all statements use IF NOT EXISTS.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS author_id    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category     text        NOT NULL DEFAULT 'Other',
  ADD COLUMN IF NOT EXISTS excerpt      text,
  ADD COLUMN IF NOT EXISTS cover_url    text,
  ADD COLUMN IF NOT EXISTS cover_urls   text[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS views        integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now();

-- Index for fast author lookups.
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON public.posts (author_id);

-- Index for category filtering on the public listing page.
CREATE INDEX IF NOT EXISTS idx_posts_category ON public.posts (category) WHERE is_published = true;

-- Keep updated_at current on every write.
CREATE OR REPLACE FUNCTION public.posts_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_updated_at ON public.posts;
CREATE TRIGGER trg_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_set_updated_at();

-- Grant anon SELECT so the public /posts listing works without auth.
GRANT SELECT ON public.posts TO anon;
