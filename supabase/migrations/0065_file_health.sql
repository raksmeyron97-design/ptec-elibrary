-- 0065_file_health.sql
-- Data-quality layer, part 2 (part 1 was license/verified_at in 0062): tracks
-- whether a book/thesis's file and cover URLs actually resolve. Populated by
-- scripts/check-file-health.ts (HEAD request per URL), read by the
-- /admin/data-quality dashboard. Not computed live on every page load —
-- broken-link checking is an out-of-band job, not a request-path concern.

create table public.file_health (
  id           uuid        primary key default gen_random_uuid(),
  record_type  text        not null check (record_type in ('book', 'research')),
  record_id    uuid        not null,
  field        text        not null check (field in ('file_url', 'cover_url')),
  url          text        not null,
  status       text        not null check (status in ('ok', 'broken', 'unknown')),
  http_status  integer,
  checked_at   timestamptz not null default now(),
  unique (record_type, record_id, field)
);

create index file_health_broken_idx on public.file_health (status) where status = 'broken';

alter table public.file_health enable row level security;

create policy "Librarians can view file health" on public.file_health
  for select using (public.is_librarian());
create policy "Librarians can manage file health" on public.file_health
  for all using (public.is_librarian());

grant select, insert, update, delete on public.file_health to authenticated;
