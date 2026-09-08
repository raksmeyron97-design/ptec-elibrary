-- 0141 — the reader's position and its bookmarks become facts about a PERSON,
-- not about a browser.
--
-- Two device-local stores were carrying research state that a student cannot
-- afford to lose, and both fail in the same ordinary way: read on the lab PC,
-- continue on a phone.
--
--   1. THE EXACT PAGE. `reading_progress` holds `progress_pct`, an INTEGER
--      percentage. The exact page lives only in localStorage
--      (`ebook:pos:<bookId>`, lib/reader/resume.ts). So resuming on a second
--      device re-derives the page from a rounded percent: on a 500-page book
--      one percentage point is five pages, and the reader lands in the middle
--      of a paragraph they have not read — or has already read. The reader
--      already computes the page it is on; it simply had nowhere to put it.
--
--   2. BOOKMARKS. `ebook:bm:<bookId>` is a JSON array of page numbers in
--      localStorage. Clearing site data, a new browser, or a shared machine
--      loses every one of them, silently. Annotations (0047) and collections
--      (0136) are already server-side; bookmarks were the last per-page thing
--      a reader creates that lived nowhere durable.
--
-- WHY `last_page` RATHER THAN REPLACING `progress_pct`. The percentage is read
-- by the dashboard, the homepage shelf, /api/me/continue-reading and the
-- `max_progress_pct` high-water rule. It stays exactly as it is and keeps its
-- meaning; `last_page` is added beside it as the precise value, and
-- `last_page_count` records the page count that page was measured against, so
-- a stored page can be validated (and proportionally re-derived) when the file
-- behind a book is replaced with one of a different length. Without the
-- denominator, "page 240" of a document that is now 12 pages long is not
-- detectably wrong.
--
-- Both columns are NULLABLE and every reader of them has a fallback path: a
-- row written before this migration, or by a client that does not send a page,
-- resumes exactly as it does today. Nothing about this migration can make the
-- existing percentage-based resume worse.

alter table public.reading_progress
  add column if not exists last_page integer
    check (last_page is null or last_page > 0),
  add column if not exists last_page_count integer
    check (last_page_count is null or last_page_count > 0);

comment on column public.reading_progress.last_page is
  'Exact page the reader last had in view. NULL when unknown (a pre-0141 row, '
  'or a client that sent only a percentage) — readers must fall back to '
  'deriving a page from progress_pct.';

comment on column public.reading_progress.last_page_count is
  'Page count last_page was measured against, so a replaced file of a '
  'different length is detectable rather than resuming past the end.';

-- ── reader_bookmarks ─────────────────────────────────────────────────────────
--
-- Polymorphic over `(record_type, record_id)`, the same pair 0133 and 0136
-- use. Only books have a reader today; theses and publications are read
-- through the same PDF viewer and will want this, and a table that has to be
-- widened later is a migration nobody schedules.
--
-- No foreign key on record_id, deliberately, for the same reason as
-- reading_list_items: the target is one of three tables. The cleanup
-- obligation therefore falls on the application — see lib/indexing/cleanup.ts
-- for the established pattern and its test.
create table if not exists public.reader_bookmarks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  record_type text not null check (record_type in ('book', 'research', 'publication')),
  record_id   uuid not null,
  page_number integer not null check (page_number > 0),
  -- Optional, because the value of a bookmark is that it costs one tap. A
  -- label is an upgrade a reader makes later, from the panel.
  label       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One bookmark per page per resource per reader. This is what makes the
-- toggle idempotent: a second tap on an already-bookmarked page is a delete,
-- and a racing double-tap cannot produce two rows.
create unique index if not exists reader_bookmarks_unique_page
  on public.reader_bookmarks (user_id, record_type, record_id, page_number);

-- The panel's only query: this reader's bookmarks in this document, in page
-- order.
create index if not exists reader_bookmarks_lookup_idx
  on public.reader_bookmarks (user_id, record_type, record_id, page_number);

alter table public.reader_bookmarks enable row level security;

-- Reading is private (§34): a bookmark is evidence of what someone read and
-- what they thought mattered in it. There is no public-read policy here and
-- there should not be one — unlike a reading list, which the owner can choose
-- to publish.
drop policy if exists "owner_all_reader_bookmarks" on public.reader_bookmarks;
create policy "owner_all_reader_bookmarks" on public.reader_bookmarks
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.reader_bookmarks to authenticated;
revoke all on public.reader_bookmarks from anon;

create or replace function public.touch_reader_bookmarks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reader_bookmarks_updated_at on public.reader_bookmarks;
create trigger reader_bookmarks_updated_at
  before update on public.reader_bookmarks
  for each row execute function public.touch_reader_bookmarks_updated_at();
