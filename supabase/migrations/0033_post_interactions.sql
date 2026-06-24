-- 0033_post_interactions.sql
-- Post engagement: likes, saves, and comments.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS.

-- ── 1. Denormalized counters on posts ────────────────────────────────────────
-- Kept in sync by triggers below; never written by application code directly.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS like_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS save_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0;

-- ── 2. post_likes ────────────────────────────────────────────────────────────
-- One row per (post, user) pair. Composite PK prevents duplicate likes.
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id    uuid        NOT NULL REFERENCES public.posts(id)    ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_likes_pkey PRIMARY KEY (post_id, user_id)
);

-- ── 3. post_saves ────────────────────────────────────────────────────────────
-- One row per (post, user) pair. Composite PK prevents duplicate saves.
CREATE TABLE IF NOT EXISTS public.post_saves (
  post_id    uuid        NOT NULL REFERENCES public.posts(id)    ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_saves_pkey PRIMARY KEY (post_id, user_id)
);

-- ── 4. post_comments ─────────────────────────────────────────────────────────
-- Supports one level of threading via parent_id.
-- is_deleted is a soft-delete flag used by admins to remove inappropriate
-- content without losing audit history; deleted rows are filtered from SELECT.
CREATE TABLE IF NOT EXISTS public.post_comments (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  post_id    uuid        NOT NULL REFERENCES public.posts(id)        ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id)     ON DELETE CASCADE,
  parent_id  uuid                 REFERENCES public.post_comments(id) ON DELETE CASCADE,
  body       text        NOT NULL,
  is_deleted boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_comments_pkey      PRIMARY KEY (id),
  CONSTRAINT post_comments_body_len  CHECK (char_length(body) BETWEEN 1 AND 2000),
  CONSTRAINT post_comments_no_self   CHECK (id <> parent_id)
);

-- ── 5. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id
  ON public.post_likes (post_id);

CREATE INDEX IF NOT EXISTS idx_post_saves_post_id
  ON public.post_saves (post_id);

CREATE INDEX IF NOT EXISTS idx_post_comments_post_id
  ON public.post_comments (post_id, created_at);

CREATE INDEX IF NOT EXISTS idx_post_comments_parent
  ON public.post_comments (parent_id)
  WHERE parent_id IS NOT NULL;

-- ── 6. Trigger: maintain like_count ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_post_likes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_likes_count ON public.post_likes;
CREATE TRIGGER trg_post_likes_count
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.trg_post_likes_count();

-- ── 7. Trigger: maintain save_count ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_post_saves_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET save_count = save_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET save_count = GREATEST(0, save_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_saves_count ON public.post_saves;
CREATE TRIGGER trg_post_saves_count
  AFTER INSERT OR DELETE ON public.post_saves
  FOR EACH ROW EXECUTE FUNCTION public.trg_post_saves_count();

-- ── 8. Trigger: maintain comment_count ───────────────────────────────────────
-- Counts every non-deleted comment (top-level and replies).
-- Soft-deleting a comment via UPDATE decrements the count;
-- un-deleting (admin action) increments it.
CREATE OR REPLACE FUNCTION public.trg_post_comments_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;

  ELSIF TG_OP = 'DELETE' THEN
    -- Only decrement for rows that were not already soft-deleted
    IF NOT OLD.is_deleted THEN
      UPDATE public.posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT OLD.is_deleted AND NEW.is_deleted THEN
      -- Comment was soft-deleted → decrement
      UPDATE public.posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = NEW.post_id;
    ELSIF OLD.is_deleted AND NOT NEW.is_deleted THEN
      -- Comment was restored → increment
      UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_comments_count ON public.post_comments;
CREATE TRIGGER trg_post_comments_count
  AFTER INSERT OR UPDATE OF is_deleted OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_post_comments_count();

-- ── 9. Trigger: updated_at on post_comments ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.post_comments;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 10. RPC: toggle_post_like ─────────────────────────────────────────────────
-- Atomically toggles a like for the calling user.
-- Returns TRUE  if the post is now liked (INSERT happened).
-- Returns FALSE if the post is now unliked (DELETE happened).
-- Raises if the caller is not authenticated.
CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.post_likes WHERE post_id = p_post_id AND user_id = v_uid
  ) THEN
    DELETE FROM public.post_likes WHERE post_id = p_post_id AND user_id = v_uid;
    RETURN false;
  ELSE
    INSERT INTO public.post_likes (post_id, user_id) VALUES (p_post_id, v_uid);
    RETURN true;
  END IF;
END;
$$;

-- ── 11. RPC: toggle_post_save ─────────────────────────────────────────────────
-- Atomically toggles a save bookmark for the calling user.
-- Returns TRUE  if the post is now saved   (INSERT happened).
-- Returns FALSE if the post is now unsaved  (DELETE happened).
CREATE OR REPLACE FUNCTION public.toggle_post_save(p_post_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.post_saves WHERE post_id = p_post_id AND user_id = v_uid
  ) THEN
    DELETE FROM public.post_saves WHERE post_id = p_post_id AND user_id = v_uid;
    RETURN false;
  ELSE
    INSERT INTO public.post_saves (post_id, user_id) VALUES (p_post_id, v_uid);
    RETURN true;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_post_like(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_post_save(uuid) TO authenticated;

-- ── 12. Row Level Security ────────────────────────────────────────────────────
ALTER TABLE public.post_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_saves    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- post_likes: users see and manage only their own rows.
-- The toggle_post_like RPC (SECURITY DEFINER) is the preferred mutation path;
-- the INSERT/DELETE policies are kept so PostgREST clients can also call them.
DROP POLICY IF EXISTS "Users can view own post likes"   ON public.post_likes;
DROP POLICY IF EXISTS "Users can insert own post likes" ON public.post_likes;
DROP POLICY IF EXISTS "Users can delete own post likes" ON public.post_likes;

CREATE POLICY "Users can view own post likes"
  ON public.post_likes FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own post likes"
  ON public.post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own post likes"
  ON public.post_likes FOR DELETE USING (user_id = auth.uid());

-- post_saves: same pattern as likes.
DROP POLICY IF EXISTS "Users can view own post saves"   ON public.post_saves;
DROP POLICY IF EXISTS "Users can insert own post saves" ON public.post_saves;
DROP POLICY IF EXISTS "Users can delete own post saves" ON public.post_saves;

CREATE POLICY "Users can view own post saves"
  ON public.post_saves FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own post saves"
  ON public.post_saves FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own post saves"
  ON public.post_saves FOR DELETE USING (user_id = auth.uid());

-- post_comments: non-deleted comments are public; authors own their rows;
-- admins can soft-delete any comment via UPDATE is_deleted.
DROP POLICY IF EXISTS "Anyone can read non-deleted comments" ON public.post_comments;
DROP POLICY IF EXISTS "Authenticated users can post comments" ON public.post_comments;
DROP POLICY IF EXISTS "Users can edit own comment body"      ON public.post_comments;
DROP POLICY IF EXISTS "Users can delete own comments"        ON public.post_comments;
DROP POLICY IF EXISTS "Admins can manage all comments"       ON public.post_comments;

CREATE POLICY "Anyone can read non-deleted comments"
  ON public.post_comments FOR SELECT
  USING (is_deleted = false);

CREATE POLICY "Authenticated users can post comments"
  ON public.post_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only edit the body of their own comment (not post_id/user_id/is_deleted).
CREATE POLICY "Users can edit own comment body"
  ON public.post_comments FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own comments"
  ON public.post_comments FOR DELETE
  USING (user_id = auth.uid());

-- Admins get full access (covers soft-delete of any comment).
CREATE POLICY "Admins can manage all comments"
  ON public.post_comments FOR ALL
  USING (public.is_admin());
