-- 0035_post_tags.sql
-- Add tags array to posts and grant anon SELECT.
-- Safe to re-run: uses IF NOT EXISTS.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- GIN index for fast @> / && tag queries on published posts.
CREATE INDEX IF NOT EXISTS idx_posts_tags
  ON public.posts USING gin(tags)
  WHERE is_published = true;
