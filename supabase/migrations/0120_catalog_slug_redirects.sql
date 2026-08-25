-- 0120_catalog_slug_redirects.sql
-- Permanent slug redirects for physical catalog records whose slug changed.
--
-- The catalog edit wizard now lets a cataloguer correct a record's slug (a
-- typo'd or auto-generated one). Changing a slug silently breaks every link
-- into the old URL — bookmarks, reading lists, QR codes on shelf labels, and
-- accumulated search-engine signal. Each change therefore leaves a row here
-- mapping the retired slug to the record it belonged to, and the middleware
-- gate (lib/resource-slug-gate.ts) turns /catalogs/<old-slug> into a real HTTP
-- 301 rather than a 404.
--
-- This is the same shape as 0091_book_slug_redirects.sql for e-books, and the
-- same safety rules are enforced by the write path
-- (app/(admin)/admin/(protected)/catalogs/actions.ts):
--   * redirects always point at a book id, never another slug — a redirect can
--     therefore never target another redirect (no chains);
--   * any redirect rows already pointing at this book are left pointing at it,
--     so an a → b → c rename sequence collapses to a → c and b → c;
--   * a redirect whose old_slug equals the record's new slug is deleted rather
--     than followed (no self-loops), which is what happens when a cataloguer
--     renames a record and then renames it back.
--
-- Anon SELECT is required: middleware resolves redirects with the anon key.
-- Rows contain only slugs — no private data.
--
-- Rollback: drop table public.catalog_slug_redirects (nothing else references it).

create table if not exists public.catalog_slug_redirects (
  old_slug   text        primary key,
  book_id    uuid        not null references public.catalog_books (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists catalog_slug_redirects_book_id_idx
  on public.catalog_slug_redirects (book_id);

alter table public.catalog_slug_redirects enable row level security;
revoke all on table public.catalog_slug_redirects from public, anon, authenticated;

-- Read-only for everyone (public redirect data); writes stay service-role only.
grant select on table public.catalog_slug_redirects to anon, authenticated;

drop policy if exists "catalog_slug_redirects_public_read" on public.catalog_slug_redirects;
create policy "catalog_slug_redirects_public_read"
  on public.catalog_slug_redirects
  for select
  using (true);
