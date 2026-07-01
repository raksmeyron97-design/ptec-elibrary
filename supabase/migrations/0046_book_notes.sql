-- Personal notes: one text note per user per book
create table book_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz default now(),
  unique(user_id, book_id)
);

alter table book_notes enable row level security;

create policy "Users manage own notes"
  on book_notes for all
  using (auth.uid() = user_id);

create function update_book_notes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger book_notes_updated_at
  before update on book_notes
  for each row execute procedure update_book_notes_updated_at();
