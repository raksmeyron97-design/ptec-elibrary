-- 0131_books_allow_download.sql
--
-- Per-book download permission: a librarian may publish a book as
-- "read online only".
--
-- This is the BOOK counterpart of publications.allow_download (0125). Same
-- column names, same semantics, same default, so lib/books/access.ts and
-- lib/publications/access.ts can stay two thin readings of one rule rather
-- than two rules. It answers a LIBRARY POLICY question — "do we choose to
-- hand out the file?" — and nothing else; it does not touch reading online,
-- which is the entire point of the distinction.
--
-- BACKWARD COMPATIBILITY. `not null default true` means every one of the
-- existing books keeps behaving exactly as it does today: the column is
-- written for every existing row as true by the ALTER itself. There is no
-- nullable "unknown" state to interpret, and no book becomes restricted as a
-- side effect of applying this migration.
--
-- No index. `allow_download` is read alongside a book that has already been
-- located by primary key or by slug — never as a search predicate — so an
-- index on a near-constant boolean would cost writes and buy nothing.
--
-- Rollback:
--   drop view if exists public.books_with_stats;   -- then re-run the baseline
--   alter table public.books                        --      definition below
--     drop column allow_download, drop column download_disabled_reason;
-- No data is destroyed by the rollback that was not created by this migration.

alter table public.books
  add column if not exists allow_download           boolean not null default true,
  add column if not exists download_disabled_reason text;

comment on column public.books.allow_download is
  'Library policy switch. false => /api/books/[slug]/download returns 403 (and /api/books/[id]/file?download=1, which redirects into it, therefore does too) and the reader is offered online reading only. Reading in the in-app viewer is deliberately unaffected.';
comment on column public.books.download_disabled_reason is
  'Optional librarian wording shown to readers in place of the download action. Null => the standard translated message.';

-- books_with_stats lists its columns explicitly (deliberately — the deployed
-- view predates books.embedding and must never expose the 768-dim vector), so
-- a new column on books is invisible to it until it is recreated. The listing
-- and card surfaces read the flag from here, which is what keeps the badge
-- free of an extra query per book (no N+1).
--
-- The body below is the baseline's, unchanged except for the added column.
drop view if exists public.books_with_stats;

create view public.books_with_stats
with (security_invoker = true)
as
select
  b.id, b.title, b.slug, b.description, b.author_id, b.category_id,
  b.department, b.isbn, b.language, b.published_at, b.is_published,
  b.rating, b.pages, b.cover_color, b.cover_url, b.download_count,
  b.view_count, b.tags, b.created_at, b.department_id,
  b.allow_download,
  coalesce(r.review_count, 0)::int as review_count,
  r.avg_rating
from public.books b
left join (
  select
    book_id,
    count(*)::int as review_count,
    avg(rating)   as avg_rating
  from public.reviews
  group by book_id
) r on r.book_id = b.id;

grant select on public.books_with_stats to anon, authenticated;
