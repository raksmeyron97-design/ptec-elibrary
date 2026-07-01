-- Per-page text annotations: selected text + optional note + highlight color
create table book_annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  page_number integer not null,
  selected_text text not null,
  note_content text default '',
  highlight_color text default 'yellow'
    check (highlight_color in ('yellow', 'green', 'blue', 'pink')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table book_annotations enable row level security;

create policy "Users manage own annotations"
  on book_annotations for all
  using (auth.uid() = user_id);

create index book_annotations_book_page
  on book_annotations(book_id, page_number);

create function update_book_annotations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger book_annotations_updated_at
  before update on book_annotations
  for each row execute procedure update_book_annotations_updated_at();
