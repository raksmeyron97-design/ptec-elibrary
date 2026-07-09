-- 0077_ebook_admin.sql
-- Manage E-books admin rebuild (mirrors 0075's thesis status upgrade):
--
--   1. books.status gains 'archived'. Archived e-books stay in the admin
--      panel but the existing sync_publish_status() trigger (0061) forces
--      is_published = false, so they disappear from every public query,
--      view, and the sitemap with zero further changes.
--   2. books.updated_at + BEFORE UPDATE trigger, so the admin table can
--      show and sort by "recently updated". Backfilled from created_at.
--
-- Pre-migration behaviour of the new /admin/manage page (by design):
--   * the list query silently retries without updated_at (column missing),
--   * Archive actions fail with a clear "apply migration 0077" message,
--   * the Archived stat/filter simply match zero rows.

alter table public.books
  drop constraint if exists books_status_check;

alter table public.books
  add constraint books_status_check
  check (status in ('draft', 'pending_review', 'published', 'rejected', 'archived'));

alter table public.books
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

update public.books
  set updated_at = coalesce(created_at, updated_at)
  where updated_at is distinct from created_at;

-- Reuses the generic touch function that already maintains post_comments.
create or replace trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();
  