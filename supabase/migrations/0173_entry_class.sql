-- 0173_entry_class.sql
--
-- How a session began, on the two rows the sign-in-wall question needs
-- (SEO audit 2026-10, WI-3 / P2-10): a book detail view (view_logs) and a
-- reader open (reader_open_logs).
--
-- One of five classes, decided in the browser on the landing page
-- (lib/analytics/entry-class.ts): search · social · referral · direct ·
-- internal. Never a referrer URL, host or path — a referrer can carry the
-- visitor's search query, and the class is all the measurement needs.
-- NULL means "not recorded": rows from before this migration, a blocked
-- browser, or ENTRY_CLASS=off.
--
-- The constraint is added NOT VALID and validated separately: view_logs is
-- one of the largest tables here, and a plain ADD CONSTRAINT holds its lock
-- for the whole validation scan. Additive; existing readers and writers keep
-- working (lib/analytics/events.ts retries without the column during the
-- deploy window).
--
-- Rollback:
--   alter table public.view_logs drop column if exists entry_class;
--   alter table public.reader_open_logs drop column if exists entry_class;

set local lock_timeout = '10s';

alter table public.view_logs add column if not exists entry_class text;
alter table public.reader_open_logs add column if not exists entry_class text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'view_logs_entry_class_check' and conrelid = 'public.view_logs'::regclass
  ) then
    alter table public.view_logs
      add constraint view_logs_entry_class_check
      check (entry_class in ('search', 'social', 'referral', 'direct', 'internal')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'reader_open_logs_entry_class_check' and conrelid = 'public.reader_open_logs'::regclass
  ) then
    alter table public.reader_open_logs
      add constraint reader_open_logs_entry_class_check
      check (entry_class in ('search', 'social', 'referral', 'direct', 'internal')) not valid;
  end if;
end $$;

alter table public.view_logs validate constraint view_logs_entry_class_check;
alter table public.reader_open_logs validate constraint reader_open_logs_entry_class_check;
