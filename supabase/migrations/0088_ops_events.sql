-- 0088_ops_events.sql
-- Operational heartbeat log (roadmap Tasks 2 + 5).
--
-- Backup scripts (scripts/backup/*.mjs), the restore drill, and future
-- maintenance jobs record one row per run here. The deep health probe
-- (GET /api/health with the CRON_SECRET bearer) reads the latest
-- backup_db/backup_verify rows to answer "when did the last good backup
-- happen?" — which turns silent backup failure (risk R5 in
-- docs/OPERATIONS-AUDIT.md) into an alertable signal: an external monitor
-- alarms when backup_age_hours exceeds the policy in docs/BACKUP-DR.md.
--
-- Service-role only: written by ops scripts with the service key, read by
-- the guarded health probe. Detail payloads must never contain secrets,
-- file contents, or personal data — counts, hashes, durations, and paths
-- only (enforced by the writing scripts; see docs/BACKUP-DR.md §monitoring).
--
-- Rollback: drop table public.ops_events (nothing else references it).

create table if not exists public.ops_events (
  id         bigint      generated always as identity primary key,
  kind       text        not null check (kind in
               ('backup_db', 'backup_files', 'backup_config', 'backup_verify',
                'restore_drill', 'maintenance', 'other')),
  status     text        not null check (status in ('ok', 'warn', 'fail')),
  detail     jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ops_events_kind_idx
  on public.ops_events (kind, created_at desc);

alter table public.ops_events enable row level security;
revoke all on table public.ops_events from public, anon, authenticated;
