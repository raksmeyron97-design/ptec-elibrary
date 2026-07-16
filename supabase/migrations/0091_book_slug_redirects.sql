-- 0091_book_slug_redirects.sql
-- Permanent slug redirects for retired e-book records (duplicate cleanup).
--
-- When an admin retires a duplicate book (/admin/manage/duplicates), the
-- duplicate is archived (0077 status → sync trigger clears is_published) and
-- one row lands here mapping its old slug to the surviving canonical record.
-- Middleware (lib/book-slug-gate.ts) reads this table anonymously to issue a
-- real HTTP 301 from /books/<old-slug> to /books/<canonical-slug>, so links,
-- bookmarks, and search-engine signals consolidate onto the canonical page.
--
-- Chain/loop safety is enforced by the retire action (app/actions/duplicates.ts):
--   * redirects always point at a book id, never another slug — a redirect can
--     therefore never target another redirect (no chains);
--   * any redirect rows already pointing at the retired book are re-pointed to
--     the canonical book in the same operation;
--   * a redirect whose old_slug equals its target book's current slug is
--     deleted rather than followed (no self-loops).
--
-- Anon SELECT is required: middleware and the public detail page resolve
-- redirects with the anon key. Rows contain only slugs — no private data.
--
-- Rollback: drop table public.book_slug_redirects (nothing else references it).

create table if not exists public.book_slug_redirects (
  old_slug   text        primary key,
  book_id    uuid        not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists book_slug_redirects_book_id_idx
  on public.book_slug_redirects (book_id);

alter table public.book_slug_redirects enable row level security;
revoke all on table public.book_slug_redirects from public, anon, authenticated;

-- Read-only for everyone (public redirect data); writes stay service-role only.
grant select on table public.book_slug_redirects to anon, authenticated;

drop policy if exists "book_slug_redirects_public_read" on public.book_slug_redirects;
create policy "book_slug_redirects_public_read"
  on public.book_slug_redirects
  for select
  using (true);
