-- 0116 — expose team_members.updated_at on the public view.
--
-- WHY: /about/team/<slug> shows a "Last updated" line so a reader can tell how
-- current a staff profile is. The column has existed on public.team_members
-- since the initial schema (with the team_members_updated_at touch trigger),
-- but team_members_public — the privacy-enforcing view both public team pages
-- read — never selected it, so the app had no way to reach it. app/sitemap.ts
-- also falls back to created_at for <lastmod> on every profile URL for the
-- same reason, which reports every profile as never edited.
--
-- This is purely additive: one more column on a view whose column list is
-- deliberately fixed. It does NOT widen the privacy surface — updated_at is a
-- row timestamp, not personal data, and the phone/email display toggles are
-- untouched.
--
-- Deploy window (same shape as 0115): the running app selects a column list
-- without `updated_at`, which keeps working against the new view. The new app
-- asks for `updated_at` first and retries without it if the migration has not
-- landed yet (lib/team/data.ts), so the two orderings are both safe.

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
    tm.updated_at,
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
  'Public API surface for /about/team and /about/team/<slug>. SECURITY DEFINER by design: exposes a fixed safe column list and enforces publish/privacy rules itself. is_published is constant-true here; it exists for the edge slug gate''s filter. updated_at (0116) backs the profile "Last updated" line and sitemap <lastmod>.';

revoke all on public.team_members_public from public;
grant select on public.team_members_public to anon, authenticated, service_role;
