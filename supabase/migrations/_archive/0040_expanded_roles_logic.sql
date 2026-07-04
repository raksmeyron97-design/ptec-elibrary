-- 0040_expanded_roles_logic.sql
-- PART 2 of 2: Functions, trigger, and RLS policies for the expanded role system.
-- Runs after 0039 has committed the new user_role enum values.

-- ── 1. Update is_admin() to cover admin + super_admin ────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

-- ── 2. New role-level helper functions ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('staff', 'librarian', 'admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_librarian()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('librarian', 'admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin_role()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'super_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_staff()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_librarian()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin_role() TO authenticated;

-- ── 3. Update prevent_role_update() trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_role_update() RETURNS trigger AS $$
DECLARE
  caller_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    RAISE EXCEPTION 'is_super_admin can only be changed via service role';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    SELECT role::text INTO caller_role FROM profiles WHERE id = auth.uid();

    IF caller_role NOT IN ('admin', 'super_admin') THEN
      RAISE EXCEPTION 'Unauthorized to change roles';
    END IF;

    IF NEW.role::text IN ('admin', 'super_admin') AND caller_role != 'super_admin' THEN
      RAISE EXCEPTION 'Only super_admin can assign admin or super_admin roles';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_prevent_role_update ON profiles;
CREATE TRIGGER tr_prevent_role_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_update();

-- ── 4. Fix RLS policies that inline role = 'admin' ───────────────────────────

DROP POLICY IF EXISTS "admins_read_notifications" ON public.notifications;
CREATE POLICY "admins_read_notifications"
  ON public.notifications FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_log;
CREATE POLICY "Admins can view audit logs"
  ON public.admin_audit_log FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Service inserts audit logs" ON public.admin_audit_log;
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.admin_audit_log;
CREATE POLICY "Admins can insert audit logs"
  ON public.admin_audit_log FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "comment_likes_delete_own_or_admin" ON public.comment_likes;
CREATE POLICY "comment_likes_delete_own_or_admin"
  ON public.comment_likes FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "team_members_admin_read" ON public.team_members;
CREATE POLICY "team_members_admin_read"
  ON public.team_members FOR SELECT
  USING (public.is_admin());

-- ── 5. Performance index on profiles.role ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
