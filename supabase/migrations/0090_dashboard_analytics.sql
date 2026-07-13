-- 0090_dashboard_analytics.sql
-- Admin Intelligence Dashboard instrumentation (additive, backward-compatible).
--
-- 1. view_logs / download_logs gain a privacy-preserving anonymous session
--    hash (same daily-rotating HMAC scheme 0087 introduced for
--    search_queries — no raw IP is ever stored, yesterday's hashes cannot
--    be correlated with today's) plus the viewer's locale on view_logs.
--    Both columns are nullable; historical rows stay NULL and the dashboard
--    reports "collecting since" honesty for metrics that depend on them.
-- 2. reader_open_logs — new append-only event: a visitor opened the PDF
--    reader for a book/thesis/publication. Never captured before; the
--    discovery→reading funnel needs it.
-- 3. app_events — request-level operational telemetry (AI request outcomes
--    and latency, storage backend used/failed, export runs). Counts, codes
--    and durations only: detail payloads must never contain prompts, query
--    text, secrets or personal data.
-- 4. Time-based indexes for the dashboard's range scans.
--
-- All writes happen server-side with the service role; RLS closes every new
-- surface to anon/authenticated. The application degrades gracefully before
-- this migration is applied (inserts fail silently / columns are optional).
--
-- Rollback:
--   drop table if exists public.reader_open_logs;
--   drop table if exists public.app_events;
--   alter table public.view_logs drop column if exists session_hash,
--     drop column if exists locale;
--   alter table public.download_logs drop column if exists session_hash;
--   drop index if exists view_logs_viewed_at_idx;
--   drop index if exists download_logs_downloaded_at_idx;
--   drop index if exists search_queries_searched_at_idx;

-- ── 1. Session correlation columns ──────────────────────────────────────────

alter table public.view_logs
  add column if not exists session_hash text,
  add column if not exists locale text;

alter table public.download_logs
  add column if not exists session_hash text;

-- ── 2. Reader-open events ───────────────────────────────────────────────────

create table if not exists public.reader_open_logs (
  id           uuid        primary key default gen_random_uuid(),
  content_type text        not null check (content_type in ('book', 'research_report', 'publication')),
  content_id   uuid        not null,
  user_id      uuid        references public.profiles(id) on delete set null,
  session_hash text,
  locale       text,
  opened_at    timestamptz not null default now()
);

create index if not exists reader_open_logs_opened_at_idx
  on public.reader_open_logs (opened_at desc);
create index if not exists reader_open_logs_content_idx
  on public.reader_open_logs (content_type, content_id, opened_at desc);

alter table public.reader_open_logs enable row level security;
revoke all on table public.reader_open_logs from public, anon, authenticated;

-- ── 3. Operational telemetry events ─────────────────────────────────────────

create table if not exists public.app_events (
  id         bigint      generated always as identity primary key,
  kind       text        not null check (kind in
               ('ai_request', 'storage_operation', 'notification', 'export')),
  status     text        not null check (status in
               ('ok', 'error', 'timeout', 'quota', 'fallback')),
  route      text,
  latency_ms integer,
  detail     jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_events_kind_idx
  on public.app_events (kind, created_at desc);

alter table public.app_events enable row level security;
revoke all on table public.app_events from public, anon, authenticated;

-- ── 4. Range-scan indexes for dashboard queries ─────────────────────────────

create index if not exists view_logs_viewed_at_idx
  on public.view_logs (viewed_at desc);
create index if not exists download_logs_downloaded_at_idx
  on public.download_logs (downloaded_at desc);
create index if not exists search_queries_searched_at_idx
  on public.search_queries (searched_at desc);
