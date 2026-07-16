-- 0098_system_settings.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Enterprise System Settings — the database-backed single source of truth for
-- global organization / website information (names, contacts, address, opening
-- hours, social & map links, SEO defaults).
--
-- Replaces the hard-coded values in lib/ptec.ts. That file remains ONLY as the
-- documented safe fallback (and the source of these seed values): the runtime
-- reads published settings through lib/system-settings/config.ts and merges
-- them over the code defaults, so public pages keep working if this table is
-- empty or unreachable.
--
-- Design: one row per SECTION (not one giant JSON object, not a free key|value
-- table). Each section document has a strict TypeScript validator in
-- lib/system-settings/schemas.ts — the server actions are the only writers and
-- refuse invalid documents. Draft and published live side by side:
--
--   draft      — admin work-in-progress; NEVER served to the public site
--   published  — the live document; every publish/rollback bumps
--                published_version and appends an immutable row to
--                site_setting_versions
--
-- This file is ADDITIVE and idempotent (safe to re-run). All application code
-- degrades gracefully (PGRST205 swallowed → code defaults) until it is applied.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.site_settings (
  -- Section key doubles as the primary key: exactly one row per section.
  section            text primary key
                     check (section in ('organization', 'contact', 'hours', 'links', 'seo')),

  -- Admin draft (validated shape, see lib/system-settings/schemas.ts).
  -- NULL = no pending draft.
  draft              jsonb,
  draft_saved_at     timestamptz,
  draft_saved_by     uuid references public.profiles(id) on delete set null,

  -- The live document served to the public site (via the allowlisting mapper —
  -- raw rows are never returned to clients).
  published          jsonb not null,
  published_version  integer not null default 1 check (published_version >= 1),
  published_at       timestamptz not null default now(),
  published_by       uuid references public.profiles(id) on delete set null,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Immutable publication history. Rollback INSERTS a new version whose snapshot
-- is a copy of an older one — history is never rewritten or deleted.
create table if not exists public.site_setting_versions (
  id             uuid primary key default gen_random_uuid(),
  section        text not null
                 check (section in ('organization', 'contact', 'hours', 'links', 'seo')),
  version        integer not null check (version >= 1),
  snapshot       jsonb not null,
  action         text not null check (action in ('seed', 'publish', 'rollback')),
  -- For action = 'rollback': the version the snapshot was restored from.
  restored_from  integer,
  -- Dot-paths of fields that differ from the previous published version.
  changed_fields text[] not null default '{}',
  comment        text,
  published_at   timestamptz not null default now(),
  published_by   uuid references public.profiles(id) on delete set null,
  unique (section, version)
);

create index if not exists idx_site_setting_versions_section
  on public.site_setting_versions (section, version desc);

-- ── RLS: service-role only ───────────────────────────────────────────────────
-- Drafts must never be publicly readable, and the published documents are only
-- ever consumed server-side through the allowlisting mapper — so neither anon
-- nor authenticated gets ANY direct access. (PostgREST exposes public-schema
-- tables by default; this is the mandatory lockdown.)
alter table public.site_settings enable row level security;
alter table public.site_setting_versions enable row level security;
revoke all on public.site_settings from public, anon, authenticated;
revoke all on public.site_setting_versions from public, anon, authenticated;

comment on table public.site_settings is
  'Global site/organization configuration, one row per section. draft = admin work-in-progress (never public); published = live document. Written ONLY by the system-settings server actions (service role); read server-side through lib/system-settings/config.ts.';
comment on table public.site_setting_versions is
  'Immutable publication history for site_settings. Rollbacks append new versions; rows are never updated or deleted.';

-- ── Permission resource: "settings" ─────────────────────────────────────────
-- Mirrors DEFAULT_PERMISSIONS in lib/permissions.ts. Only admin / super_admin
-- may manage global settings; everyone else has no access.
insert into public.role_permissions (role, resource, level)
values
  ('reader',      'settings', 'none'),
  ('staff',       'settings', 'none'),
  ('librarian',   'settings', 'none'),
  ('admin',       'settings', 'write'),
  ('super_admin', 'settings', 'write')
on conflict (role, resource) do nothing;

-- ── Seed: current approved values (from lib/ptec.ts + app/root-metadata.ts) ──
-- These are the values live on the site today — nothing here is invented.
-- Version 1 of every section is the pre-migration state, action = 'seed'.
insert into public.site_settings (section, published, published_version)
values
  ('organization', '{
    "name": {
      "en": "Phnom Penh Teacher Education College",
      "km": "វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ",
      "short": "PTEC"
    },
    "libraryName": {
      "en": "PTEC Library",
      "km": "បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ"
    }
  }'::jsonb, 1),
  ('contact', '{
    "phone": "092 788 990",
    "phoneLibrary": "092 788 990",
    "email": "info@ptec.edu.kh",
    "emailInternational": "international@ptec.edu.kh",
    "address": {
      "en": "St. 271, Sangkat Teuk Laork 3, Khan Toul Kork, Phnom Penh, Cambodia",
      "km": "ផ្លូវ ២៧១ សង្កាត់ទឹកល្អក់៣ ខណ្ឌទួលគោក រាជធានីភ្នំពេញ ព្រះរាជាណាចក្រកម្ពុជា",
      "streetAddress": "St. 271, Sangkat Teuk Laork 3",
      "city": "Phnom Penh",
      "country": "KH",
      "postalCode": "120406"
    }
  }'::jsonb, 1),
  ('hours', '{
    "weekly": {
      "0": [],
      "1": [{"open": "07:00", "close": "17:00"}],
      "2": [{"open": "07:00", "close": "17:00"}],
      "3": [{"open": "07:00", "close": "17:00"}],
      "4": [{"open": "07:00", "close": "17:00"}],
      "5": [{"open": "07:00", "close": "17:00"}],
      "6": [{"open": "08:00", "close": "16:00"}]
    },
    "closures": []
  }'::jsonb, 1),
  ('links', '{
    "website": "https://www.ptec.edu.kh",
    "facebook": "https://web.facebook.com/ptec.edu",
    "messenger": "https://m.me/ptec.edu",
    "youtube": "https://www.youtube.com/@phnompenhteachereducationc3430",
    "telegram": "https://t.me/ptec_edu",
    "mapPlace": "https://www.google.com/maps/place/Phnom+Penh+Teacher+Education+College/@11.5574509,104.8872382,1090m/data=!3m1!1e3!4m6!3m5!1s0x310951a618265c67:0x159b1d2bb350bbae!8m2!3d11.5568858!4d104.8872782!16s%2Fg%2F1q665w1lh",
    "mapEmbed": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3908.772583842131!2d104.88470327464049!3d11.568153444093952!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x310951a618265c67%3A0x159b1d2bb350bbae!2sPhnom%20Penh%20Teacher%20Education%20College!5e0!3m2!1sen!2skh!4v1717904033000!5m2!1sen!2skh"
  }'::jsonb, 1),
  ('seo', '{
    "siteTitle": "PTEC Digital Teaching Library",
    "titleTemplate": "%s · PTEC Library",
    "siteName": "PTEC Digital Library",
    "siteDescription": {
      "en": "Access free teaching resources, books, and educational materials from the Phnom Penh Teacher Education College (PTEC).",
      "km": ""
    }
  }'::jsonb, 1)
on conflict (section) do nothing;

-- Version 1 history rows (idempotent: only where missing).
-- Deliberately alias-free: single-letter aliases kept getting lost in
-- copy/paste into the Supabase SQL editor (42P01 "missing FROM-clause entry").
insert into public.site_setting_versions (section, version, snapshot, action, comment)
select
  site_settings.section,
  1,
  site_settings.published,
  'seed',
  'Initial values migrated from lib/ptec.ts'
from public.site_settings
where site_settings.published_version = 1
  and not exists (
    select 1
    from public.site_setting_versions
    where site_setting_versions.section = site_settings.section
      and site_setting_versions.version = 1
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (manual; destructive — loses drafts and publication history):
--   drop table if exists public.site_setting_versions;
--   drop table if exists public.site_settings;
--   delete from public.role_permissions where resource = 'settings';
-- ─────────────────────────────────────────────────────────────────────────────
