-- 0129_book_import_runs.sql
--
-- Durable progress for the /admin/books/upload bulk importer.
--
-- WHY THIS HAS TO BE SERVER-SIDE
--
-- Zima allows 60 uploads per hour (RL_UPLOAD_PER_HOUR, see lib/zima.ts →
-- ZIMA_UPLOADS_PER_HOUR), counted per FILE and shared by the whole app because
-- every upload reaches storage from this server's IP. An 86-row import is ~172
-- files, so it necessarily crosses several quota windows, and a single 429
-- reply has been observed asking for a 3,224-second wait.
--
-- The importer now honours that wait instead of failing the remaining rows —
-- but a 54-minute pause held only in React state is lost to a refresh, a
-- laptop lid, or a stray navigation, taking the record of which 23 rows had
-- succeeded with it. The operator's only recovery was to re-run the whole CSV
-- and read 60 "already in library" skips to work out where they were.
--
-- WHAT IS AND IS NOT STORED
--
-- `rows` is a snapshot of the queue: one entry per CSV row with its title, PDF
-- filename, destination folder, status and error. It is NOT the file bytes —
-- browser File handles cannot be serialized, so resuming a run still requires
-- re-selecting the PDF/cover folders. The UI says so rather than implying the
-- transfer resumes by itself. What is recovered is the decision record: which
-- rows are done, which failed and why, and where each one's files belong.
--
-- One jsonb column rather than a row-per-item table: this is written as a
-- whole snapshot every couple of seconds by one client and read back whole. A
-- child table would buy per-row queries nothing here uses, and cost 86 inserts
-- per import.
--
-- ACCESS
--
-- Service-role only, like site_settings (0098). Every read and write goes
-- through a Server Action that has already passed requirePermission("books",
-- "write"), and PostgREST must not expose an operator's import history —
-- including the book titles of an unpublished batch — to anon or authenticated.

create table if not exists public.book_import_runs (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users(id) on delete set null,
  label       text,
  total       integer not null default 0,
  rows        jsonb   not null default '[]'::jsonb,
  status      text    not null default 'running'
              check (status in ('running', 'paused', 'completed', 'abandoned')),
  created_at  timestamptz not null default timezone('utc'::text, now()),
  updated_at  timestamptz not null default timezone('utc'::text, now())
);

comment on table public.book_import_runs is
  'Progress snapshots for the admin bulk book importer, so a run interrupted by Zima''s hourly upload quota can be resumed instead of re-run. Service-role only.';
comment on column public.book_import_runs.rows is
  'Queue snapshot: [{id, title, pdfName, folder, status, error, slug}]. Never the file bytes — resuming requires re-selecting the source folders.';

-- The only query the app makes: "my most recent unfinished run".
create index if not exists book_import_runs_owner_active_idx
  on public.book_import_runs (created_by, updated_at desc)
  where status in ('running', 'paused');

alter table public.book_import_runs enable row level security;
revoke all on public.book_import_runs from public, anon, authenticated;

-- Keep `updated_at` honest without every caller remembering to set it; the
-- resume prompt decides what to offer by age, so a stale value would offer the
-- wrong run.
create or replace function public.touch_book_import_runs()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists book_import_runs_touch on public.book_import_runs;
create trigger book_import_runs_touch
  before update on public.book_import_runs
  for each row execute function public.touch_book_import_runs();
