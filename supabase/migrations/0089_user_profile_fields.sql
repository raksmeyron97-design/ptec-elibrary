-- 0089_user_profile_fields.sql
-- Squashed replacement for the former 0089_memberships.sql + 0090_drop_memberships.sql.
--
-- PTEC e-Library is a FREE public library with unlimited access — there is no
-- membership / subscription / borrowing / pricing concept. The original 0089
-- briefly created membership tables and 0090 dropped them again; the only
-- lasting change was the two profile columns below, which the admin Users page
-- still uses:
--   • status — account lifecycle badge + filter (active / pending / disabled / blocked)
--   • phone  — contact number shown in the user detail drawer
--
-- Idempotent (`add column if not exists`): a no-op on a database where the old
-- 0089+0090 were already applied, and reproduces the exact end state on a fresh
-- database.

alter table public.profiles
  add column if not exists status text not null default 'active'
    check (status in ('active', 'pending', 'disabled', 'blocked')),
  add column if not exists phone  text;

-- Rollback:
-- alter table public.profiles drop column if exists status, drop column if exists phone;
