-- 0157_koha_sync.sql
--
-- Koha Phase 2: the Physical Library becomes a READ-ONLY PROJECTION of Koha.
-- (docs/KOHA-SYNC.md; written only by lib/koha/sync-run.ts.)
--
-- Koha is the system of record for the physical collection. The e-Library
-- keeps its own copy of what it needs to show readers — records, copies,
-- availability — refreshed from Koha's REST API, and never writes to Koha.
-- This migration adds the smallest link that makes that possible, as agreed
-- at Gate 2: one Koha id on each side, plus ONE state table.
--
--   catalog_books.koha_biblio_id   Koha's biblionumber for this record
--   catalog_copies.koha_item_id    Koha's itemnumber for this copy
--
-- Both nullable: a record that has not been linked (a hand-made e-Library
-- record, or one Koha does not hold) simply has none. Both UNIQUE when set:
-- one Koha record is one e-Library record, one Koha item one copy — a second
-- row claiming the same id is a sync defect, and the database refuses it
-- rather than letting two pages show one book.
--
-- koha_sync_state holds ONE row per sync stream (today only 'catalog'):
-- where the incremental sync resumes (Koha's own change timestamps), a lease
-- so two runs cannot interleave, whether a human has approved the first full
-- build (`initialized_at` — the scheduled job refuses to run before it), and
-- the last run's outcome, including the exceptions a librarian must look at.
--
-- Additive only: no existing column changes meaning and no row is written.
-- Rollback: drop table public.koha_sync_state;
--           drop index catalog_books_koha_biblio_id_key, catalog_copies_koha_item_id_key;
--           alter table catalog_books drop column koha_biblio_id;
--           alter table catalog_copies drop column koha_item_id;

alter table public.catalog_books  add column if not exists koha_biblio_id integer;
alter table public.catalog_copies add column if not exists koha_item_id   integer;

create unique index if not exists catalog_books_koha_biblio_id_key
  on public.catalog_books (koha_biblio_id) where koha_biblio_id is not null;
create unique index if not exists catalog_copies_koha_item_id_key
  on public.catalog_copies (koha_item_id) where koha_item_id is not null;

comment on column public.catalog_books.koha_biblio_id is
  'Koha biblionumber this record is a projection of (Koha Phase 2 sync). NULL = not linked to Koha.';
comment on column public.catalog_copies.koha_item_id is
  'Koha itemnumber this copy is a projection of (Koha Phase 2 sync). NULL = not linked to Koha.';

create table if not exists public.koha_sync_state (
  stream            text primary key,
  -- Koha's own change timestamps (items.timestamp / biblio timestamp) as TEXT,
  -- exactly as Koha wrote them, offset included ("2026-09-26T13:52:57+07:00").
  -- Not timestamptz: Postgres would store the instant in UTC, and Koha 26.05's
  -- /biblios filter on `me.timestamp` compares a UTC ("Z") value as if it were
  -- Koha-local time — measured: seven hours early, so every record "changed".
  -- Sent back verbatim, the cursor means what Koha meant.
  items_cursor      text,
  biblios_cursor    text,
  -- Set by the first successful FULL apply, which a person runs from
  -- /admin/catalogs/koha-sync after reviewing its preview. Until then the
  -- scheduled job does nothing.
  initialized_at    timestamptz,
  initialized_by    uuid references public.profiles (id) on delete set null,
  -- Lease: a run claims the row with a compare-and-set on lease_expires_at, so
  -- a second run started while one is working gives up instead of racing it.
  lease_owner       text,
  lease_expires_at  timestamptz,
  last_run_at       timestamptz,
  -- false = a preview (read both sides, planned, wrote nothing to the catalogue).
  last_run_applied  boolean,
  last_run_mode     text,
  last_run_status   text,
  last_success_at   timestamptz,
  last_error        text,
  last_summary      jsonb not null default '{}'::jsonb,
  updated_at        timestamptz not null default now(),

  constraint koha_sync_state_stream_check check (stream in ('catalog')),
  constraint koha_sync_state_mode_check check (last_run_mode is null or last_run_mode in ('full', 'incremental')),
  constraint koha_sync_state_status_check check (last_run_status is null or last_run_status in ('ok', 'failed')),
  constraint koha_sync_state_summary_object check (jsonb_typeof(last_summary) = 'object'),
  -- The summary carries a bounded exception list; keep one row small.
  constraint koha_sync_state_summary_size check (pg_column_size(last_summary) <= 262144)
);

comment on table public.koha_sync_state is
  'Koha → e-Library read-only sync: cursors, lease, first-build approval and the last run''s outcome. Service role only.';

-- Read and written only through the service client by lib/koha/sync-run.ts,
-- behind requireAction() (admin page) or CRON_SECRET (scheduled job).
alter table public.koha_sync_state enable row level security;
revoke all on public.koha_sync_state from public, anon, authenticated;
grant all on public.koha_sync_state to service_role;
