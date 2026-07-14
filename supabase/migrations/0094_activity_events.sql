-- 0094_activity_events.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Unified activity events — the forward-looking home for download events that
-- previously had NO durable record: DENIED and FAILED download attempts.
--
-- Context: successful downloads are already persisted (download_logs for books,
-- research_report_downloads for theses) and /admin/logs now reads them through
-- the unified read-model in lib/admin/activity-log.ts. What was missing entirely
-- was any record when a download was BLOCKED (top-10 / admin-block / incomplete
-- profile / auth) or FAILED (storage/signing). Those only hit the stdout
-- security logger (lib/security-log.ts) — invisible in the admin UI and useless
-- for the "denied attempts" and security-alert views.
--
-- This table is polymorphic (resource_type/resource_id) so books, theses,
-- publications, posts and future resources share ONE schema. It is ADDITIVE and
-- idempotent — it rewrites nothing and is safe to re-run. The download routes
-- write to it best-effort; all read/write code degrades to empty if this
-- migration has not been applied yet (PGRST205 is swallowed).
--
-- Successful downloads are deliberately NOT written here (they stay in the
-- canonical counter tables) so the read-model never double-counts. Going forward
-- this table can also absorb account/admin/security events without more DDL.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.activity_events (
  id                        uuid primary key default gen_random_uuid(),
  -- Coarse family: 'download' | 'view' | 'account' | 'admin' | 'security'.
  event_type                text not null,
  -- Precise lifecycle: 'authorized' | 'denied' | 'failed' | 'success'.
  -- Downloads written here are only 'denied' or 'failed' (successes live in the
  -- counter tables); a check keeps that invariant honest.
  event_status              text not null,
  -- Polymorphic resource pointer. resource_id is intentionally NOT a FK: the
  -- resource may be deleted later and we still want the historical event.
  resource_type             text,   -- 'book'|'thesis'|'publication'|'post'|'account'|'system'
  resource_id               uuid,
  user_id                   uuid references public.profiles(id) on delete set null,
  -- Correlation + idempotency.
  request_id                text,
  idempotency_key           text,
  -- Download decision context (mirrors research_report_downloads snapshots).
  permission_source         text,   -- 'automatic-ranking' | 'admin-override'
  permission_reason         text,   -- DenialReason enum value, e.g. 'TOP_TEN_RESTRICTED'
  rank_at_event             integer,
  institution_type_snapshot text,
  role_snapshot             text,
  purpose_snapshot          text,
  locale                    text,
  -- Salted/keyed hash only — NEVER a raw IP (retention + privacy).
  ip_hash                   text,
  user_agent_summary        text,
  metadata                  jsonb,
  occurred_at               timestamptz not null default now(),
  created_at                timestamptz not null default now(),
  constraint activity_events_status_ck
    check (event_status in ('authorized', 'denied', 'failed', 'success')),
  constraint activity_events_download_not_success_ck
    check (event_type <> 'download' or event_status <> 'success')
);

-- RLS rule for new tables (CLAUDE.md): enable RLS with NO policies so anon /
-- authenticated are denied outright; the service role bypasses RLS for the
-- download routes + admin read-model. REVOKE so PostgREST won't expose it.
alter table public.activity_events enable row level security;
revoke all on public.activity_events from anon, authenticated;

-- Idempotent successful/denied writes: at most one row per idempotency key.
create unique index if not exists uq_activity_events_idem
  on public.activity_events (idempotency_key)
  where idempotency_key is not null;

-- Read-path indexes (mirror the filters in lib/admin/activity-log.ts).
create index if not exists idx_activity_events_occurred   on public.activity_events (occurred_at desc);
create index if not exists idx_activity_events_type       on public.activity_events (event_type, occurred_at desc);
create index if not exists idx_activity_events_status     on public.activity_events (event_status, occurred_at desc);
create index if not exists idx_activity_events_resource   on public.activity_events (resource_type, resource_id);
create index if not exists idx_activity_events_user       on public.activity_events (user_id, occurred_at desc);
create index if not exists idx_activity_events_request    on public.activity_events (request_id);

comment on table public.activity_events is
  'Unified polymorphic activity events. Downloads here are ONLY denied/failed attempts; successful downloads stay in download_logs / research_report_downloads to avoid double-counting in the /admin/logs read-model.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Retention (operational policy — enforce via a scheduled job, not this file):
--   • activity_events rows            : 12–24 months
--   • detailed technical metadata     : consider nulling ip_hash / metadata after 90–180 days
--   • aggregate analytics             : longer, derived without personal data
-- ip_hash is a keyed hash, never a raw address, so correlation is possible
-- without durable PII.
--
-- Rollback (manual; destructive — loses denied/failed history):
--   drop table if exists public.activity_events;
-- ─────────────────────────────────────────────────────────────────────────────
