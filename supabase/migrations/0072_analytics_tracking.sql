-- ══════════════════════════════════════════════════════════════════════════
--  Migration 0072 — Analytics tracking upgrade
--
--  1. download_logs: generic content columns (content_type/content_id) so
--     thesis (and future publication) downloads can be logged alongside book
--     downloads. Existing book rows are backfilled through book_files; a
--     BEFORE INSERT trigger keeps filling them for book-file downloads so
--     the download route needs no code change.
--  2. Daily aggregate tables (daily_content_views, daily_content_downloads,
--     daily_user_signups) maintained by AFTER INSERT triggers and backfilled
--     from existing logs. The admin dashboard reads these instead of
--     scanning raw logs; dates are bucketed in Asia/Phnom_Penh.
--  3. RLS: aggregates are admin-read-only; trigger functions are
--     SECURITY DEFINER so user-initiated log inserts can update them.
--
--  Safe to apply any time. The app falls back to raw-log scans until this
--  migration is live, and starts using the aggregates automatically.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. download_logs content columns ───────────────────────────────────────

ALTER TABLE public.download_logs
  ADD COLUMN IF NOT EXISTS content_type text,
  ADD COLUMN IF NOT EXISTS content_id   uuid;

-- Backfill existing book downloads through book_files.
UPDATE public.download_logs dl
SET content_type = 'book',
    content_id   = bf.book_id
FROM public.book_files bf
WHERE dl.book_file_id = bf.id
  AND dl.content_id IS NULL;

CREATE INDEX IF NOT EXISTS download_logs_content_idx
  ON public.download_logs (content_type, content_id);

-- Resolve content columns for book-file downloads automatically, so the
-- existing download route keeps working unchanged.
CREATE OR REPLACE FUNCTION public.download_logs_fill_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.content_id IS NULL AND NEW.book_file_id IS NOT NULL THEN
    SELECT 'book', bf.book_id
      INTO NEW.content_type, NEW.content_id
      FROM public.book_files bf
     WHERE bf.id = NEW.book_file_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS download_logs_fill_content_trg ON public.download_logs;
CREATE TRIGGER download_logs_fill_content_trg
  BEFORE INSERT ON public.download_logs
  FOR EACH ROW EXECUTE FUNCTION public.download_logs_fill_content();

-- ── 2. Daily aggregate tables ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_content_views (
  content_type text    NOT NULL,
  content_id   uuid    NOT NULL,
  date         date    NOT NULL,
  views_count  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (content_type, content_id, date)
);
CREATE INDEX IF NOT EXISTS daily_content_views_date_idx
  ON public.daily_content_views (date);

CREATE TABLE IF NOT EXISTS public.daily_content_downloads (
  content_type    text    NOT NULL,
  content_id      uuid    NOT NULL,
  date            date    NOT NULL,
  downloads_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (content_type, content_id, date)
);
CREATE INDEX IF NOT EXISTS daily_content_downloads_date_idx
  ON public.daily_content_downloads (date);

CREATE TABLE IF NOT EXISTS public.daily_user_signups (
  date        date    PRIMARY KEY,
  users_count integer NOT NULL DEFAULT 0
);

-- ── Trigger functions (library-local dates: Asia/Phnom_Penh) ────────────────

CREATE OR REPLACE FUNCTION public.bump_daily_content_views()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.daily_content_views (content_type, content_id, date, views_count)
  VALUES (
    NEW.content_type,
    NEW.content_id,
    (COALESCE(NEW.viewed_at, now()) AT TIME ZONE 'Asia/Phnom_Penh')::date,
    1
  )
  ON CONFLICT (content_type, content_id, date)
  DO UPDATE SET views_count = public.daily_content_views.views_count + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS view_logs_bump_daily_trg ON public.view_logs;
CREATE TRIGGER view_logs_bump_daily_trg
  AFTER INSERT ON public.view_logs
  FOR EACH ROW EXECUTE FUNCTION public.bump_daily_content_views();

CREATE OR REPLACE FUNCTION public.bump_daily_content_downloads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Rows with no resolvable content (orphaned file references) are skipped.
  IF NEW.content_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.daily_content_downloads (content_type, content_id, date, downloads_count)
  VALUES (
    COALESCE(NEW.content_type, 'book'),
    NEW.content_id,
    (COALESCE(NEW.downloaded_at, now()) AT TIME ZONE 'Asia/Phnom_Penh')::date,
    1
  )
  ON CONFLICT (content_type, content_id, date)
  DO UPDATE SET downloads_count = public.daily_content_downloads.downloads_count + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS download_logs_bump_daily_trg ON public.download_logs;
CREATE TRIGGER download_logs_bump_daily_trg
  AFTER INSERT ON public.download_logs
  FOR EACH ROW EXECUTE FUNCTION public.bump_daily_content_downloads();

CREATE OR REPLACE FUNCTION public.bump_daily_user_signups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.daily_user_signups (date, users_count)
  VALUES ((COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Phnom_Penh')::date, 1)
  ON CONFLICT (date)
  DO UPDATE SET users_count = public.daily_user_signups.users_count + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_bump_daily_signups_trg ON public.profiles;
CREATE TRIGGER profiles_bump_daily_signups_trg
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.bump_daily_user_signups();

-- ── 3. Backfill aggregates from existing data ───────────────────────────────

INSERT INTO public.daily_content_views (content_type, content_id, date, views_count)
SELECT content_type,
       content_id,
       (viewed_at AT TIME ZONE 'Asia/Phnom_Penh')::date,
       count(*)
FROM public.view_logs
GROUP BY 1, 2, 3
ON CONFLICT (content_type, content_id, date)
DO UPDATE SET views_count = EXCLUDED.views_count;

INSERT INTO public.daily_content_downloads (content_type, content_id, date, downloads_count)
SELECT COALESCE(content_type, 'book'),
       content_id,
       (downloaded_at AT TIME ZONE 'Asia/Phnom_Penh')::date,
       count(*)
FROM public.download_logs
WHERE content_id IS NOT NULL
GROUP BY 1, 2, 3
ON CONFLICT (content_type, content_id, date)
DO UPDATE SET downloads_count = EXCLUDED.downloads_count;

INSERT INTO public.daily_user_signups (date, users_count)
SELECT (created_at AT TIME ZONE 'Asia/Phnom_Penh')::date, count(*)
FROM public.profiles
WHERE created_at IS NOT NULL
GROUP BY 1
ON CONFLICT (date)
DO UPDATE SET users_count = EXCLUDED.users_count;

-- ── 4. RLS: admin read-only (writes happen only via the triggers above) ─────

ALTER TABLE public.daily_content_views     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_content_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_user_signups      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read daily content views" ON public.daily_content_views;
CREATE POLICY "Admins can read daily content views"
  ON public.daily_content_views FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can read daily content downloads" ON public.daily_content_downloads;
CREATE POLICY "Admins can read daily content downloads"
  ON public.daily_content_downloads FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can read daily user signups" ON public.daily_user_signups;
CREATE POLICY "Admins can read daily user signups"
  ON public.daily_user_signups FOR SELECT USING (public.is_admin());
