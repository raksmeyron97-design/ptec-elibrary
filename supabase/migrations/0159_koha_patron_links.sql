-- 0159_koha_patron_links.sql
--
-- Koha Phase 7/8 (docs/KOHA-PATRONS.md): an e-Library reader ↔ their Koha
-- library card, linked by a librarian at the desk, so the reader can see their
-- own loans and holds in My Library.
--
-- What is stored is the LINK and nothing else: the Koha patron id, and the
-- card's last four characters to show the reader and the librarian which card
-- it is. Names, loans and holds are read live from Koha (read-only
-- permissions) and never stored here.
--
-- One card per reader (the primary key) and one reader per card (the unique
-- index). Deleting the reader's profile removes the link; unlinking deletes
-- the row — it is a pairing, not a record, and every link and unlink is in the
-- admin audit log.

create table if not exists public.koha_patron_links (
  profile_id      uuid primary key references public.profiles (id) on delete cascade,
  koha_patron_id  integer not null check (koha_patron_id > 0),
  card_hint       text not null check (char_length(card_hint) between 1 and 16),
  linked_by       uuid references public.profiles (id) on delete set null,
  linked_at       timestamptz not null default now()
);

create unique index if not exists koha_patron_links_patron_key
  on public.koha_patron_links (koha_patron_id);

comment on table public.koha_patron_links is
  'e-Library reader ↔ Koha patron (library card), linked at the desk. The link only: patron data, loans and holds are read live from Koha. Service role only.';

-- Patron data is personal data: never exposed through PostgREST to a browser.
alter table public.koha_patron_links enable row level security;
revoke all on public.koha_patron_links from public, anon, authenticated;
grant all on public.koha_patron_links to service_role;
