-- 0162_author_profile_fields.sql
--
-- Author pages that can earn their place in the index (SEO programme Phase
-- 2.6, finding F8, decision D2).
--
-- An author page is indexed only when it has at least SEO_AUTHOR_MIN_WORKS
-- works (default 3) or an APPROVED biography; otherwise it is `noindex,
-- follow` and left out of the sitemap (lib/authors/indexability.ts). Journal
-- authors (`publication_authors`, 0125) already carry a Khmer biography, an
-- affiliation, a position, an ORCID and a Scholar link, and a published
-- academic profile is the approval of its biography. Book authors
-- (`authors`) carry a single `bio` with no language and no approval, so they
-- get the same optional fields here:
--
--   bio            unchanged: the English (or only) biography.
--   bio_km         the Khmer biography.
--   bio_status     'draft' | 'approved'. Only an approved biography counts
--                  toward indexing. Existing biographies stay 'draft' — this
--                  migration approves nothing; a librarian does.
--   affiliation, position_title, orcid, scholar_url
--                  optional, shown when set.
--   is_ptec_staff  true for PTEC staff, whose page shows their role and the
--                  theses they advised. Also added to `publication_authors`.
--
-- Additive, nullable or defaulted: every existing reader, writer and the e2e
-- seed keep working untouched. No new table, so the existing RLS policies
-- and grants on both tables govern the new columns, which are public profile
-- copy like `bio`.

alter table public.authors
  add column if not exists bio_km text,
  add column if not exists bio_status text not null default 'draft',
  add column if not exists affiliation text,
  add column if not exists position_title text,
  add column if not exists orcid text,
  add column if not exists scholar_url text,
  add column if not exists is_ptec_staff boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'authors_bio_status_check'
      and conrelid = 'public.authors'::regclass
  ) then
    alter table public.authors
      add constraint authors_bio_status_check
      check (bio_status in ('draft', 'approved'));
  end if;
end $$;

alter table public.publication_authors
  add column if not exists is_ptec_staff boolean not null default false;

comment on column public.authors.bio_km is 'Khmer biography.';
comment on column public.authors.bio_status is
  'draft | approved. Only an approved biography makes a page with few works indexable (lib/authors/indexability.ts).';
comment on column public.authors.affiliation is 'Institution the author belongs to, as it should be shown.';
comment on column public.authors.position_title is 'Role or position, shown on the author page.';
comment on column public.authors.orcid is 'ORCID iD, 0000-0000-0000-0000.';
comment on column public.authors.scholar_url is 'Google Scholar profile URL.';
comment on column public.authors.is_ptec_staff is
  'PTEC staff: the author page shows their role and the theses they advised.';
comment on column public.publication_authors.is_ptec_staff is
  'PTEC staff: the author page shows their role and the theses they advised.';
