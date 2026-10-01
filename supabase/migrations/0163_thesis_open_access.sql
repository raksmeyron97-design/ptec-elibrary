-- 0163_thesis_open_access.sql
--
-- Open access for theses and research reports (SEO programme Phase 3.1/3.4,
-- decisions D4 and D12).
--
-- A thesis's full text is public ONLY when a librarian has recorded both its
-- licence and the authors' consent. Then, and only then, it is served
-- anonymously at /theses/<slug>/fulltext.pdf and named in
-- `citation_pdf_url` for Google Scholar. Everything else stays exactly as it
-- is: the signed-in download, the Top-10 protection and the admin override
-- are untouched (lib/theses/download-permission.ts).
--
--   access              'restricted' (default) | 'open'.
--   access_consent_at   when the librarian recorded the authors' consent.
--   access_consent_by   who recorded it (profile id; kept if they leave).
--   report_number       a technical report's own number, when it has one
--                       (citation_technical_report_number).
--
-- The rule is a CHECK constraint, not application logic: a row cannot be
-- `open` without a recorded licence (not 'unknown') and a consent timestamp,
-- whatever writes it. Every existing row takes the default, 'restricted', so
-- nothing becomes public by this migration.

-- Give up rather than queue. On the box each migration runs in ONE
-- transaction (infra/supabase/scripts/migrate.sh), so this lasts exactly as
-- long as this file. Under load, an ALTER waiting for its lock makes every
-- read of the table wait behind it; failing after 10 s instead aborts the
-- deploy cleanly (the old image keeps serving) and the next deploy tick
-- retries. Outside a transaction it is a warning and changes nothing.
set local lock_timeout = '10s';

alter table public.research_reports
  add column if not exists access text not null default 'restricted',
  add column if not exists access_consent_at timestamptz,
  add column if not exists access_consent_by uuid,
  add column if not exists report_number text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_reports_access_check'
      and conrelid = 'public.research_reports'::regclass
  ) then
    alter table public.research_reports
      add constraint research_reports_access_check
      check (access in ('open', 'restricted'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'research_reports_open_needs_licence_and_consent'
      and conrelid = 'public.research_reports'::regclass
  ) then
    alter table public.research_reports
      add constraint research_reports_open_needs_licence_and_consent
      check (
        access <> 'open'
        or (
          license is not null
          and btrim(license) <> ''
          and license <> 'unknown'
          and access_consent_at is not null
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'research_reports_access_consent_by_fkey'
      and conrelid = 'public.research_reports'::regclass
  ) then
    alter table public.research_reports
      add constraint research_reports_access_consent_by_fkey
      foreign key (access_consent_by) references public.profiles (id) on delete set null;
  end if;
end $$;

comment on column public.research_reports.access is
  'restricted (default) | open. Open = full text served anonymously at /theses/<slug>/fulltext.pdf and cited to Google Scholar. Requires a licence and recorded consent (CHECK).';
comment on column public.research_reports.access_consent_at is
  'When a librarian recorded the authors'' consent to public access.';
comment on column public.research_reports.access_consent_by is
  'Profile of the librarian who recorded the consent.';
comment on column public.research_reports.report_number is
  'A technical report''s own number, for citation_technical_report_number.';
