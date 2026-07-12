-- 0087_search_governance.sql
-- Zero-result search analytics governance (roadmap Task 3).
--
-- The logging side already exists: search_queries (0058, +result_count 0064,
-- +language/type 0080-era columns, RLS-locked by 0084) and
-- search_result_clicks. This migration adds the *acting* side —
-- librarian-reviewed responses to zero-result terms — plus privacy
-- controls:
--
--   search_term_actions   — review state per normalized term (reviewed /
--                           ignored spam / acquisition request / …)
--   search_synonyms       — admin-curated synonym expansions; the search
--                           engine only ever applies rows a librarian
--                           created (analytics never mutate ranking
--                           unreviewed)
--   search_curated_results— pinned results for specific terms
--   search_queries.session_hash — anonymous, salted, daily-rotating session
--                           correlation (no raw IP is ever stored)
--   purge_search_analytics(retain_days) — retention limit, wired into
--                           /api/cron/cleanup (default 365 days)
--
-- All new tables are service-role only (RLS enabled + client grants
-- revoked), matching 0084's posture: raw search terms are user-typed and
-- privacy-sensitive; admins read them only through guarded server actions.
--
-- Rollback: drop the three tables, the function, and the session_hash
-- column. Nothing else references them.

alter table public.search_queries
  add column if not exists session_hash text;

create table if not exists public.search_term_actions (
  normalized_term text        primary key,
  action          text        not null check (action in
                    ('reviewed', 'ignored', 'acquisition', 'synonym', 'curated', 'redirect')),
  note            text,
  acted_by        uuid        references public.profiles(id) on delete set null,
  acted_at        timestamptz not null default now()
);

alter table public.search_term_actions enable row level security;
revoke all on table public.search_term_actions from public, anon, authenticated;

create table if not exists public.search_synonyms (
  id         uuid        primary key default gen_random_uuid(),
  term       text        not null unique,          -- normalized (lower/trim)
  synonyms   text[]      not null default '{}',
  locale     text        not null default 'all' check (locale in ('en', 'km', 'all')),
  is_active  boolean     not null default true,
  note       text,
  created_by uuid        references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.search_synonyms enable row level security;
revoke all on table public.search_synonyms from public, anon, authenticated;

create table if not exists public.search_curated_results (
  id           uuid        primary key default gen_random_uuid(),
  term         text        not null,               -- normalized (lower/trim)
  result_type  text        not null check (result_type in
                 ('book', 'thesis', 'publication', 'post', 'page')),
  result_url   text        not null,
  result_title text        not null,
  locale       text        not null default 'all' check (locale in ('en', 'km', 'all')),
  is_active    boolean     not null default true,
  created_by   uuid        references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (term, result_url)
);

create index if not exists search_curated_results_term_idx
  on public.search_curated_results (term) where is_active;

alter table public.search_curated_results enable row level security;
revoke all on table public.search_curated_results from public, anon, authenticated;

-- Retention: raw query rows older than retain_days are deleted; the admin
-- dashboard aggregates recent windows only, so nothing user-facing changes.
create or replace function public.purge_search_analytics(retain_days integer default 365)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer := 0;
  n       integer;
begin
  delete from public.search_queries
   where searched_at < now() - make_interval(days => retain_days);
  get diagnostics n = row_count;
  removed := removed + n;

  begin
    delete from public.search_result_clicks
     where clicked_at < now() - make_interval(days => retain_days);
    get diagnostics n = row_count;
    removed := removed + n;
  exception when undefined_table then
    null; -- clicks table is optional in older environments
  end;

  return removed;
end;
$$;

revoke all on function public.purge_search_analytics(integer) from public, anon, authenticated;
