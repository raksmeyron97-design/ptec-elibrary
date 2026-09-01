-- 0127_security_monitoring.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Security monitoring: durable events, incidents, alert deliveries, baselines.
--
-- WHY THIS EXISTS
-- Every security event in this app was a `console.warn` line
-- (lib/security-log.ts). On the ZimaOS container those land in the default
-- json-file log driver and rotate away, and no aggregator was ever wired
-- (docs/MONITORING.md §Log-based alerts still says "wire these filters
-- wherever logs land"). The consequence, measured in
-- docs/SECURITY_MONITORING_AUDIT.md §1: the entire Security section of
-- docs/ALERT-CATALOG.md — twelve alerts with thresholds, owners and runbooks —
-- had no mechanism that could ever fire it. This migration gives those
-- thresholds something to count.
--
-- WHY NOT REUSE activity_events (0094)
-- The Phase 0 audit initially proposed exactly that: 0094's own comment says it
-- can "absorb account/admin/security events without more DDL". Detailed design
-- reversed that call, for two concrete reasons:
--
--   1. DILUTION. lib/admin/activity-log.ts reads each source table with
--      SOURCE_CAP = 5000 rows per range. Security events are by far the
--      highest-volume class (rate_limited alone has 23 call sites), so
--      co-locating them would push downloads and views out of the /admin/logs
--      read-model — silently degrading a working feature.
--   2. INDEXING. The detection engine queries by (event_type, occurred_at),
--      (fingerprint, occurred_at) and severity on every pass. In 0094 those
--      would live inside `metadata jsonb` behind expression indexes, and
--      event_status there is CHECK-constrained to a vocabulary
--      ('authorized'|'denied'|...) that does not match the security result
--      model ('allowed'|'blocked'|'failed'|'success').
--
-- activity_events is therefore left completely untouched, and /admin/logs
-- keeps working exactly as before.
--
-- PRIVACY
-- No raw IP is ever stored. `ip_hash` is the same daily-rotating keyed-HMAC
-- scheme 0087/0090/0094 already use: a visitor's events group within a day and
-- cannot be correlated across days. `detail` and `metadata` are scrubbed and
-- truncated by lib/security/model.ts before they arrive. Matched attack
-- payloads are NEVER stored — only a signature class (e.g. 'sqli.union'),
-- because a stored payload is a stored attack that re-executes in whatever
-- renders it.
--
-- SECURITY POSTURE
-- Service-role only, matching ops_events (0088), app_events (0090) and
-- activity_events (0094): RLS enabled with no policies, plus REVOKE so
-- PostgREST does not expose these tables to anon/authenticated.
--
-- ROLLBACK (destructive — loses incident history):
--   drop table if exists public.security_baselines;
--   drop table if exists public.alert_deliveries;
--   drop table if exists public.security_events;
--   drop table if exists public.security_incidents;
--   drop function if exists public.next_incident_reference();
--   drop function if exists public.security_incidents_touch();
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Incidents ────────────────────────────────────────────────────────────
--
-- An incident is the unit an operator is told about. Many events → one
-- incident. The lifecycle is the brief's:
--   detected → open → acknowledged → investigating → mitigating → recovered → closed
-- `detected` exists separately from `open` so a detector can record something
-- it is not yet willing to alert on (below the notify threshold, or inside a
-- silence window) without inventing a second table.

create table if not exists public.security_incidents (
  id                 uuid        primary key default gen_random_uuid(),
  -- Human-facing id used in Telegram and in conversation: SEC-20260831-001.
  reference          text        not null unique,
  -- The dedupe key from lib/security/model.ts fingerprint(). Stable for the
  -- life of one attack; see the partial unique index below.
  fingerprint        text        not null,
  status             text        not null default 'detected',
  severity           smallint    not null,
  risk_score         smallint    not null default 0,
  -- Event family (auth_attack, privilege, abuse, upload, malware,
  -- availability, edge, …) — what the dashboard groups by.
  category           text        not null,
  title              text        not null,
  summary            text,
  service            text        not null,
  -- Parent/child grouping (§12): a storage outage suppresses the PDF-
  -- unavailable incident beneath it instead of paging twice.
  parent_incident_id uuid        references public.security_incidents(id) on delete set null,
  event_count        integer     not null default 0,
  first_seen         timestamptz not null default now(),
  last_seen          timestamptz not null default now(),
  acknowledged_at    timestamptz,
  acknowledged_by    uuid,
  assigned_to        uuid,
  recovered_at       timestamptz,
  closed_at          timestamptz,
  -- Operator-set mute. Alerts are suppressed while this is in the future; the
  -- incident keeps updating, so silencing loses no evidence.
  silenced_until     timestamptz,
  -- Why the detector fired, in words, with the numbers that triggered it.
  detection_reason   text,
  resolution         text,
  runbook            text,
  -- Notification bookkeeping — the state that makes dedupe real.
  last_alert_at      timestamptz,
  alert_count        integer     not null default 0,
  recovery_alert_at  timestamptz,
  -- Engine bookkeeping. Holds `lastAlertSeverity`: the severity at the time of
  -- the last notification, which is what the escalation test compares against.
  -- It cannot be derived from `severity`, because severity only ever moves
  -- upward within an incident's life — so the current value would always
  -- equal itself and no escalation would ever be detected.
  metadata           jsonb       not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint security_incidents_status_ck check (status in
    ('detected', 'open', 'acknowledged', 'investigating', 'mitigating', 'recovered', 'closed')),
  constraint security_incidents_severity_ck  check (severity between 1 and 4),
  constraint security_incidents_risk_ck      check (risk_score between 0 and 100),
  constraint security_incidents_no_self_parent_ck check (parent_incident_id is null or parent_incident_id <> id)
);

-- THE dedupe primitive. At most one live incident per fingerprint, enforced by
-- the database rather than by application logic — so two concurrent detector
-- passes (or a cron overlapping a request-path escalation) cannot both open
-- one. Recovered/closed incidents are excluded, so a recurrence after recovery
-- correctly opens a NEW incident instead of resurrecting an old one.
create unique index if not exists security_incidents_live_fingerprint_uq
  on public.security_incidents (fingerprint)
  where status not in ('recovered', 'closed');

create index if not exists security_incidents_status_idx    on public.security_incidents (status, last_seen desc);
create index if not exists security_incidents_severity_idx  on public.security_incidents (severity, last_seen desc);
create index if not exists security_incidents_last_seen_idx on public.security_incidents (last_seen desc);
create index if not exists security_incidents_category_idx  on public.security_incidents (category, last_seen desc);
create index if not exists security_incidents_parent_idx    on public.security_incidents (parent_incident_id)
  where parent_incident_id is not null;

comment on table public.security_incidents is
  'One row per distinct security problem. Many security_events collapse onto one incident via fingerprint; the partial unique index guarantees at most one live incident per fingerprint.';

-- ── 2. Events ───────────────────────────────────────────────────────────────

create table if not exists public.security_events (
  id           bigint      generated always as identity primary key,
  event_type   text        not null,
  severity     smallint    not null,
  risk_score   smallint    not null default 0,
  risk_reason  text,
  service      text        not null,
  -- `where` is reserved in SQL; the application field of the same name maps here.
  location     text        not null,
  actor_type   text        not null,
  -- Deliberately NOT a foreign key to profiles. A security event about an
  -- account that was later deleted is precisely the event worth keeping, and
  -- an FK would make the insert fail on the hot request path if the profile
  -- vanished mid-flight. The column is indexed for joins that opt in.
  actor_id     uuid,
  target       text,
  result       text        not null,
  detail       text,
  request_id   text,
  -- Daily-rotating keyed HMAC of the client IP. Never a raw address.
  ip_hash      text,
  -- How many raw occurrences an aggregated/derived event stands for.
  event_count  integer     not null default 1,
  fingerprint  text        not null,
  incident_id  uuid        references public.security_incidents(id) on delete set null,
  metadata     jsonb       not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  constraint security_events_severity_ck check (severity between 1 and 4),
  constraint security_events_risk_ck     check (risk_score between 0 and 100),
  constraint security_events_result_ck   check (result in ('allowed', 'blocked', 'failed', 'success')),
  constraint security_events_actor_ck    check (actor_type in ('anonymous', 'user', 'admin', 'system', 'external')),
  constraint security_events_count_ck    check (event_count >= 1)
);

-- Index set mirrors exactly the queries in lib/security/detect/* and the
-- dashboard; nothing speculative. Each one is justified:
--   occurred_at      — every detector pass is a time-range scan
--   type+time        — per-detector threshold counting
--   fingerprint+time — correlation and incident attachment
--   incident_id      — the incident detail page's evidence list
--   severity+time    — the dashboard's "high-risk events" tiles
--   request_id       — cross-layer investigation from one x-request-id
--   actor+time       — "what else did this account do?" (partial: mostly null)
create index if not exists security_events_occurred_idx    on public.security_events (occurred_at desc);
create index if not exists security_events_type_idx        on public.security_events (event_type, occurred_at desc);
create index if not exists security_events_fingerprint_idx on public.security_events (fingerprint, occurred_at desc);
create index if not exists security_events_incident_idx    on public.security_events (incident_id, occurred_at desc)
  where incident_id is not null;
create index if not exists security_events_severity_idx    on public.security_events (severity, occurred_at desc);
create index if not exists security_events_request_idx     on public.security_events (request_id)
  where request_id is not null;
create index if not exists security_events_actor_idx       on public.security_events (actor_id, occurred_at desc)
  where actor_id is not null;

comment on table public.security_events is
  'Durable security event stream. Written best-effort off the request path (Next.js after()); readers must tolerate gaps. No raw IPs, no attack payloads — only signature classes.';

-- ── 3. Alert deliveries (§30, §41 — observability of the alerting itself) ───
--
-- Without this table a Telegram outage is silent: incidents keep opening and
-- nobody is told, and nobody knows nobody was told. One row per attempt.

create table if not exists public.alert_deliveries (
  id          bigint      generated always as identity primary key,
  incident_id uuid        references public.security_incidents(id) on delete cascade,
  channel     text        not null,
  kind        text        not null,
  status      text        not null,
  attempt     smallint    not null default 1,
  -- Error CLASS only ('http_429', 'timeout', 'no_credentials') — never the
  -- provider's response body, which can echo the message back.
  error_class text,
  latency_ms  integer,
  created_at  timestamptz not null default now(),
  constraint alert_deliveries_channel_ck check (channel in ('telegram', 'email', 'github', 'log')),
  constraint alert_deliveries_kind_ck    check (kind in ('alert', 'recovery', 'escalation', 'digest', 'test')),
  constraint alert_deliveries_status_ck  check (status in ('sent', 'failed', 'suppressed', 'skipped'))
);

create index if not exists alert_deliveries_created_idx  on public.alert_deliveries (created_at desc);
create index if not exists alert_deliveries_incident_idx on public.alert_deliveries (incident_id, created_at desc);
create index if not exists alert_deliveries_status_idx   on public.alert_deliveries (status, created_at desc);

-- ── 4. Baselines (§25) ──────────────────────────────────────────────────────
--
-- Rolling per-signal statistics so "1,240 downloads/hour" can be stated as
-- "24.8× baseline" instead of an arbitrary constant. Populated by the cron
-- pass once enough history exists; detectors fall back to fixed thresholds
-- until then, because a baseline computed over an empty table is a
-- false-positive generator, not a detector.

create table if not exists public.security_baselines (
  id           bigint      generated always as identity primary key,
  -- Signal key, e.g. 'rate_limited:/api/search' or 'download_abuse:delivery'.
  signal       text        not null,
  bucket_hours smallint    not null default 1,
  window_start timestamptz not null,
  sample_count integer     not null,
  mean         numeric     not null,
  stddev       numeric,
  p95          numeric,
  computed_at  timestamptz not null default now(),
  constraint security_baselines_bucket_ck check (bucket_hours between 1 and 168),
  constraint security_baselines_samples_ck check (sample_count >= 0)
);

create unique index if not exists security_baselines_signal_uq
  on public.security_baselines (signal, bucket_hours, window_start);
create index if not exists security_baselines_signal_idx
  on public.security_baselines (signal, computed_at desc);

-- ── 5. Incident reference generator ─────────────────────────────────────────
--
-- SEC-<YYYYMMDD>-<NNN>, dated in Asia/Phnom_Penh because that is the day the
-- responder is living in. The transaction-scoped advisory lock serializes
-- concurrent inserts so the counter cannot produce a duplicate — cheaper and
-- more predictable than catching the unique violation and retrying, and this
-- runs a handful of times a day.

create or replace function public.next_incident_reference()
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  day_key text;
  seq     integer;
begin
  perform pg_advisory_xact_lock(hashtext('security_incident_reference'));
  day_key := to_char((now() at time zone 'Asia/Phnom_Penh'), 'YYYYMMDD');
  select count(*) + 1 into seq
    from public.security_incidents
   where reference like 'SEC-' || day_key || '-%';
  return 'SEC-' || day_key || '-' || lpad(seq::text, 3, '0');
end;
$$;

-- ── 6. updated_at ───────────────────────────────────────────────────────────

create or replace function public.security_incidents_touch()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists security_incidents_set_updated_at on public.security_incidents;
create trigger security_incidents_set_updated_at
  before update on public.security_incidents
  for each row execute function public.security_incidents_touch();

-- ── 7. Lock everything down ─────────────────────────────────────────────────
-- RLS enabled with NO policies (anon/authenticated denied outright) + REVOKE
-- so PostgREST will not expose them. The service role bypasses RLS; the admin
-- surfaces read through it behind requireAdmin().

alter table public.security_incidents enable row level security;
alter table public.security_events    enable row level security;
alter table public.alert_deliveries   enable row level security;
alter table public.security_baselines enable row level security;

revoke all on table public.security_incidents from public, anon, authenticated;
revoke all on table public.security_events    from public, anon, authenticated;
revoke all on table public.alert_deliveries   from public, anon, authenticated;
revoke all on table public.security_baselines from public, anon, authenticated;

revoke all on function public.next_incident_reference() from public, anon, authenticated;

-- ── 8. Retention ────────────────────────────────────────────────────────────
-- Enforced by /api/cron/cleanup (daily), not by this file — the same place
-- rate_limit rows are purged. Policy, mirroring 0094's:
--   security_events    : 180 days  (ip_hash is already un-correlatable past a day)
--   alert_deliveries   : 180 days
--   security_baselines : 90 days of computed windows
--   security_incidents : kept — incident history is the institutional record,
--                        and it is low-volume by construction.
