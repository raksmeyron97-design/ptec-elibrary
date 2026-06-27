-- Migration: Add is_edited column to post_comments
-- This tracks whether a comment has been edited by its author.

ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS is_edited boolean DEFAULT false;

-- Optional: index for efficient filtering if needed later
-- CREATE INDEX IF NOT EXISTS idx_post_comments_is_edited ON post_comments (is_edited) WHERE is_edited = true;
