-- 0093_thesis_download_access.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Thesis Download Permission System.
--
-- Adds the data model for gating thesis PDF *downloads* (preview/read is
-- unaffected) behind a completed reader "Download Access Profile" plus a
-- Top-10 protection policy with a per-thesis admin override.
--
-- Three concerns, all additive & idempotent so this is safe to re-run and
-- never rewrites existing production data:
--   1. profiles          — reusable reader Download Access Profile fields
--   2. research_reports   — tri-state admin download override + audit columns
--   3. research_report_downloads — successful-download analytics events
--      + research_report_rankings view — deterministic global Top-N ranking
--
-- research_reports already has: download_count, view_count, is_published,
-- status ('draft'|'pending_review'|'published'|'scheduled'|'archived'|
-- 'rejected'), published_at, created_at, slug. profiles already has:
-- full_name, avatar_url, role, is_super_admin, status, phone.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Reader Download Access Profile (public.profiles) ──────────────────────
-- Canonical, reusable reader information. `full_name` (existing) and the
-- verified email (from auth) are reused, never re-collected. All new columns
-- are nullable so existing readers keep working and are simply "incomplete"
-- until they fill these in at /dashboard/settings. Stable enum VALUES are
-- stored; display labels are translated in the UI (i18n).
alter table public.profiles
  add column if not exists gender text
    check (gender is null or gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  add column if not exists institution_name        text,
  add column if not exists institution_type        text,
  add column if not exists faculty_department       text,
  add column if not exists professional_role        text,
  add column if not exists country                  text,
  add column if not exists province_city            text,
  add column if not exists student_staff_id         text,
  add column if not exists download_purpose         text,
  add column if not exists download_purpose_other   text,
  add column if not exists responsible_use_accepted_at timestamptz,
  add column if not exists download_privacy_consent_at timestamptz,
  add column if not exists download_profile_updated_at timestamptz;

-- ── 2. Per-thesis admin download override (public.research_reports) ──────────
-- Tri-state, NOT a boolean: 'inherit' keeps the automatic Top-10 policy,
-- 'allow'/'block' are explicit admin decisions that win over ranking. Default
-- 'inherit' backfills every legacy thesis to the automatic policy without a
-- separate UPDATE (safe: no thesis is silently unblocked or blocked).
alter table public.research_reports
  add column if not exists download_override text not null default 'inherit'
    check (download_override in ('inherit', 'allow', 'block')),
  add column if not exists download_override_reason      text,
  add column if not exists download_override_updated_by  uuid
    references public.profiles(id) on delete set null,
  add column if not exists download_override_updated_at  timestamptz;

-- Speeds up the ranking window function (Top-N among published theses) and the
-- deterministic tie-break order used by the permission engine.
create index if not exists idx_research_reports_download_rank
  on public.research_reports (download_count desc, published_at desc, id)
  where is_published = true;

-- ── 3. Successful-download analytics (public.research_report_downloads) ──────
-- One row per authorized download. Stores only the MINIMUM institutional
-- snapshots needed for aggregate reporting — never the reader's full profile.
-- Service-role only (see RLS below); all writes go through the download route.
create table if not exists public.research_report_downloads (
  id                        uuid primary key default gen_random_uuid(),
  report_id                 uuid not null references public.research_reports(id) on delete cascade,
  user_id                   uuid references public.profiles(id) on delete set null,
  downloaded_at             timestamptz not null default now(),
  permission_source         text,   -- 'automatic-ranking' | 'admin-override'
  rank_at_download          integer,
  institution_type_snapshot text,
  role_snapshot             text,
  purpose_snapshot          text
);

-- RLS rule for new tables (CLAUDE.md): enable RLS with NO policies so anon /
-- authenticated are denied outright; the service role bypasses RLS for the
-- download route + admin analytics. Also REVOKE so PostgREST won't expose it.
alter table public.research_report_downloads enable row level security;
revoke all on public.research_report_downloads from anon, authenticated;

create index if not exists idx_rrd_report        on public.research_report_downloads (report_id);
create index if not exists idx_rrd_user          on public.research_report_downloads (user_id);
create index if not exists idx_rrd_downloaded_at on public.research_report_downloads (downloaded_at desc);
-- Idempotency window lookup (same user + report within a few seconds).
create index if not exists idx_rrd_report_user_time
  on public.research_report_downloads (report_id, user_id, downloaded_at desc);

-- ── 4. Deterministic global Top-N ranking view ──────────────────────────────
-- Global (NOT per-page / per-filter / per-locale) ranking among PUBLISHED
-- theses only, by lifetime successful downloads. Deterministic + stable
-- tie-break: download_count DESC, published_at DESC (NULLS LAST), id ASC.
-- Unpublished / archived / draft theses never appear (no rank → null).
--
-- Not sensitive (derivable from public download counts) but REVOKEd from
-- anon/authenticated per the RLS-for-new-objects rule; queried via the service
-- role by the permission engine + admin. Never served through a shared public
-- cache (it changes on every successful download).
create or replace view public.research_report_rankings as
select
  id as report_id,
  row_number() over (
    order by coalesce(download_count, 0) desc,
             published_at desc nulls last,
             id asc
  )::integer as rank
from public.research_reports
where is_published = true
  and status = 'published';

revoke all on public.research_report_rankings from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback considerations (manual; not auto-applied):
--   drop view if exists public.research_report_rankings;
--   drop table if exists public.research_report_downloads;
--   alter table public.research_reports
--     drop column if exists download_override,
--     drop column if exists download_override_reason,
--     drop column if exists download_override_updated_by,
--     drop column if exists download_override_updated_at;
--   drop index if exists public.idx_research_reports_download_rank;
--   alter table public.profiles
--     drop column if exists gender, drop column if exists institution_name,
--     drop column if exists institution_type, drop column if exists faculty_department,
--     drop column if exists professional_role, drop column if exists country,
--     drop column if exists province_city, drop column if exists student_staff_id,
--     drop column if exists download_purpose, drop column if exists download_purpose_other,
--     drop column if exists responsible_use_accepted_at,
--     drop column if exists download_privacy_consent_at,
--     drop column if exists download_profile_updated_at;
-- Dropping columns is destructive (reader profiles + admin overrides are lost);
-- prefer leaving the columns in place and toggling the feature off in code.
-- ─────────────────────────────────────────────────────────────────────────────
