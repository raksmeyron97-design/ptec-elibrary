-- 0083_author_credentials.sql
-- Store academic degrees / professional titles separately from author legal
-- names (2026-07-11 metadata audit). Display names must never embed degrees;
-- "Set Seng. Ph.D" was renamed to "Set Seng" by the data cleanup script
-- (scripts/fix-metadata-2026-07-11.mjs) and the degree lands here.
--
-- Safe to apply any time; nothing in the app reads the column until it exists
-- (admin/authors surfaces it defensively).

alter table public.authors
  add column if not exists credentials text;

comment on column public.authors.credentials is
  'Academic degree or professional title (e.g. "Ph.D."). Kept out of name so citations and displays never embed degrees in legal names.';

-- Backfill: the one author whose degree was stripped from the name by the
-- 2026-07-11 cleanup.
update public.authors
   set credentials = 'Ph.D.'
 where id = '65037ca3-ca39-4464-8c2c-9c340225235f'
   and credentials is null;
