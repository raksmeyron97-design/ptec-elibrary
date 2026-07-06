-- 0062_trust_fields.sql
-- Trust/data-quality layer (Area 1 of the 2026-07-06 improvement roadmap):
-- a rights/license field so teachers know what they may legally do with a
-- resource, and a "verified by librarian" signal shown as a badge.
--
-- verified_at/verified_by are set automatically when a librarian approves a
-- pending_review item (see app/actions/review.ts) — approval doubles as
-- verification. They can also be set directly from the edit forms for
-- existing published content.

alter table public.books
  add column if not exists license text not null default 'unknown'
    check (license in ('public_domain', 'cc_by', 'cc_by_nc', 'cc_by_nc_nd', 'moeys_open', 'all_rights_reserved', 'unknown')),
  add column if not exists source_attribution text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null;

alter table public.research_reports
  add column if not exists license text not null default 'unknown'
    check (license in ('public_domain', 'cc_by', 'cc_by_nc', 'cc_by_nc_nd', 'moeys_open', 'all_rights_reserved', 'unknown')),
  add column if not exists source_attribution text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null;
