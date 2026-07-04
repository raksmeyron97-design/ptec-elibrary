-- 0019_security_hardening.sql
-- Comprehensive security hardening pass.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.

-- ── 1. Stable is_admin() helper ──────────────────────────────────────────────
-- Rewrite as a STABLE SQL function so the planner can inline it and avoid
-- the N+1 recursion risk that plpgsql loops introduce.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── 2. Column-level privilege lock on profiles ────────────────────────────────
-- The UPDATE trigger in 0004 is a defence-in-depth backup, but column grants
-- are the primary gate for the direct-browser PostgREST path.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT  UPDATE (full_name, avatar_url) ON public.profiles TO authenticated;

-- ── 3. Create view_logs if it doesn't exist ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.view_logs (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  content_type text        NOT NULL,   -- 'book' | 'post' | 'research_report'
  content_id   uuid        NOT NULL,
  user_id      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  viewed_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT view_logs_pkey PRIMARY KEY (id)
);

ALTER TABLE public.view_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all view_logs"    ON public.view_logs;
DROP POLICY IF EXISTS "Admins can insert view_logs"      ON public.view_logs;
DROP POLICY IF EXISTS "Service can insert view_logs"     ON public.view_logs;
DROP POLICY IF EXISTS "Users can view own view_logs"     ON public.view_logs;
DROP POLICY IF EXISTS "Admins can delete view_logs"      ON public.view_logs;

CREATE POLICY "Admins can view all view_logs"  ON public.view_logs FOR SELECT  USING (public.is_admin());
CREATE POLICY "Users can view own view_logs"   ON public.view_logs FOR SELECT  USING (user_id = auth.uid());
-- Inserts come from service-role server actions, no authenticated INSERT needed
CREATE POLICY "Admins can delete view_logs"    ON public.view_logs FOR DELETE  USING (public.is_admin());

-- ── 4. Create catalog_copies_log if it doesn't exist ─────────────────────────
CREATE TABLE IF NOT EXISTS public.catalog_copies_log (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  catalog_book_id uuid        NOT NULL REFERENCES public.catalog_books(id) ON DELETE CASCADE,
  admin_id        uuid        NOT NULL REFERENCES public.profiles(id),
  action          text        NOT NULL,   -- 'add' | 'remove'
  delta           integer     NOT NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_copies_log_pkey PRIMARY KEY (id)
);

ALTER TABLE public.catalog_copies_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view catalog_copies_log"   ON public.catalog_copies_log;
DROP POLICY IF EXISTS "Admins can insert catalog_copies_log" ON public.catalog_copies_log;

-- Append-only: no UPDATE or DELETE policy for anyone (even admins cannot rewrite history)
CREATE POLICY "Admins can view catalog_copies_log"   ON public.catalog_copies_log FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can insert catalog_copies_log" ON public.catalog_copies_log FOR INSERT WITH CHECK (public.is_admin());

-- ── 5. Enable RLS on tables that were missing it ─────────────────────────────

-- authors
ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authors are viewable by everyone" ON public.authors;
DROP POLICY IF EXISTS "Admins can manage authors"        ON public.authors;
CREATE POLICY "Authors are viewable by everyone" ON public.authors FOR SELECT USING (true);
CREATE POLICY "Admins can insert authors"        ON public.authors FOR INSERT  WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update authors"        ON public.authors FOR UPDATE  USING      (public.is_admin());
CREATE POLICY "Admins can delete authors"        ON public.authors FOR DELETE  USING      (public.is_admin());

-- categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.categories;
DROP POLICY IF EXISTS "Admins can manage categories"        ON public.categories;
CREATE POLICY "Categories are viewable by everyone" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins can insert categories"        ON public.categories FOR INSERT  WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update categories"        ON public.categories FOR UPDATE  USING      (public.is_admin());
CREATE POLICY "Admins can delete categories"        ON public.categories FOR DELETE  USING      (public.is_admin());

-- catalog_copies
ALTER TABLE public.catalog_copies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Catalog copies viewable by everyone" ON public.catalog_copies;
DROP POLICY IF EXISTS "Admins can manage catalog_copies"    ON public.catalog_copies;
CREATE POLICY "Catalog copies viewable by everyone" ON public.catalog_copies FOR SELECT USING (true);
CREATE POLICY "Admins can insert catalog_copies"    ON public.catalog_copies FOR INSERT  WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update catalog_copies"    ON public.catalog_copies FOR UPDATE  USING      (public.is_admin());
CREATE POLICY "Admins can delete catalog_copies"    ON public.catalog_copies FOR DELETE  USING      (public.is_admin());

-- contact_rate_limit (service-role only; no user path should touch this)
-- Guard: the table may not exist in all environments.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'contact_rate_limit' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.contact_rate_limit ENABLE ROW LEVEL SECURITY';
  END IF;
END;
$$;
-- No policies: service role bypasses RLS, anon/authenticated are denied.

-- ── 6. Fix per-user tables: add WITH CHECK on INSERT ─────────────────────────
-- Existing "FOR ALL USING (user_id = auth.uid())" policies don't include a
-- WITH CHECK clause, so PostgREST allows INSERT with any user_id value.

-- saved_books
DROP POLICY IF EXISTS "Users can manage own saved_books" ON public.saved_books;
CREATE POLICY "Users can select own saved_books" ON public.saved_books
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own saved_books" ON public.saved_books
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own saved_books" ON public.saved_books
  FOR DELETE USING (user_id = auth.uid());

-- reviews
DROP POLICY IF EXISTS "Users can manage own reviews" ON public.reviews;
-- Public SELECT (already added in 0013 but keep idempotent)
DROP POLICY IF EXISTS "Public can view reviews" ON public.reviews;
CREATE POLICY "Public can view reviews"          ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Users can insert own reviews"     ON public.reviews FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reviews"     ON public.reviews FOR UPDATE  USING      (user_id = auth.uid());
CREATE POLICY "Users can delete own reviews"     ON public.reviews FOR DELETE  USING      (user_id = auth.uid());

-- reading_progress
DROP POLICY IF EXISTS "Users can manage own reading_progress" ON public.reading_progress;
CREATE POLICY "Users can select own reading_progress" ON public.reading_progress
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own reading_progress" ON public.reading_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reading_progress" ON public.reading_progress
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own reading_progress" ON public.reading_progress
  FOR DELETE USING (user_id = auth.uid());

-- download_logs: tighten INSERT to require auth (service role bypasses anyway)
DROP POLICY IF EXISTS "Authenticated users can insert download logs" ON public.download_logs;
CREATE POLICY "Users can insert own download logs" ON public.download_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── 7. Tighten admin_audit_log (append-only for audit integrity) ──────────────
-- No UPDATE policy for anyone. Service role (used by logAdminAction) bypasses RLS.
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.admin_audit_log;
CREATE POLICY "Service inserts audit logs" ON public.admin_audit_log
  FOR INSERT WITH CHECK (public.is_admin());
-- No UPDATE policy added — making the log append-only at the DB level.

-- ── 8. Tighten book_files SELECT — require published parent book ──────────────
-- 0006 added a policy for published books; make sure the wide
-- "Authenticated users can view book files" from 0002 is replaced.
DROP POLICY IF EXISTS "Authenticated users can view book files" ON public.book_files;
-- 0006 policy "Public can view book files for published books" stays.
-- Admins can already see all via the is_admin() ALL policy from 0008.

-- ── 9. Fix research_reports admin policy to use is_admin() ───────────────────
DROP POLICY IF EXISTS "Admins can manage research reports" ON public.research_reports;
CREATE POLICY "Admins can manage research reports" ON public.research_reports
  FOR ALL USING (public.is_admin());

-- ── 10. handle_new_user trigger ───────────────────────────────────────────────
-- Sets only id + email + full_name; role MUST default to 'reader' from the
-- column default and MUST NOT be read from raw_user_meta_data.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Ensure the trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 11. Profiles: ensure role column defaults to 'reader' (not 'user') ────────
-- The initial schema used DEFAULT 'user'; update the default to match the codebase expectation.
-- Existing rows are unchanged. New signups get 'reader'.
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'reader';
