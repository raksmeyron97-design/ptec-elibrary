-- 0086_metadata_verification.sql
-- Metadata-verification workflow (reliability & governance roadmap, Task 1).
--
-- Builds on 0061 (status + is_published sync), 0062 (verified_at/by +
-- license), 0075 (theses scheduled/archived + dedicated trigger):
--   1. Full editorial status vocabulary on books + research_reports:
--        draft | imported | needs_review | pending_review (legacy alias of
--        needs_review) | in_review | changes_requested | verified |
--        scheduled | published | rejected (legacy alias of
--        changes_requested) | archived
--      Only 'published' maps to is_published = true, so every existing
--      public query, view, and RLS policy keeps working untouched.
--   2. Provenance columns: created_by / updated_by, review_note (reason for
--      rejection or requested changes), assigned_reviewer, submitted_at.
--   3. books get scheduled_at/archived_at + a dedicated sync trigger
--      (mirroring research_reports' from 0075 — 0075 deliberately did not
--      widen the shared function; books now opt in explicitly). Unlike
--      theses, the trigger never touches books.published_at: for books that
--      is the bibliographic publication date, not the site-publish moment.
--   4. content_versions: automatic previous-value snapshots on meaningful
--      UPDATEs of books/research_reports/publications, for change history
--      and rollback. Counter-only updates (view_count etc.) are skipped so
--      page views never generate version rows.
--
-- Self-approval prevention is enforced in the server actions (role-aware:
-- admins may override in emergencies, and every override is audit-logged) —
-- a DB-level block would break legitimate single-librarian operation.
--
-- Rollback notes: every change here is additive (new columns nullable or
-- defaulted, constraint widened, new table). To roll back: drop the
-- content_versions triggers + table, restore the previous CHECK constraints
-- (0061/0075 definitions), and re-point the books trigger at
-- public.sync_publish_status. No data rewrite is required in either
-- direction.

-- ── 1. Status vocabulary ─────────────────────────────────────────────────

alter table public.books
  drop constraint if exists books_status_check;

alter table public.books
  add constraint books_status_check
  check (status in (
    'draft', 'imported', 'needs_review', 'pending_review', 'in_review',
    'changes_requested', 'verified', 'scheduled', 'published', 'rejected',
    'archived'
  ));

alter table public.research_reports
  drop constraint if exists research_reports_status_check;

alter table public.research_reports
  add constraint research_reports_status_check
  check (status in (
    'draft', 'imported', 'needs_review', 'pending_review', 'in_review',
    'changes_requested', 'verified', 'scheduled', 'published', 'rejected',
    'archived'
  ));

-- ── 2. Provenance / workflow columns ─────────────────────────────────────

alter table public.books
  add column if not exists created_by        uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by        uuid references public.profiles(id) on delete set null,
  add column if not exists review_note       text,
  add column if not exists assigned_reviewer uuid references public.profiles(id) on delete set null,
  add column if not exists submitted_at      timestamptz,
  add column if not exists scheduled_at      timestamptz,
  add column if not exists archived_at       timestamptz;

alter table public.research_reports
  add column if not exists created_by        uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by        uuid references public.profiles(id) on delete set null,
  add column if not exists review_note       text,
  add column if not exists assigned_reviewer uuid references public.profiles(id) on delete set null,
  add column if not exists submitted_at      timestamptz;

alter table public.publications
  add column if not exists updated_by        uuid references public.profiles(id) on delete set null;

-- ── 3. Books: dedicated status↔is_published sync trigger ────────────────

create or replace function public.books_sync_publish_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_published, false) and new.status = 'draft' then
      new.status := 'published';
    end if;
    new.is_published := (new.status = 'published');
    if new.status = 'archived' and new.archived_at is null then
      new.archived_at := now();
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    new.is_published := (new.status = 'published');
    if new.status = 'archived' then
      new.archived_at := now();
    elsif old.status = 'archived' then
      new.archived_at := null;
    end if;
    if new.status <> 'scheduled' then
      new.scheduled_at := null;
    end if;
  elsif new.is_published is distinct from old.is_published then
    -- Legacy write path: code that only flips the boolean.
    new.status := case when new.is_published then 'published' else 'draft' end;
  end if;

  return new;
end;
$$;

create or replace trigger books_sync_publish_status
  before insert or update on public.books
  for each row execute function public.books_sync_publish_status();

-- ── 4. Version history (change audit + rollback) ─────────────────────────

create table if not exists public.content_versions (
  id          bigint generated always as identity primary key,
  table_name  text        not null check (table_name in ('books', 'research_reports', 'publications')),
  record_id   uuid        not null,
  snapshot    jsonb       not null,   -- previous row values (embedding stripped)
  changed_by  uuid        references public.profiles(id) on delete set null,
  changed_at  timestamptz not null default now(),
  status_from text,
  status_to   text
);

create index if not exists content_versions_record_idx
  on public.content_versions (table_name, record_id, changed_at desc);

-- Service-role only (same posture as search_queries per 0084): version
-- snapshots contain pre-publication drafts and reviewer notes.
alter table public.content_versions enable row level security;
revoke all on table public.content_versions from public, anon, authenticated;

create or replace function public.capture_content_version()
returns trigger
language plpgsql
as $$
declare
  -- Columns whose changes alone should NOT create a version row: counters
  -- bumped by public traffic, derived vectors, and touch timestamps.
  volatile_cols constant text[] := array[
    'view_count', 'download_count', 'rating', 'embedding', 'updated_at',
    'updated_by', 'last_health_check'
  ];
  old_cmp jsonb := to_jsonb(old) - volatile_cols;
  new_cmp jsonb := to_jsonb(new) - volatile_cols;
begin
  if old_cmp = new_cmp then
    return new;
  end if;

  insert into public.content_versions
    (table_name, record_id, snapshot, changed_by, status_from, status_to)
  values (
    tg_table_name,
    old.id,
    to_jsonb(old) - 'embedding',
    -- The writer stamps updated_by in the same UPDATE; service-role writes
    -- have no auth.uid(), so the column is the only reliable actor source.
    nullif(to_jsonb(new) ->> 'updated_by', '')::uuid,
    to_jsonb(old) ->> 'status',
    to_jsonb(new) ->> 'status'
  );
  return new;
end;
$$;

create or replace trigger books_capture_version
  before update on public.books
  for each row execute function public.capture_content_version();

create or replace trigger research_reports_capture_version
  before update on public.research_reports
  for each row execute function public.capture_content_version();

create or replace trigger publications_capture_version
  before update on public.publications
  for each row execute function public.capture_content_version();

-- Retention: version history is an operational audit aid, not an archive.
-- Called from /api/cron/cleanup; default keeps ~13 months.
create or replace function public.purge_content_versions(retain_days integer default 400)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.content_versions
   where changed_at < now() - make_interval(days => retain_days);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_content_versions(integer) from public, anon, authenticated;
