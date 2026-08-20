-- ══════════════════════════════════════════════════════════════════════════
--  Migration 0115 — Team member profile slugs
--
--  The Library Team redesign gives every published member a full profile page
--  at /about/team/<slug>. That needs:
--
--  1. team_members.slug — nullable text, unique where present. Backfilled
--     from name_en (ASCII slug), falling back to a short id-derived handle
--     for names with no Latin content. New rows get their slug from the
--     admin create action; the DB only guarantees uniqueness.
--  2. team_members_with_email recreated — it selects tm.*, and a view's
--     column list is frozen at creation, so it must be recreated to see the
--     new column.
--  3. team_members_public recreated with `slug` AND `is_published` exposed.
--     is_published is constant-true inside this view (the WHERE bakes it in);
--     it is exposed anyway because the edge slug gate
--     (lib/resource-slug-gate.ts) filters `?<publishedColumn>=eq.true` with
--     the ANON key, and anon reads of the base table were closed in 0071 —
--     the view is the only surface the gate can query.
--
--  Fully additive and safe to apply while the previous app version is still
--  deployed: the old app never selects `slug`, and the new app retries its
--  reads/writes without the column until this migration lands (same pattern
--  as 0070).
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Column + uniqueness ────────────────────────────────────────────────
alter table public.team_members
  add column if not exists slug text;

-- Backfill existing rows: ASCII slug from the Latin name; a name without
-- usable Latin content falls back to a stable id-derived handle. Collisions
-- get a numeric suffix. Runs only for rows that still have no slug, so
-- re-applying is a no-op.
do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  for r in
    select id, name_en
      from public.team_members
     where slug is null
     order by created_at
  loop
    base := trim(both '-' from regexp_replace(lower(coalesce(r.name_en, '')), '[^a-z0-9]+', '-', 'g'));
    if base is null or base = '' then
      base := 'member-' || left(r.id::text, 8);
    end if;
    candidate := base;
    n := 2;
    while exists (
      select 1 from public.team_members where slug = candidate and id <> r.id
    ) loop
      candidate := base || '-' || n;
      n := n + 1;
    end loop;
    update public.team_members set slug = candidate where id = r.id;
  end loop;
end $$;

create unique index if not exists team_members_slug_key
  on public.team_members (slug)
  where slug is not null;

-- ── 2. Recreate admin view so tm.* includes the new column ────────────────
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

-- ── 3. Recreate the public view with slug + is_published ──────────────────
drop view if exists public.team_members_public;
create view public.team_members_public as
  select
    tm.id,
    tm.slug,
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
    tm.is_published,
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
  'Public API surface for /about/team and /about/team/<slug>. SECURITY DEFINER by design: exposes a fixed safe column list and enforces publish/privacy rules itself. is_published is constant-true here; it exists for the edge slug gate''s filter.';

revoke all on public.team_members_public from public;
grant select on public.team_members_public to anon, authenticated, service_role;
