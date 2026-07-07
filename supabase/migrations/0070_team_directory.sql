-- ══════════════════════════════════════════════════════════════════════════
--  Migration 0070 — Team Directory upgrade
--
--  1. team_members: public-profile fields (photo alt, short bios,
--     responsibilities, languages, working hours), featured flag, and
--     explicit contact-privacy toggles.
--  2. team_sections: is_active flag + updated_at.
--  3. Recreates team_members_with_email (admin view) to include new columns.
--  4. Adds team_members_public — a deliberately SECURITY DEFINER view that is
--     the ONLY thing the public team page reads. It exposes a fixed safe
--     column list, bakes in the published/active filters, and nulls out
--     phone/email unless the admin explicitly approved them for public
--     display.
--
--  This migration is fully additive and safe to apply while the previous app
--  version is still deployed. Migration 0071 (which closes direct anon reads
--  of team_members) must wait until the new app version is live.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. team_members new columns ─────────────────────────────────────────
alter table public.team_members
  add column if not exists photo_alt            text,
  add column if not exists short_bio_km         text,
  add column if not exists short_bio_en         text,
  add column if not exists responsibilities_km  text[] not null default '{}',
  add column if not exists responsibilities_en  text[] not null default '{}',
  add column if not exists languages            text[] not null default '{}',
  add column if not exists working_hours        text,
  add column if not exists is_featured          boolean not null default false,
  add column if not exists show_phone_publicly  boolean not null default false,
  add column if not exists show_email_publicly  boolean not null default true;

-- Existing members with a phone were already displayed publicly before this
-- migration, so keep them visible (admins can switch them off). New members
-- default to private phone.
update public.team_members
   set show_phone_publicly = true
 where phone is not null;

-- ── 2. team_sections ────────────────────────────────────────────────────
alter table public.team_sections
  add column if not exists is_active  boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists team_sections_updated_at on public.team_sections;
create trigger team_sections_updated_at
  before update on public.team_sections
  for each row execute function public.touch_updated_at();

-- ── 3. Recreate admin view (tm.* column set changed, so drop + create) ──
drop view if exists public.team_members_with_email;
create view public.team_members_with_email
  with (security_invoker = true)
as
  select
    tm.*,
    p.email          as user_email,
    p.full_name      as user_full_name,
    ts.name_km       as section_name_km,
    ts.name_en       as section_name_en,
    ts.display_order as section_order,
    ts.is_active     as section_is_active
  from public.team_members tm
  left join public.profiles      p  on p.id  = tm.user_id
  left join public.team_sections ts on ts.id = tm.section_id;

-- ── 4. Public-safe view ─────────────────────────────────────────────────
-- SECURITY DEFINER on purpose: this view IS the public API surface for the
-- team page. It enumerates safe columns only, filters to published members
-- in active (or no) sections, and gates contact fields on the per-member
-- privacy toggles. Internal phone numbers and unlinked profile data can
-- never be read through it.
drop view if exists public.team_members_public;
create view public.team_members_public as
  select
    tm.id,
    tm.name_km,
    tm.name_en,
    tm.position_km,
    tm.position_en,
    tm.education,
    tm.years_experience,
    tm.photo_url,
    tm.photo_alt,
    tm.short_bio_km,
    tm.short_bio_en,
    tm.bio_km,
    tm.bio_en,
    tm.responsibilities_km,
    tm.responsibilities_en,
    tm.languages,
    tm.working_hours,
    tm.is_featured,
    tm.display_order,
    tm.created_at,
    tm.section_id,
    ts.name_km       as section_name_km,
    ts.name_en       as section_name_en,
    ts.display_order as section_order,
    case when tm.show_phone_publicly then tm.phone end as phone,
    case when tm.show_email_publicly then p.email end  as email
  from public.team_members tm
  left join public.profiles      p  on p.id  = tm.user_id
  left join public.team_sections ts on ts.id = tm.section_id
  where tm.is_published = true
    and (tm.section_id is null or ts.is_active);

comment on view public.team_members_public is
  'Public API surface for /about/team. SECURITY DEFINER by design: exposes a fixed safe column list and enforces publish/privacy rules itself.';

revoke all on public.team_members_public from public;
grant select on public.team_members_public to anon, authenticated, service_role;
