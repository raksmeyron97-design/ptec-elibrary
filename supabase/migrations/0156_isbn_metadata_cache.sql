-- 0156_isbn_metadata_cache.sql
--
-- What public metadata providers said about an ISBN, kept so "Add by ISBN"
-- asks Google Books / Open Library about an ISBN once, not once per click.
-- (docs/KOHA-ISBN-WORKFLOW.md; written by lib/isbn/cache.ts.)
--
-- ONE ROW PER (isbn13, provider). A provider can return several editions for
-- one ISBN, so the answer is stored whole as `candidates` (the normalised
-- IsbnCandidate list the librarian was shown), not as one row per edition —
-- the cache's job is to replay an answer, not to become a second catalogue.
--
-- `status` is 'found' or 'not_found'. Errors (a quota stop, a timeout) are
-- NEVER stored: they say nothing about the ISBN, and caching one would make a
-- passing outage look like a missing book for days. Found answers expire after
-- 90 days, not-found after 7 (a record can appear later) — the expiry is
-- computed by the writer so the policy lives in one place (lib/isbn/cache.ts).
--
-- Nothing here is authoritative. A candidate becomes a catalogue record only
-- when a librarian reviews it on the Add form and saves; a Koha record only in
-- a later phase, through Koha.
--
-- Rollback: drop table public.isbn_metadata_cache; — nothing else depends on it.

create table if not exists public.isbn_metadata_cache (
  isbn13      text not null,
  provider    text not null,
  status      text not null,
  candidates  jsonb not null default '[]'::jsonb,
  fetched_at  timestamptz not null default now(),
  expires_at  timestamptz not null,

  primary key (isbn13, provider),
  constraint isbn_metadata_cache_isbn13_shape check (isbn13 ~ '^97[89][0-9]{10}$'),
  constraint isbn_metadata_cache_provider_check check (provider in ('open_library', 'google_books')),
  constraint isbn_metadata_cache_status_check check (status in ('found', 'not_found')),
  constraint isbn_metadata_cache_candidates_array check (jsonb_typeof(candidates) = 'array'),
  -- A cached answer is replayed to a librarian's screen; bound what one row can hold.
  constraint isbn_metadata_cache_candidates_size check (pg_column_size(candidates) <= 262144)
);

-- Housekeeping reads by expiry (a future cleanup job); lookups use the primary key.
create index if not exists isbn_metadata_cache_expires_at_idx
  on public.isbn_metadata_cache (expires_at);

comment on table public.isbn_metadata_cache is
  'Provider answers (Google Books, Open Library) for Add by ISBN, keyed by ISBN-13 and provider. Not authoritative; read and written only by the service role.';

-- Read and written only through the service client from the catalogue's
-- lookupCatalogIsbn() server action, which requires catalog:write. PostgREST
-- exposes every public-schema table by default, so this both enables RLS (with
-- no policy, denying everything) and revokes the API roles outright.
alter table public.isbn_metadata_cache enable row level security;

revoke all on public.isbn_metadata_cache from public, anon, authenticated;
grant all on public.isbn_metadata_cache to service_role;
