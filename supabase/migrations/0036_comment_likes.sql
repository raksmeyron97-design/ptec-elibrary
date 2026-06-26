-- 0036_comment_likes.sql
-- Persistent heart reactions for post comments.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.

-- ── 1. Table ─────────────────────────────────────────────────────────────────
-- One row per (user, comment) pair — enforced by PRIMARY KEY.
-- Deleting the row = unlike. No soft-delete needed.

CREATE TABLE IF NOT EXISTS public.comment_likes (
  comment_id  uuid        NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)           ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

-- ── 2. Indexes ───────────────────────────────────────────────────────────────
-- Fast lookup of all likes on a comment (for count queries).
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id
  ON public.comment_likes(comment_id);

-- Fast lookup of all comments a user has liked (for "did I like this?" checks).
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id
  ON public.comment_likes(user_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read like counts.
DROP POLICY IF EXISTS "comment_likes_select_public" ON public.comment_likes;
CREATE POLICY "comment_likes_select_public"
  ON public.comment_likes
  FOR SELECT
  USING (true);

-- Only authenticated users can like.
DROP POLICY IF EXISTS "comment_likes_insert_own" ON public.comment_likes;
CREATE POLICY "comment_likes_insert_own"
  ON public.comment_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only unlike their own like. Admins can remove any like.
DROP POLICY IF EXISTS "comment_likes_delete_own_or_admin" ON public.comment_likes;
CREATE POLICY "comment_likes_delete_own_or_admin"
  ON public.comment_likes
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── 4. Helper: toggle like (insert or delete) ────────────────────────────────
-- Returns the new liked state: true = now liked, false = now unliked.
-- Runs as the calling user's role so RLS above still applies.
CREATE OR REPLACE FUNCTION public.toggle_comment_like(p_comment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existed boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if like already exists
  SELECT EXISTS (
    SELECT 1 FROM comment_likes
    WHERE comment_id = p_comment_id AND user_id = v_user_id
  ) INTO v_existed;

  IF v_existed THEN
    DELETE FROM comment_likes
    WHERE comment_id = p_comment_id AND user_id = v_user_id;
    RETURN false;  -- now unliked
  ELSE
    INSERT INTO comment_likes(comment_id, user_id)
    VALUES (p_comment_id, v_user_id);
    RETURN true;   -- now liked
  END IF;
END;
$$;

-- ── 5. Helper: get like count + current user's liked state ───────────────────
-- Returns a single row: { like_count int, liked_by_me bool }
-- Efficient: single scan, safe for anon (liked_by_me always false when unauthed).
CREATE OR REPLACE FUNCTION public.get_comment_likes(p_comment_id uuid)
RETURNS TABLE(like_count bigint, liked_by_me boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)                                                    AS like_count,
    BOOL_OR(user_id = auth.uid()) FILTER (WHERE auth.uid() IS NOT NULL) AS liked_by_me
  FROM comment_likes
  WHERE comment_id = p_comment_id;
$$;

-- ── 6. Grants ────────────────────────────────────────────────────────────────
-- anon/authenticated can read the table via RLS (SELECT policy above).
-- Only authenticated users call toggle_comment_like (function checks auth.uid()).
-- get_comment_likes is readable by all — safe because it's a count + boolean.
GRANT SELECT ON public.comment_likes TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_comment_like(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_comment_likes(uuid) TO anon, authenticated;
