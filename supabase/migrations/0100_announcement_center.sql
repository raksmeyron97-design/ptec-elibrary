-- 0100_announcement_center.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Announcement Center: replaces the two disconnected /admin/announcements forms
-- ("Push Notification" + "New Announcement") with one auditable, schedulable,
-- multi-channel entity. Purely additive — the legacy `notifications` /
-- `notification_reads` tables (read by NotificationBell, getNotifications(),
-- getUnreadCount()) are untouched, so every existing announcement and its
-- read-state survives this migration unchanged.
--
-- Design:
--   • announcements               — canonical entity (bilingual content,
--                                    channels, audience rule, schedule, status).
--   • announcement_status_history — append-only status timeline for the
--                                    detail-page audit trail.
--   • announcement_delivery_jobs  — one row per publish attempt. Idempotent via
--                                    a unique key so a double-click, browser
--                                    retry, or worker restart cannot create a
--                                    second broadcast for the same publish.
--   • announcement_push_deliveries — one row per (job, subscription) attempt;
--                                    the unique constraint is what makes resend
--                                    / cron-resume safe (upsert, never re-send
--                                    to a subscription that already succeeded).
--   • announcement_templates      — reusable content/channel defaults; applying
--                                    one only pre-fills a new draft, it never
--                                    publishes anything itself.
--
-- `notifications.source_announcement_id` bridges a published in-app channel
-- back to the existing reader-facing feed, so NotificationBell / the unread
-- badge keep working with ZERO changes.
--
-- RLS: every new table is service-role-only (enable RLS, no policies, REVOKE
-- ALL from anon/authenticated) per the CLAUDE.md rule — all reads/writes go
-- through admin Server Actions and the cron sweep, both service-role.
--
-- Rollback (manual; loses schedule/delivery/template history only — the
-- legacy `notifications` rows and their read-state are never touched):
--   drop table if exists public.announcement_push_deliveries;
--   drop table if exists public.announcement_delivery_jobs;
--   drop table if exists public.announcement_status_history;
--   drop table if exists public.announcement_templates;
--   drop table if exists public.announcements;
--   alter table public.notifications drop column if exists source_announcement_id;
--   delete from public.role_permissions where resource = 'announcements_push';
-- ─────────────────────────────────────────────────────────────────────────────

-- ── announcements ────────────────────────────────────────────────────────────
create table if not exists public.announcements (
  id                uuid primary key default gen_random_uuid(),

  -- Internal / campaign name — never shown to readers.
  internal_name     text not null,
  type              text not null default 'general'
    check (type in ('general', 'new_resource', 'event', 'maintenance', 'emergency', 'policy_update', 'other')),
  priority          text not null default 'normal'
    check (priority in ('normal', 'important', 'urgent')),

  -- Bilingual content. English is the only hard requirement (mirrors posts);
  -- Khmer is strongly encouraged and surfaced via completion indicators in the
  -- composer, never silently machine-translated or overwritten.
  title_en          text not null,
  title_km          text,
  summary_en        text,
  summary_km        text,
  body_en           text,
  body_km           text,
  cta_label_en      text,
  cta_label_km      text,
  cta_url           text,
  image_url         text,

  -- Channels — independent booleans, never inferred from each other. Publishing
  -- in-app content must never implicitly trigger a push send (mission
  -- requirement); the composer and publish action both respect this.
  channel_in_app    boolean not null default true,
  channel_banner    boolean not null default false,
  channel_push      boolean not null default false,

  -- Push-specific overrides (fall back to title_en/summary_en when null).
  push_title        text,
  push_body         text,
  push_url          text,
  push_ttl_seconds  integer,

  -- Audience — explicit, server-verified at publish time. `all_active` only
  -- ever means profiles.status = 'active'; disabled/pending/blocked accounts
  -- are always excluded regardless of audience_type.
  audience_type     text not null default 'all_active'
    check (audience_type in ('all_active', 'role', 'push_enabled', 'individual')),
  audience_roles    text[] not null default '{}',
  audience_user_ids uuid[] not null default '{}',

  -- Display / lifecycle behavior.
  pinned            boolean not null default false,
  dismissible       boolean not null default true,

  status            text not null default 'draft'
    check (status in (
      'draft', 'awaiting_approval', 'scheduled', 'publishing', 'active',
      'partially_delivered', 'completed', 'expired', 'failed', 'cancelled', 'archived'
    )),

  scheduled_at      timestamptz,
  published_at      timestamptz,
  expires_at        timestamptz,
  archived_at       timestamptz,

  -- Idempotency for the publish action itself — set once, right before the
  -- first publish attempt; a retried/duplicated publish request reuses it
  -- instead of minting a second delivery job (see lib/admin/announcements).
  publish_idempotency_key text,

  -- Cached last-computed audience estimate (composer preview) — always
  -- recalculated server-side again immediately before publish, never trusted
  -- from the client at send time.
  estimated_recipients integer,
  estimated_devices    integer,
  estimate_computed_at timestamptz,

  -- Aggregate click counter (CTA clicks) — a simple counter, not a per-user
  -- log, so click-through rate is honest without overengineering an event
  -- table for a low-volume public library.
  click_count       integer not null default 0,

  created_by        uuid references public.profiles(id) on delete set null,
  updated_by        uuid references public.profiles(id) on delete set null,
  approved_by       uuid references public.profiles(id) on delete set null,
  approved_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint announcements_expiry_after_publish
    check (expires_at is null or scheduled_at is null or expires_at > scheduled_at)
);

create index if not exists idx_announcements_status       on public.announcements (status, created_at desc);
create index if not exists idx_announcements_scheduled_at  on public.announcements (scheduled_at) where status = 'scheduled';
create index if not exists idx_announcements_expires_at    on public.announcements (expires_at) where status in ('active', 'partially_delivered', 'completed');
create index if not exists idx_announcements_created_by    on public.announcements (created_by);
create index if not exists idx_announcements_pinned        on public.announcements (pinned) where pinned = true;
create unique index if not exists uq_announcements_publish_idem
  on public.announcements (publish_idempotency_key)
  where publish_idempotency_key is not null;

drop trigger if exists announcements_set_updated_at on public.announcements;
create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;

-- ── announcement_status_history ─────────────────────────────────────────────
create table if not exists public.announcement_status_history (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  from_status     text,
  to_status       text not null,
  actor_id        uuid references public.profiles(id) on delete set null,
  reason          text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_announcement_status_history_ann
  on public.announcement_status_history (announcement_id, created_at desc);

alter table public.announcement_status_history enable row level security;
revoke all on public.announcement_status_history from anon, authenticated;

-- ── announcement_delivery_jobs ───────────────────────────────────────────────
-- One row per publish attempt. `idempotency_key` is the real duplicate-send
-- guard: publishAnnouncement() derives it deterministically from the
-- announcement id + the specific publish event, so a double form submit,
-- refresh, or retried request always maps to the SAME job row instead of
-- creating a second broadcast.
create table if not exists public.announcement_delivery_jobs (
  id               uuid primary key default gen_random_uuid(),
  announcement_id  uuid not null references public.announcements(id) on delete cascade,
  channel          text not null default 'push' check (channel in ('push')),
  idempotency_key  text not null,
  status           text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  total_targets    integer not null default 0,
  processed        integer not null default 0,
  sent             integer not null default 0,
  failed           integer not null default 0,
  expired          integer not null default 0,
  started_at       timestamptz,
  completed_at     timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists uq_announcement_delivery_jobs_idem
  on public.announcement_delivery_jobs (idempotency_key);
create index if not exists idx_announcement_delivery_jobs_ann
  on public.announcement_delivery_jobs (announcement_id);
create index if not exists idx_announcement_delivery_jobs_status
  on public.announcement_delivery_jobs (status) where status in ('pending', 'running');

drop trigger if exists announcement_delivery_jobs_set_updated_at on public.announcement_delivery_jobs;
create trigger announcement_delivery_jobs_set_updated_at
  before update on public.announcement_delivery_jobs
  for each row execute function public.set_updated_at();

alter table public.announcement_delivery_jobs enable row level security;
revoke all on public.announcement_delivery_jobs from anon, authenticated;

-- ── announcement_push_deliveries ─────────────────────────────────────────────
-- One row per (job, subscription). The unique constraint is the idempotency
-- guard for individual sends: re-running a job (cron resume, manual "resend
-- failed") upserts on this key, so an already-`sent` row is never re-sent.
-- push_subscription_id is nullable (ON DELETE SET NULL) so history survives a
-- later subscription cleanup.
create table if not exists public.announcement_push_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.announcement_delivery_jobs(id) on delete cascade,
  announcement_id     uuid not null references public.announcements(id) on delete cascade,
  push_subscription_id uuid references public.push_subscriptions(id) on delete set null,
  user_id             uuid references public.profiles(id) on delete set null,
  status              text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'expired', 'dead')),
  error_code          text,
  retry_count         integer not null default 0,
  next_retry_at       timestamptz,
  attempted_at        timestamptz,
  delivered_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists uq_announcement_push_deliveries_job_sub
  on public.announcement_push_deliveries (job_id, push_subscription_id)
  where push_subscription_id is not null;
create index if not exists idx_announcement_push_deliveries_ann
  on public.announcement_push_deliveries (announcement_id);
create index if not exists idx_announcement_push_deliveries_retry
  on public.announcement_push_deliveries (status, next_retry_at) where status = 'failed';

drop trigger if exists announcement_push_deliveries_set_updated_at on public.announcement_push_deliveries;
create trigger announcement_push_deliveries_set_updated_at
  before update on public.announcement_push_deliveries
  for each row execute function public.set_updated_at();

alter table public.announcement_push_deliveries enable row level security;
revoke all on public.announcement_push_deliveries from anon, authenticated;

-- ── announcement_templates ──────────────────────────────────────────────────
create table if not exists public.announcement_templates (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  type             text not null default 'general'
    check (type in ('general', 'new_resource', 'event', 'maintenance', 'emergency', 'policy_update', 'other')),
  priority         text not null default 'normal'
    check (priority in ('normal', 'important', 'urgent')),
  title_en         text not null,
  title_km         text,
  summary_en       text,
  summary_km       text,
  body_en          text,
  body_km          text,
  cta_label_en     text,
  cta_label_km     text,
  cta_url          text,
  default_channels jsonb not null default '{"in_app": true, "banner": false, "push": false}'::jsonb,
  is_archived      boolean not null default false,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_announcement_templates_active
  on public.announcement_templates (is_archived, created_at desc);

drop trigger if exists announcement_templates_set_updated_at on public.announcement_templates;
create trigger announcement_templates_set_updated_at
  before update on public.announcement_templates
  for each row execute function public.set_updated_at();

alter table public.announcement_templates enable row level security;
revoke all on public.announcement_templates from anon, authenticated;

-- ── Bridge: link a legacy `notifications` row back to its announcement ──────
-- Nullable, additive. When an announcement's in-app channel is published, the
-- publish action inserts one `notifications` row (type='announcement') and
-- stamps this column — NotificationBell / getNotifications() / getUnreadCount()
-- need no changes at all. Expiring or archiving the announcement removes the
-- linked notification so it stops appearing as "unread" forever.
alter table public.notifications
  add column if not exists source_announcement_id uuid references public.announcements(id) on delete set null;

create index if not exists idx_notifications_source_announcement
  on public.notifications (source_announcement_id)
  where source_announcement_id is not null;

-- ── Permission resource: "announcements_push" ────────────────────────────────
-- Separates broadcast authority from content authority (mission requirement).
-- `announcements` (existing resource) still governs create/edit/schedule/
-- in-app-publish; sending the push channel additionally requires
-- `announcements_push = write`. Mirrors DEFAULT_PERMISSIONS in lib/permissions.ts.
insert into public.role_permissions (role, resource, level)
values
  ('reader',      'announcements_push', 'none'),
  ('staff',       'announcements_push', 'none'),
  ('librarian',   'announcements_push', 'none'),
  ('admin',       'announcements_push', 'write'),
  ('super_admin', 'announcements_push', 'write')
on conflict (role, resource) do nothing;

comment on table public.announcements is
  'Announcement Center: unified bilingual, multi-channel, scheduled announcements. Publishing the in-app channel bridges into the legacy notifications table via source_announcement_id.';
comment on table public.announcement_delivery_jobs is
  'One row per publish attempt (idempotent via idempotency_key) — the duplicate-broadcast guard.';
comment on table public.announcement_push_deliveries is
  'One row per (job, push_subscription) attempt — the per-device delivery/retry/analytics record.';
