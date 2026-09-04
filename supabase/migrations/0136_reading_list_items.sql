-- 0136 — a reading list becomes a research collection.
--
-- Every user-owned table in this schema is books-only: `reading_list_books`,
-- `saved_books`, `book_notes` and `book_annotations` all carry a hard
-- `book_id references books(id)`. The consequence reached the UI as a quiet
-- data-loss bug: the Save control on a thesis or a publication writes to
-- localStorage (lib/theses/local-bookmarks.ts), so a student who "saves" a
-- thesis has saved nothing that survives a browser profile, and nothing that
-- appears on their dashboard beside the books they saved for the same essay.
--
-- The fix is one table, not three. `reading_list_items` is polymorphic over
-- the same `(record_type, record_id)` pair the indexing tables already use
-- (0133), so a list can hold a book, a thesis and a publication side by side —
-- which is what a research topic actually looks like. It also carries an
-- optional page and note, so "p. 42: contradicts chapter 3" is a first-class
-- thing to save; `book_annotations` covers that for books being READ, but
-- required a text selection and existed only for books.
--
-- `reading_lists` gains `topic` so a collection can say what it is for.
--
-- `reading_list_books` is LEFT IN PLACE and backfilled from, not dropped: it
-- is what the dashboard and the list page read today, and a migration that
-- removes a table the running deployment still queries is an outage. The
-- application stops writing to it in this release; a later migration can
-- retire it once nothing reads it.

alter table public.reading_lists
  add column if not exists topic text;

comment on column public.reading_lists.topic is
  'What this collection is for — the research question or subject. Free text.';

create table if not exists public.reading_list_items (
  id            uuid primary key default gen_random_uuid(),
  list_id       uuid not null references public.reading_lists(id) on delete cascade,
  record_type   text not null check (record_type in ('book', 'research', 'publication')),
  -- No foreign key, deliberately: the target is one of three tables. Same
  -- trade-off, and the same cleanup obligation on the application, as
  -- resource_index_state (0133).
  record_id     uuid not null,
  page_number   integer check (page_number is null or page_number > 0),
  note          text,
  added_at      timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- A resource appears once per list as a plain save, and once more per page a
-- reader annotated. Postgres treats NULLs as distinct in a unique index, so
-- the "saved, no page" case needs its own partial index to stay singular.
create unique index if not exists reading_list_items_unique_page
  on public.reading_list_items (list_id, record_type, record_id, page_number)
  where page_number is not null;

create unique index if not exists reading_list_items_unique_plain
  on public.reading_list_items (list_id, record_type, record_id)
  where page_number is null;

create index if not exists reading_list_items_list_idx
  on public.reading_list_items (list_id, added_at desc);

-- Backfill: every book already in a list becomes an item, so the new read
-- path shows exactly what the old one did on the day this ships.
insert into public.reading_list_items (list_id, record_type, record_id, added_at)
select b.list_id, 'book', b.book_id, b.added_at
from public.reading_list_books b
on conflict do nothing;

alter table public.reading_list_items enable row level security;

-- Same shape as reading_list_books: ownership and publicity are properties of
-- the parent list, checked through it rather than duplicated onto every row.
drop policy if exists "owner_all_list_items" on public.reading_list_items;
create policy "owner_all_list_items" on public.reading_list_items
  for all using (
    exists (
      select 1 from public.reading_lists l
      where l.id = list_id and l.user_id = auth.uid()
    )
  );

drop policy if exists "public_read_list_items" on public.reading_list_items;
create policy "public_read_list_items" on public.reading_list_items
  for select using (
    exists (
      select 1 from public.reading_lists l
      where l.id = list_id and l.is_public = true
    )
  );

-- UPDATE is granted, unlike reading_list_books: an item's note is editable.
grant select, insert, update, delete on public.reading_list_items to authenticated;

create or replace function public.touch_reading_list_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reading_list_items_updated_at on public.reading_list_items;
create trigger reading_list_items_updated_at
  before update on public.reading_list_items
  for each row execute function public.touch_reading_list_items_updated_at();
