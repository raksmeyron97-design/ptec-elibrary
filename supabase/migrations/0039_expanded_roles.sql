-- 0039_expanded_roles.sql
-- PART 1 of 2: Extend the user_role enum with new values.
-- Must be a separate migration from any SQL that references the new values,
-- because PostgreSQL requires new enum values to be committed before use.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.user_role'::regtype AND enumlabel = 'staff'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'staff';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.user_role'::regtype AND enumlabel = 'librarian'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'librarian';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.user_role'::regtype AND enumlabel = 'super_admin'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'super_admin';
  END IF;
END;
$$;
