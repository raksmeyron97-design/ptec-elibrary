-- ══════════════════════════════════════════════════════════════════════════
--  Migration 0038 — Library Team
--  Tables: team_sections, team_members
--  Design:
--    • team_sections  — the organisational groups (e.g. General Management)
--    • team_members   — individual staff; email comes from profiles via user_id
--                       so no standalone email column is needed
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. team_sections ────────────────────────────────────────────────────
create table if not exists public.team_sections (
  id            uuid primary key default gen_random_uuid(),
  name_km       text not null,
  name_en       text not null,
  description_km text,
  description_en text,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.team_sections enable row level security;

-- Public can read all sections
create policy "team_sections_public_read"
  on public.team_sections for select using (true);

-- Seed: PTEC Library organisational sections
insert into public.team_sections (name_km, name_en, description_km, description_en, display_order) values
  ('គ្រប់គ្រងទូទៅ',          'General Management',       'ក្រុមដឹកនាំ និងគ្រប់គ្រងបណ្ណាល័យ',                   'Library leadership and overall management',             1),
  ('ភារកិច្ច',               'Administration',           'ការរៀបចំរដ្ឋបាល ឯកសារ និងការទំនាក់ទំនង',              'Administrative operations, documentation and communication', 2),
  ('បណ្ណាល័យអេឡិចត្រូនិក',  'E-Library & Digital',      'គ្រប់គ្រងធនធានឌីជីថល ប្រព័ន្ធ E-Library',              'Digital resource management and E-Library platform',    3),
  ('ការចាត់ថ្នាក់ & ភ្ជាប់',  'Cataloging & Processing',  'ចំណាត់ថ្នាក់ DDC ការចុះបញ្ជី និងការរៀបចំឯកសារ',       'DDC classification, registration and document processing', 4),
  ('ការផ្តល់សេវា',           'Reader Services',          'ខ្ចី-សង ជំនួយការស្រាវជ្រាវ និងការបម្រើអ្នកអាន',       'Circulation, research assistance and patron services',  5),
  ('ការស្រាវជ្រាវវិទ្យា',    'Research Support',         'គាំទ្រការស្រាវជ្រាវ PTEC Library Press',               'Supporting PTEC research and Library Press publications', 6)
on conflict do nothing;

-- ── 2. team_members ─────────────────────────────────────────────────────
create table if not exists public.team_members (
  id               uuid primary key default gen_random_uuid(),

  -- Link to auth account (email is read from profiles.email at query time)
  user_id          uuid references public.profiles(id) on delete set null,

  -- Organisational section
  section_id       uuid references public.team_sections(id) on delete set null,

  -- Names (bilingual)
  name_km          text not null,
  name_en          text not null,

  -- Position / title (bilingual)
  position_km      text,
  position_en      text,

  -- Qualifications
  education        text,
  years_experience text,

  -- Contact (phone only; email comes from user_id → profiles.email)
  phone            text,

  -- Bio (bilingual)
  bio_km           text,
  bio_en           text,

  -- Profile photo stored in Cloudflare R2 public bucket
  photo_url        text,

  display_order    integer not null default 0,
  is_published     boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.team_members enable row level security;

-- Public can read published members
create policy "team_members_public_read"
  on public.team_members for select
  using (is_published = true);

-- Admins can read all members (including drafts)
create policy "team_members_admin_read"
  on public.team_members for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ── 3. updated_at trigger ────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger team_members_updated_at
  before update on public.team_members
  for each row execute function public.touch_updated_at();

-- ── 4. Helpful view: members with section name + profile email ──────────
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
