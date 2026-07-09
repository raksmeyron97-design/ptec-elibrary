-- 0075_thesis_status_upgrade.sql
-- Admin Theses CMS rebuild (Phase 1): scheduled/archived publishing states
-- and an `updated_at` column for the new Manage Theses list page.
--
-- `research_reports.status` already exists (0061_review_status.sql:
-- draft|pending_review|published|rejected) with `is_published` kept in sync
-- by the *shared* `sync_publish_status` trigger function, also used by
-- `books`. We do NOT widen that shared function — `books` has no
-- scheduled_at/archived_at and shouldn't gain scheduled/archived states as a
-- side effect of this change. Instead `research_reports` gets its own
-- dedicated trigger function (mirroring `posts_sync_publish_status` from
-- 0073_posts_cms_upgrade.sql), and only its CHECK constraint is widened.

alter table public.research_reports
  add column if not exists scheduled_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Constraint name follows Postgres's default auto-generated naming for a
-- column CHECK added via 0061 (table_column_check).
alter table public.research_reports
  drop constraint if exists research_reports_status_check;

alter table public.research_reports
  add constraint research_reports_status_check
  check (status in ('draft', 'pending_review', 'published', 'scheduled', 'archived', 'rejected'));

create or replace function public.research_reports_sync_publish_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_published, false) and new.status = 'draft' then
      new.status := 'published';
    end if;
    new.is_published := (new.status = 'published');
    if new.status = 'published' and new.published_at is null then
      new.published_at := now();
    end if;
    if new.status = 'archived' and new.archived_at is null then
      new.archived_at := now();
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    new.is_published := (new.status = 'published');
    if new.status = 'published' and new.published_at is null then
      new.published_at := now();
    end if;
    if new.status = 'archived' then
      new.archived_at := now();
    elsif old.status = 'archived' then
      new.archived_at := null;
    end if;
    if new.status <> 'scheduled' then
      new.scheduled_at := null;
    end if;
  elsif new.is_published is distinct from old.is_published then
    -- Legacy path: something wrote is_published directly (e.g. the existing
    -- toggleThesisPublishStatus action) — derive status from it so the two
    -- never drift.
    new.status := case when new.is_published then 'published' else 'draft' end;
    if new.is_published and new.published_at is null then
      new.published_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists research_reports_sync_publish_status on public.research_reports;
create trigger research_reports_sync_publish_status
  before insert or update on public.research_reports
  for each row execute function public.research_reports_sync_publish_status();

-- Reuses the generic touch_updated_at() function already defined for
-- team_members (see initial_schema.sql).
drop trigger if exists research_reports_updated_at on public.research_reports;
create trigger research_reports_updated_at
  before update on public.research_reports
  for each row execute function public.touch_updated_at();

create index if not exists idx_research_reports_status on public.research_reports (status);
create index if not exists idx_research_reports_scheduled_at on public.research_reports (scheduled_at)
  where status = 'scheduled';
