-- 0169_catalog_review_state.sql
--
-- The Physical Library's librarian review: which records a person has checked
-- against the book in hand, who is checking one now, and which cannot be
-- finished yet. docs/CATALOG-REVIEW.md.
--
-- WHY A TABLE OF ITS OWN, NOT COLUMNS ON catalog_books. catalog_books and
-- catalog_copies are readable by anyone (`USING (true)`, 0117 — deliberate:
-- the public catalogue is built from them). A review status, an assignee or a
-- note added there would be published to anon through PostgREST. This table
-- is service-role only, like book_description_drafts (0164) and
-- duplicate_dismissals (0153).
--
-- WHY NOT THE 0086 REVIEW ENGINE. books.status drives publication
-- (`is_published` is mirrored from it). Borrowing it for the catalogue would
-- make "checked by a librarian" and "visible to readers" one column again —
-- the is_active overload this design exists to avoid. is_active stays public
-- visibility and is not read or written here.
--
-- WHY NO BACKFILL. A record with NO row needs review; that is the state of all
-- 2,639 production records today (every one came from PMB through Koha). So
-- this migration writes no row, and turning the feature off leaves nothing
-- behind that any reader sees. 'needs_review' is still a legal stored value:
-- releasing a claim on a record that carries waived tasks or provenance must
-- not delete them.
--
-- WHAT IS NOT STORED, BECAUSE IT CAN BE DERIVED. "Changed since verified"
-- (verified_fingerprint against the live row), a stale claim (claimed_at
-- older than the claim lease), the record's tasks (lib/catalogs/record-health.ts),
-- its language queue (catalog_books.language). A stored copy of any of these
-- could disagree with the record it describes.
--
-- Koha has no review concept and this table is never written to Koha.

set local lock_timeout = '10s';

create table if not exists public.catalog_review_state (
  book_id              uuid primary key references public.catalog_books (id) on delete cascade,
  status               text not null default 'needs_review',
  assigned_to          uuid references public.profiles (id) on delete set null,
  claimed_at           timestamptz,
  reviewed_by          uuid references public.profiles (id) on delete set null,
  reviewed_at          timestamptz,
  verified_fingerprint text,
  waived_tasks         text[] not null default '{}'::text[],
  blocked_reason       text,
  blocked_note         text,
  field_sources        jsonb not null default '{}'::jsonb,
  version              integer not null default 1,
  updated_at           timestamptz not null default now(),
  constraint catalog_review_state_status_check
    check (status in ('needs_review', 'in_review', 'verified', 'blocked')),
  constraint catalog_review_state_claim_shape
    check (status <> 'in_review' or (assigned_to is not null and claimed_at is not null)),
  constraint catalog_review_state_blocked_reason_check
    check (blocked_reason is null or blocked_reason in ('book_not_found', 'needs_koha', 'needs_decision', 'other')),
  constraint catalog_review_state_blocked_shape
    check (status <> 'blocked' or blocked_reason is not null),
  constraint catalog_review_state_blocked_note_len
    check (blocked_note is null or char_length(blocked_note) <= 500),
  constraint catalog_review_state_fingerprint_shape
    check (verified_fingerprint is null or verified_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint catalog_review_state_field_sources_object
    check (jsonb_typeof(field_sources) = 'object'),
  constraint catalog_review_state_field_sources_size
    check (pg_column_size(field_sources) <= 65536),
  constraint catalog_review_state_version_positive
    check (version >= 1)
);

create index if not exists catalog_review_state_status_idx
  on public.catalog_review_state (status);
create index if not exists catalog_review_state_assigned_to_idx
  on public.catalog_review_state (assigned_to) where assigned_to is not null;

comment on table public.catalog_review_state is
  'Librarian review of Physical Library records (docs/CATALOG-REVIEW.md). No row = needs review. Service role only; never written to Koha.';
comment on column public.catalog_review_state.version is
  'Compare-and-set counter: every transition names the version it read, so two librarians cannot both claim or verify one record.';
comment on column public.catalog_review_state.verified_fingerprint is
  'sha256 of the bibliographic fields when the record was verified; a live row that no longer matches reads as changed since verification.';

alter table public.catalog_review_state enable row level security;
revoke all on public.catalog_review_state from public, anon, authenticated;
grant all on public.catalog_review_state to service_role;
