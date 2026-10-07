-- 0170_url_redirects.sql
--
-- URL permanence (SEO audit 2026-10, WI-1 / P0-1).
--
-- 43 book URLs that search engines were still showing answered 404 when the
-- audit looked. Four mechanisms each killed URLs and none of them left a
-- trace:
--   * book_slug_redirects (0091) cascades away with its TARGET book, and the
--     edge gate follows only PUBLISHED targets, so deleting or unpublishing a
--     book also kills every old slug that redirected to it;
--   * nothing recorded a slug change made outside the admin edit form
--     (scripts, typo fixes, a re-import under a new slug);
--   * nothing recorded a deletion or an unpublish (a rights takedown, an
--     archive), so the URL simply stopped existing;
--   * updateCategory recomputes the subject slug on every rename (the KNOWN
--     GAP in lib/seo/subject-slug-redirects.ts).
--
-- What this adds:
--
--   url_redirects       one path-to-path table, NO foreign keys, so a
--                       redirect outlives the rows at both ends. Paths are
--                       locale-less and DECODED ("/books/<khmer slug>"); the
--                       edge consults it only after the existing gates have
--                       already said "not found" (lib/url-redirect-gate.ts).
--                       status 301 → target_path; status 410 → removed on
--                       purpose. `reason` is PRIVATE: it may say
--                       'rights_removal', and rights material never reaches a
--                       public surface. anon/authenticated get a COLUMN grant
--                       on the decision (old_path, target_path, status) and
--                       nothing else. Not a view: this repo's _public views
--                       are security_invoker, and such a view over a revoked
--                       table denies anon (correction C1 to the Gate 5 plan).
--
--   retired_url_queue   private (service role only). Every published book or
--                       thesis that is deleted or unpublished, and every
--                       subject that is deleted, lands here for a librarian
--                       to decide: a successor (301), removed (410), or
--                       ignore. Republishing clears the row. Titles of
--                       removed works stay internal.
--
--   upsert_url_redirect the ONLY writer of url_redirects. It collapses
--                       chains so the edge always needs one hop, and refuses
--                       a loop rather than writing one. Service role only.
--
--   triggers            every slug change on a live book, thesis or subject
--                       leaves a 301; a record going live clears any redirect
--                       or queue row for its path; a record leaving the
--                       public site is queued. Two corrections to the plan:
--                       a rename A → B → A must SUCCEED (the WI-2 rollback is
--                       exactly that), so the slug-change trigger first drops
--                       the redirect whose source is the path coming back to
--                       life (C2); and no trigger is a column-list
--                       `update of …` trigger, because is_published is
--                       mirrored from `status` by a BEFORE trigger (0075/0086)
--                       and a column-list trigger never sees that change (C3).
--
-- Book-only additions (deviations D1/D2, approved 2026-10-07):
--   D1  book_slug_redirects gaining a row resolves the queue row for that old
--       slug. Retiring a duplicate archives the book BEFORE it writes the
--       redirect (app/actions/duplicates.ts), so without this every retire
--       would leave a pending row the existing flow had already answered.
--   D2  a book leaving the public site also queues every book_slug_redirects
--       alias that pointed at it — those aliases die with it (cascade on
--       delete; the published-target rule on unpublish), which is the F1
--       defect this migration exists to remove. Coming back clears them.
--
-- Departments get no trigger: no public URL carries a department slug
-- (/books?dept= uses the NAME).
--
-- Rollback (everything here is additive; nothing existing is altered):
--   drop trigger … for each of the 17 triggers below (books ×7, research_reports ×5,
--     categories ×4, book_slug_redirects ×1);
--   drop function public.sync_book_alias_retirements(), public.resolve_book_alias_retirement(),
--     public.capture_retired_url(), public.capture_slug_change(),
--     public.clear_url_retirement(),
--     public.upsert_url_redirect(text, text, smallint, text, uuid);
--   drop table public.retired_url_queue, public.url_redirects;
-- The edge switch URL_REDIRECTS=off restores the old middleware behaviour
-- without touching the database.

-- Give up rather than queue (see 0164): on the box each migration runs in one
-- transaction, so this lasts exactly as long as this file.
set local lock_timeout = '10s';

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.url_redirects (
  old_path    text primary key,
  target_path text,
  status      smallint not null check (status in (301, 410)),
  reason      text not null check (reason in (
                'slug_change', 'recreated', 'collection_move', 'duplicate_retired',
                'typo_fix', 'rights_removal', 'withdrawn', 'manual')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint url_redirects_status_target check ((status = 301) = (target_path is not null)),
  constraint url_redirects_no_self       check (target_path is distinct from old_path),
  -- One or more segments under a lowercase collection (C7: the plan's
  -- one-segment shape refused /journals/articles/<slug>).
  constraint url_redirects_shape check (
    old_path ~ '^/[a-z]+(/[^/]+)+$'
    and (target_path is null or target_path ~ '^/[a-z]+(/[^/]+)+$'))
);

alter table public.url_redirects enable row level security;
revoke all on table public.url_redirects from public, anon, authenticated;
-- The edge may read the DECISION, never the reason.
grant select (old_path, target_path, status) on public.url_redirects to anon, authenticated;
drop policy if exists url_redirects_read_decision on public.url_redirects;
create policy url_redirects_read_decision on public.url_redirects
  for select to anon, authenticated using (true);

create index if not exists url_redirects_target_path_idx on public.url_redirects (target_path);

create table if not exists public.retired_url_queue (
  path           text primary key,
  record_type    text not null check (record_type in ('book', 'thesis', 'subject')),
  title          text,
  cause          text not null check (cause in ('deleted', 'unpublished', 'seeded')),
  suggested_path text,
  note           text,
  retired_at     timestamptz not null default now(),
  resolution     text not null default 'pending'
                 check (resolution in ('pending', 'redirected', 'gone', 'ignored')),
  resolved_by    uuid references public.profiles (id) on delete set null,
  resolved_at    timestamptz
);

alter table public.retired_url_queue enable row level security;
revoke all on table public.retired_url_queue from public, anon, authenticated;

create index if not exists retired_url_queue_pending_idx
  on public.retired_url_queue (retired_at desc) where resolution = 'pending';

-- ── The one writer ─────────────────────────────────────────────────────────

create or replace function public.upsert_url_redirect(
  p_old text, p_target text, p_status smallint, p_reason text, p_actor uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_target text := p_target;
  v_status smallint := p_status;
  r record;
begin
  if v_status = 301 then
    -- The target is itself retired: point past it, so the edge needs one hop.
    select target_path, status into r from public.url_redirects where old_path = v_target;
    if found then
      v_target := r.target_path;
      v_status := r.status;
    end if;
  end if;
  if v_target is not distinct from p_old then
    raise exception 'url_redirects: % -> % would loop', p_old, p_target;
  end if;

  insert into public.url_redirects (old_path, target_path, status, reason, created_by)
  values (p_old, v_target, v_status, p_reason, p_actor)
  on conflict (old_path) do update
    set target_path = excluded.target_path,
        status      = excluded.status,
        reason      = excluded.reason,
        created_by  = excluded.created_by,
        created_at  = now();

  -- Everything that used to end at p_old now ends where p_old ends.
  update public.url_redirects
     set target_path = v_target, status = v_status
   where target_path = p_old
     and old_path is distinct from v_target;
end $$;

revoke all on function public.upsert_url_redirect(text, text, smallint, text, uuid)
  from public, anon, authenticated;
grant execute on function public.upsert_url_redirect(text, text, smallint, text, uuid)
  to service_role;

-- ── Trigger functions ──────────────────────────────────────────────────────
-- tg_argv[0] is the collection prefix ('/books', '/theses', '/subjects').

-- A path that is live (again) is neither a redirect source nor a queued
-- retirement.
create or replace function public.clear_url_retirement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_path text;
begin
  if new.slug is not null then
    v_path := tg_argv[0] || '/' || new.slug;
    delete from public.url_redirects where old_path = v_path;
    delete from public.retired_url_queue where path = v_path;
  end if;
  return null;
end $$;

-- Every slug change on a live record leaves a 301 — admin renames, scripts,
-- typo fixes alike.
create or replace function public.capture_slug_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old text := tg_argv[0] || '/' || old.slug;
  v_new text := tg_argv[0] || '/' || new.slug;
begin
  if old.slug is not null and new.slug is not null then
    -- C2: A → B → A must succeed. The redirect FROM the path coming back to
    -- life would otherwise make upsert_url_redirect see a loop and abort the
    -- rename itself.
    delete from public.url_redirects where old_path = v_new;
    perform public.upsert_url_redirect(v_old, v_new, 301::smallint, 'slug_change', null);
  end if;
  return null;
end $$;

-- A public record that is deleted or unpublished waits for a decision.
-- tg_argv: prefix, record_type, cause.
create or replace function public.capture_retired_url() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.retired_url_queue (path, record_type, title, cause)
  values (tg_argv[0] || '/' || old.slug,
          tg_argv[1],
          coalesce(to_jsonb(old) ->> 'title', to_jsonb(old) ->> 'name'),
          tg_argv[2])
  on conflict (path) do update
    set cause       = excluded.cause,
        title       = coalesce(excluded.title, retired_url_queue.title),
        retired_at  = now(),
        resolution  = 'pending',
        resolved_by = null,
        resolved_at = null;
  return old;
end $$;

-- D2: the aliases (book_slug_redirects) of a book that leaves the public site
-- die with it; queue them. When the book comes back, they work again through
-- the book gate, so their pending rows go.
create or replace function public.sync_book_alias_retirements() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_leaving boolean;
  v_book    uuid;
begin
  if tg_op = 'DELETE' then
    v_leaving := old.is_published;
    v_book := old.id;
  else
    v_book := new.id;
    v_leaving := old.is_published and not new.is_published;
    if new.is_published and not old.is_published then
      delete from public.retired_url_queue q
       using public.book_slug_redirects r
       where r.book_id = v_book
         and q.path = '/books/' || r.old_slug
         and q.resolution = 'pending';
      return null;
    end if;
  end if;

  if v_leaving then
    insert into public.retired_url_queue (path, record_type, title, cause, note)
    select '/books/' || r.old_slug,
           'book',
           old.title,
           case when tg_op = 'DELETE' then 'deleted' else 'unpublished' end,
           'alias of /books/' || old.slug
      from public.book_slug_redirects r
     where r.book_id = v_book
       and r.old_slug is distinct from old.slug
    on conflict (path) do update
      set cause       = excluded.cause,
          title       = coalesce(excluded.title, retired_url_queue.title),
          note        = excluded.note,
          retired_at  = now(),
          resolution  = 'pending',
          resolved_by = null,
          resolved_at = null;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return null;
end $$;

-- D1: a book_slug_redirects row answers the queue row for its old slug.
create or replace function public.resolve_book_alias_retirement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.retired_url_queue
     set resolution = 'redirected', resolved_at = now()
   where path = '/books/' || new.old_slug
     and resolution = 'pending';
  return null;
end $$;

-- ── Triggers ───────────────────────────────────────────────────────────────
-- C3: plain AFTER triggers with WHEN clauses. A WHEN clause on an AFTER
-- trigger sees the row as the BEFORE triggers left it, so the is_published
-- mirror (books_sync_publish_status, research_reports_sync_publish_status)
-- is visible here; a column-list `after update of is_published` is not.

-- books
drop trigger if exists books_url_slug_change on public.books;
create trigger books_url_slug_change after update on public.books
  for each row
  when (old.slug is distinct from new.slug and old.is_published and new.is_published)
  execute function public.capture_slug_change('/books');

drop trigger if exists books_url_live_insert on public.books;
create trigger books_url_live_insert after insert on public.books
  for each row when (new.is_published)
  execute function public.clear_url_retirement('/books');

drop trigger if exists books_url_live_update on public.books;
create trigger books_url_live_update after update on public.books
  for each row
  when (new.is_published and (old.slug is distinct from new.slug or not old.is_published))
  execute function public.clear_url_retirement('/books');

drop trigger if exists books_url_retire_delete on public.books;
create trigger books_url_retire_delete before delete on public.books
  for each row when (old.slug is not null and old.is_published)
  execute function public.capture_retired_url('/books', 'book', 'deleted');

drop trigger if exists books_url_retire_unpublish on public.books;
create trigger books_url_retire_unpublish after update on public.books
  for each row when (old.is_published and not new.is_published and old.slug is not null)
  execute function public.capture_retired_url('/books', 'book', 'unpublished');

-- BEFORE DELETE so the aliases are still there to read (they cascade after).
drop trigger if exists books_url_alias_delete on public.books;
create trigger books_url_alias_delete before delete on public.books
  for each row when (old.is_published)
  execute function public.sync_book_alias_retirements();

drop trigger if exists books_url_alias_update on public.books;
create trigger books_url_alias_update after update on public.books
  for each row when (old.is_published is distinct from new.is_published)
  execute function public.sync_book_alias_retirements();

-- research_reports (theses)
drop trigger if exists research_reports_url_slug_change on public.research_reports;
create trigger research_reports_url_slug_change after update on public.research_reports
  for each row
  when (old.slug is distinct from new.slug and old.is_published and new.is_published)
  execute function public.capture_slug_change('/theses');

drop trigger if exists research_reports_url_live_insert on public.research_reports;
create trigger research_reports_url_live_insert after insert on public.research_reports
  for each row when (new.is_published)
  execute function public.clear_url_retirement('/theses');

drop trigger if exists research_reports_url_live_update on public.research_reports;
create trigger research_reports_url_live_update after update on public.research_reports
  for each row
  when (new.is_published and (old.slug is distinct from new.slug or not old.is_published))
  execute function public.clear_url_retirement('/theses');

drop trigger if exists research_reports_url_retire_delete on public.research_reports;
create trigger research_reports_url_retire_delete before delete on public.research_reports
  for each row when (old.slug is not null and old.is_published)
  execute function public.capture_retired_url('/theses', 'thesis', 'deleted');

drop trigger if exists research_reports_url_retire_unpublish on public.research_reports;
create trigger research_reports_url_retire_unpublish after update on public.research_reports
  for each row when (old.is_published and not new.is_published and old.slug is not null)
  execute function public.capture_retired_url('/theses', 'thesis', 'unpublished');

-- categories (subject hubs exist on existence alone — no publication column)
drop trigger if exists categories_url_slug_change on public.categories;
create trigger categories_url_slug_change after update on public.categories
  for each row when (old.slug is distinct from new.slug)
  execute function public.capture_slug_change('/subjects');

drop trigger if exists categories_url_live_insert on public.categories;
create trigger categories_url_live_insert after insert on public.categories
  for each row
  execute function public.clear_url_retirement('/subjects');

drop trigger if exists categories_url_live_update on public.categories;
create trigger categories_url_live_update after update on public.categories
  for each row when (old.slug is distinct from new.slug)
  execute function public.clear_url_retirement('/subjects');

drop trigger if exists categories_url_retire_delete on public.categories;
create trigger categories_url_retire_delete before delete on public.categories
  for each row when (old.slug is not null)
  execute function public.capture_retired_url('/subjects', 'subject', 'deleted');

-- book_slug_redirects (D1)
drop trigger if exists book_slug_redirects_resolve_retirement on public.book_slug_redirects;
create trigger book_slug_redirects_resolve_retirement
  after insert or update on public.book_slug_redirects
  for each row
  execute function public.resolve_book_alias_retirement();
