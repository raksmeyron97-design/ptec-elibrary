-- 0061_review_status.sql
-- Editorial review workflow: draft → pending_review → published / rejected.
--
-- `status` becomes the source of truth; the existing `is_published` boolean is
-- kept in sync by a trigger so every existing query, view, RLS policy, and
-- Server Action keeps working untouched:
--   * writes that only set `status`      → is_published follows
--   * legacy writes that only flip
--     `is_published` (publish toggles)   → status follows (published/draft)
--   * INSERTs with is_published = true   → status forced to 'published'

alter table public.books
  add column if not exists status text not null default 'draft'
  check (status in ('draft', 'pending_review', 'published', 'rejected'));

alter table public.research_reports
  add column if not exists status text not null default 'draft'
  check (status in ('draft', 'pending_review', 'published', 'rejected'));

update public.books
  set status = case when is_published then 'published' else 'draft' end;

update public.research_reports
  set status = case when is_published then 'published' else 'draft' end;

create or replace function public.sync_publish_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_published, false) then
      new.status := 'published';
    elsif new.status = 'published' then
      -- explicit is_published = false wins over a stale 'published' value
      new.status := 'draft';
    end if;
    new.is_published := (new.status = 'published');
  else
    if new.status is distinct from old.status then
      new.is_published := (new.status = 'published');
    elsif new.is_published is distinct from old.is_published then
      new.status := case when new.is_published then 'published' else 'draft' end;
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger books_sync_publish_status
  before insert or update on public.books
  for each row execute function public.sync_publish_status();

create or replace trigger research_reports_sync_publish_status
  before insert or update on public.research_reports
  for each row execute function public.sync_publish_status();
