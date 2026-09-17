-- 0150_library_committee.sql
--
-- The Library Committee, as a RELATIONSHIP over the existing people, not a
-- second directory of people.
--
-- WHY NO SECOND PEOPLE TABLE. `team_members` (initial schema, extended by
-- 0070/0115/0116) is already the canonical person record: name in both
-- languages, portrait, education, bios, slug, linked account, publish state,
-- privacy toggles. A committee table carrying its own `name_km`/`photo_url`
-- would mean the same human is created twice, corrected twice, and can
-- disagree with itself between /about/team and /about/committee. So the only
-- thing stored here is what is true about the COMMITTEE:
--
--   committee_sections — the governance grouping (leadership, teaching
--                        members, library officers…), admin-named, never
--                        hard-coded in the page.
--   committee_members  — one SEAT: which person, in which section, under what
--                        committee role and responsibility, in what order, and
--                        whether the seat is published.
--
-- WHY `unique (team_member_id)` AND NOT `unique (team_member_id, section_id)`.
-- The committee is one body: a person holds one seat, with one role. The pair
-- would additionally not do the job asked of it — `committee_section_id` is
-- nullable and NULLs never collide in a UNIQUE index, so two unsectioned seats
-- for one person would both be accepted and the reader would meet the same
-- person twice. One row per person is the stronger constraint and the true one.
--
-- WHY THE CASCADE POINTS ONE WAY. `team_member_id … on delete cascade` means
-- deleting the PERSON retires their seat. Nothing in this schema can travel the
-- other way: removing a committee row is a DELETE on `committee_members` and
-- reaches no parent, which is the structural half of the promise the admin UI
-- makes in words — "remove from committee" is not "delete person".
--
-- `committee_section_id … on delete set null` for the same reason a section is
-- not a person's employer: deleting a grouping must leave the seats standing
-- (unsectioned, still published), never delete them.
--
-- `is_published` DEFAULTS TO FALSE here, where `team_members.is_published`
-- defaults to true. A committee listing is an institutional statement about
-- governance; a seat reaches the public page only when someone deliberately
-- publishes it.
--
-- Rollback:
--   drop view if exists public.committee_members_public;
--   drop table if exists public.committee_members;
--   drop table if exists public.committee_sections;
-- Nothing is destroyed that this migration did not create; `team_members` and
-- `team_sections` are not touched at all.

-- ── 1. Sections ───────────────────────────────────────────────────────────

create table if not exists public.committee_sections (
  id             uuid primary key default gen_random_uuid(),
  name_km        text not null,
  name_en        text not null,
  description_km text,
  description_en text,
  display_order  integer not null default 0,
  -- How the public page composes this group. `leadership` renders the few
  -- office-holders prominently and centred; `grid` is the standard roster.
  -- A CHECK rather than free text: the page has exactly two compositions, and
  -- an unknown value would fall through to an empty section.
  layout_variant text    not null default 'grid'
                         check (layout_variant in ('leadership', 'grid')),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.committee_sections is
  'Governance groupings of the Library Committee (leadership, teaching members, library officers…). Admin-managed; the public page never hard-codes a section name.';
comment on column public.committee_sections.layout_variant is
  'Public composition for this group: leadership (prominent, centred) or grid (standard roster).';

drop trigger if exists committee_sections_updated_at on public.committee_sections;
create trigger committee_sections_updated_at
  before update on public.committee_sections
  for each row execute function public.touch_updated_at();

-- ── 2. Seats ──────────────────────────────────────────────────────────────

create table if not exists public.committee_members (
  id                   uuid primary key default gen_random_uuid(),
  team_member_id       uuid not null
                         references public.team_members(id) on delete cascade,
  committee_section_id uuid
                         references public.committee_sections(id) on delete set null,
  role_km              text,
  role_en              text,
  responsibility_km    text,
  responsibility_en    text,
  display_order        integer not null default 0,
  is_published         boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.committee_members is
  'A seat on the Library Committee: the relationship between a canonical team_members person and the committee. Holds committee facts only — the name, portrait, education, bio and slug all stay on team_members.';
comment on column public.committee_members.team_member_id is
  'The canonical person. ON DELETE CASCADE: deleting the person retires the seat. The reverse never happens — deleting this row reaches no parent.';
comment on column public.committee_members.is_published is
  'Governs the public committee page only. Independent of team_members.is_published, which governs /about/team.';

-- One body, one seat per person, one role.
create unique index if not exists committee_members_team_member_key
  on public.committee_members (team_member_id);

-- The public page reads section-by-section in display order.
create index if not exists committee_members_section_order_idx
  on public.committee_members (committee_section_id, display_order);

drop trigger if exists committee_members_updated_at on public.committee_members;
create trigger committee_members_updated_at
  before update on public.committee_members
  for each row execute function public.touch_updated_at();

-- ── 3. RLS + grants ───────────────────────────────────────────────────────
--
-- Both tables are admin-managed and read server-side through the service
-- client (the same path /about/team already takes — lib/team/data.ts). RLS is
-- enabled with no policy for anon/authenticated, and the Data API privileges
-- are revoked explicitly, so PostgREST exposes neither table even though every
-- public-schema table is auto-exposed on this project.

alter table public.committee_sections enable row level security;
alter table public.committee_members  enable row level security;

revoke all on public.committee_sections from public, anon, authenticated;
revoke all on public.committee_members  from public, anon, authenticated;

grant all on public.committee_sections to service_role;
grant all on public.committee_members  to service_role;

-- ── 4. The public read model ──────────────────────────────────────────────
--
-- The ONLY shape the public page reads. It enumerates a fixed safe column
-- list, bakes in both publish rules, and carries NO contact detail at all:
-- phone, email, the linked account and the full bio are absent by
-- construction, so the committee page cannot leak one even by a careless
-- select. A reader who wants more is sent to the staff profile page, which
-- already enforces the per-member privacy toggles.
--
-- `slug` is exposed only when the PERSON is published on /about/team. The
-- profile link is the one place the two surfaces meet, and a slug for an
-- unpublished member is a link the middleware slug gate answers with a 404 —
-- so the view withholds the slug rather than leaving the page to remember.
drop view if exists public.committee_members_public;
create view public.committee_members_public as
  select
    cm.id,
    cm.team_member_id,
    cm.role_km,
    cm.role_en,
    cm.responsibility_km,
    cm.responsibility_en,
    cm.display_order,
    cm.updated_at,
    -- Canonical person fields — read, never copied.
    case when tm.is_published then tm.slug end as slug,
    tm.name_km,
    tm.name_en,
    tm.position_km,
    tm.position_en,
    tm.education,
    tm.photo_url,
    tm.photo_alt,
    tm.short_bio_km,
    tm.short_bio_en,
    -- Section.
    cm.committee_section_id                as section_id,
    cs.name_km                             as section_name_km,
    cs.name_en                             as section_name_en,
    cs.description_km                      as section_description_km,
    cs.description_en                      as section_description_en,
    cs.display_order                       as section_order,
    cs.layout_variant                      as section_layout_variant
  from public.committee_members cm
  join public.team_members            tm on tm.id = cm.team_member_id
  left join public.committee_sections cs on cs.id = cm.committee_section_id
  where cm.is_published = true
    and (cm.committee_section_id is null or cs.is_active);

comment on view public.committee_members_public is
  'Public API surface for /about/committee. Fixed safe column list: committee facts plus the canonical person''s public identity. No phone, email, account link or full bio. The profile slug appears only for a member published on /about/team, so the page can never advertise a URL the slug gate 404s.';

revoke all on public.committee_members_public from public, anon, authenticated;
grant select on public.committee_members_public to service_role;
