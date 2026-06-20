-- 0030_role_lock_hardening.sql
-- Harden role-related columns against privilege escalation.
-- Safe to re-run: uses OR REPLACE / DROP IF EXISTS.

-- ── 1. Explicit column-level privilege lock ──────────────────────────────────
-- Migration 0019 granted UPDATE (full_name, avatar_url) on profiles.
-- Migration 0022 added is_super_admin AFTER that grant, so it should already
-- be excluded from the UPDATE privilege. However, we add explicit revokes for
-- defense-in-depth to be absolutely certain these columns cannot be updated
-- via the PostgREST / authenticated role path.

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT  UPDATE (full_name, avatar_url) ON public.profiles TO authenticated;

-- Belt-and-suspenders: PostgreSQL silently ignores REVOKE on columns that
-- weren't granted, so this is safe even if the above already covers it.
-- These explicit revokes make the intent crystal clear for future auditors.
DO $$
BEGIN
  -- Revoke column-level UPDATE on sensitive columns (no-op if not granted, but documents intent)
  EXECUTE 'REVOKE UPDATE (role) ON public.profiles FROM authenticated';
  EXECUTE 'REVOKE UPDATE (id) ON public.profiles FROM authenticated';
  EXECUTE 'REVOKE UPDATE (is_super_admin) ON public.profiles FROM authenticated';
EXCEPTION WHEN OTHERS THEN
  -- Column-level revokes may fail if columns don't exist in older schemas; ignore gracefully
  NULL;
END;
$$;

-- ── 2. Strengthen prevent_role_update() trigger ──────────────────────────────
-- Previous version (0004) allowed any admin to change any user's role.
-- New version:
--   - Blocks role changes by non-admins (same as before)
--   - Blocks is_super_admin changes by anyone (only service role can change it)
--   - Service role (auth.uid() IS NULL) bypasses all checks
CREATE OR REPLACE FUNCTION prevent_role_update() RETURNS trigger AS $$
BEGIN
  -- Service role (uid is NULL) can do anything — this is how toggleUserRole works
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Block is_super_admin changes from ANY authenticated user (including admins).
  -- Only the service_role key (which has NULL uid) can toggle this flag.
  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    RAISE EXCEPTION 'is_super_admin can only be changed via service role';
  END IF;

  -- Block role changes from non-admins
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
      RAISE EXCEPTION 'Unauthorized to change roles';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger exists (it was created in 0002 — this is idempotent)
DROP TRIGGER IF EXISTS tr_prevent_role_update ON profiles;
CREATE TRIGGER tr_prevent_role_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_update();

-- ── 3. Verify RLS is enabled on profiles (idempotent) ────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
