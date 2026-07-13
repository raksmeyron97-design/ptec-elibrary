-- 0092_publication_data_correction.sql  (MANUAL — do NOT put in migrations/)
--
-- ┌─ APPLICATION STATUS (2026-07-13) ──────────────────────────────────────────┐
-- │ The bibliographic corrections to EXISTING columns (doi, volume, issue,     │
-- │ pages, dates, journal, publisher, license→NULL, copyright), the fake-ORCID │
-- │ null-out, and the 4 missing co-authors were ALREADY APPLIED to the hosted  │
-- │ DB via PostgREST (service key) on 2026-07-13. Row backup:                  │
-- │   supabase/manual/0092_backup_20260713-185134.json                         │
-- │ The guarded UPDATE below is therefore now a NO-OP (its WHERE doi='10.1234/  │
-- │ eds' no longer matches). What REMAINS is the NEW-column fields (issn,       │
-- │ metadata_verified*, fulltext_redistributable, rights_source, metadata_     │
-- │ source): they need migration 0092 (schema) applied first, then run the     │
-- │ "POST-DEPLOY" block at the very bottom of this file.                        │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- Corrects the representative publication record
--   slug = 'journal-of-chemical-education'
-- from placeholder/incorrect values to the AUTHORITATIVE bibliographic metadata
-- registered for its DOI. Source of truth (verified 2026-07-13):
--   Crossref API:  https://api.crossref.org/works/10.1021/ed500143m
--   Publisher rec: https://pubs.acs.org/doi/10.1021/ed500143m
--
-- WHY THIS IS MANUAL: it changes canonical academic identity + licensing on a
-- production record, which is an explicit stop-condition. Apply only after an
-- authorized administrator has reviewed it. It is idempotent (guarded WHERE)
-- and reversible (rollback block at the bottom). A full backup of the row is
-- taken into publications_backup_0092 first.
--
-- IMPORTANT LICENSING NOTE: this article is © 2014 American Chemical Society and
-- is NOT open access. This script therefore:
--   * removes the invalid 'CC BY 44' license (sets license = NULL — no verified
--     open license), keeping the copyright statement,
--   * sets fulltext_redistributable = false (the hosted PDF must not be
--     presented as open access / free redistribution),
--   * does NOT delete the uploaded file — flag it for authorized review instead.
--
-- Verified corrections (DB → Crossref):
--   doi              10.1234/eds        → 10.1021/ed500143m
--   volume           19                 → 91          (digits were transposed)
--   page_start/end   1 / 2              → 776 / 777
--   publication_date 2026-07-04         → 2014-04-03  (was the repo import date)
--   issn             (none)             → 0021-9584   (print; online 1938-1328)
--   license          CC BY 44           → NULL        (©ACS, not open access)
--   authors          Shadi Abu-Baker    → + Ghaffari, Al-Saghir, Thamburaj, Higazi
--   author ORCID     001                → NULL        (no real ORCID registered)

begin;

-- 0. Backup the exact current row (once).
create table if not exists public.publications_backup_0092 as
  select * from public.publications where slug = 'journal-of-chemical-education';

-- 1. Bibliographic corrections (only touch the known placeholder row/values).
update public.publications
set
  doi              = '10.1021/ed500143m',
  volume           = '91',
  issue_no         = '6',
  page_start       = '776',
  page_end         = '777',
  publication_date = '2014-04-03',
  published_at     = '2014-04-03T00:00:00+00:00',
  issn             = '0021-9584',
  journal_name     = 'Journal of Chemical Education',
  publisher        = 'American Chemical Society',
  -- Invalid 'CC BY 44' removed; no verified open license for this ©article.
  license          = null,
  copyright        = 'Copyright © 2014 The American Chemical Society and Division of Chemical Education, Inc.',
  -- The stored ISBN is the REVIEWED BOOK's ISBN, not the article's identifier.
  -- Keep it in .isbn for reference, but it must never be emitted as the
  -- article's own identifier (the code already prevents that).
  metadata_verified    = true,
  metadata_verified_at = now(),
  metadata_source      = 'Crossref https://doi.org/10.1021/ed500143m (verified 2026-07-13)',
  fulltext_redistributable = false,
  rights_source        = '© 2014 ACS — paywalled; no redistribution license on record'
where slug = 'journal-of-chemical-education'
  and doi = '10.1234/eds';   -- guard: only run against the un-corrected record

-- 2. Remove the fake ORCID on the (sole) author of this record.
update public.publication_authors
set orcid = null
where orcid = '001';

-- 3. Add the four missing co-authors (in Crossref order) IF the article
--    currently has only its first author. This is intentionally conservative:
--    it inserts author rows + authorships only when they are absent, so it is
--    safe to re-run. Adjust affiliation_ids later via the admin UI.
do $$
declare
  v_pub_id uuid;
  v_author_id uuid;
  v_order int;
  rec record;
begin
  select id into v_pub_id from public.publications where slug = 'journal-of-chemical-education';
  if v_pub_id is null then raise notice 'publication not found; skipping author top-up'; return; end if;

  for rec in
    select * from (values
      (2, 'Shahrokh Ghaffari'),
      (3, 'Mohannad Al-Saghir'),
      (4, 'Raj Thamburaj'),
      (5, 'Tarig Higazi')
    ) as t(ord, full_name)
  loop
    v_order := rec.ord;
    -- reuse an existing author row with the same name, else create one
    select id into v_author_id from public.publication_authors where full_name = rec.full_name limit 1;
    if v_author_id is null then
      insert into public.publication_authors (full_name) values (rec.full_name) returning id into v_author_id;
    end if;
    -- add the authorship link if missing
    if not exists (
      select 1 from public.publication_authorships
      where publication_id = v_pub_id and author_id = v_author_id
    ) then
      insert into public.publication_authorships (publication_id, author_id, author_order, is_corresponding, affiliation_ids)
      values (v_pub_id, v_author_id, v_order, false, '{}');
    end if;
  end loop;
end $$;

commit;

-- ── POST-DEPLOY (run once migration 0092 has added the new columns) ──────────
-- These set the fields that require the new columns; safe + idempotent.
-- update public.publications set
--   issn = '0021-9584',
--   metadata_verified = true,
--   metadata_verified_at = now(),
--   metadata_source = 'Crossref https://doi.org/10.1021/ed500143m (verified 2026-07-13)',
--   fulltext_redistributable = false,
--   rights_source = '© 2014 ACS — paywalled; no redistribution license on record'
-- where slug = 'journal-of-chemical-education';

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- begin;
--   update public.publications p
--     set doi = b.doi, volume = b.volume, issue_no = b.issue_no,
--         page_start = b.page_start, page_end = b.page_end,
--         publication_date = b.publication_date, published_at = b.published_at,
--         issn = b.issn, journal_name = b.journal_name, publisher = b.publisher,
--         license = b.license, copyright = b.copyright,
--         metadata_verified = coalesce(b.metadata_verified, false),
--         metadata_verified_at = b.metadata_verified_at, metadata_source = b.metadata_source,
--         fulltext_redistributable = coalesce(b.fulltext_redistributable, false),
--         rights_source = b.rights_source
--     from public.publications_backup_0092 b
--     where p.slug = 'journal-of-chemical-education' and b.slug = p.slug;
--   -- (Author top-up + ORCID null-out are not auto-reverted; restore from a DB backup if needed.)
-- commit;
