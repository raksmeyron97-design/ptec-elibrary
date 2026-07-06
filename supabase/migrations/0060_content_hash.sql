-- 0060_content_hash.sql
-- Duplicate-upload detection: store a sha256 of every uploaded PDF so
-- /api/admin/upload can block re-uploads of a file that is already in the
-- library (same bytes under a different title/filename).
--
-- Hashes are computed in the upload routes; NULL means "uploaded before this
-- migration" and is exempt from the unique constraint. The partial unique
-- indexes are the race-condition backstop behind the application-level check.

alter table public.book_files
  add column if not exists content_hash text;
alter table public.research_reports
  add column if not exists content_hash text;

create unique index if not exists book_files_content_hash_key
  on public.book_files (content_hash)
  where content_hash is not null;

create unique index if not exists research_reports_content_hash_key
  on public.research_reports (content_hash)
  where content_hash is not null;
