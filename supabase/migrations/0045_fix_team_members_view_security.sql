-- Fix: team_members_with_email was created as SECURITY DEFINER (Postgres default),
-- which runs with the view creator's privileges and bypasses RLS.
-- Recreate with security_invoker = true so the querying user's RLS policies apply.

create or replace view public.team_members_with_email
  with (security_invoker = true)
as
  select
    tm.*,
    p.email              as user_email,
    p.full_name          as user_full_name,
    ts.name_km           as section_name_km,
    ts.name_en           as section_name_en,
    ts.display_order     as section_order
  from public.team_members tm
  left join public.profiles      p  on p.id  = tm.user_id
  left join public.team_sections ts on ts.id = tm.section_id;
