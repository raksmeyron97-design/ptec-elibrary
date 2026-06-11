-- 0022_super_admin.sql
-- Add is_super_admin flag to profiles.
-- Super admins can promote/demote users without password confirmation.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;
