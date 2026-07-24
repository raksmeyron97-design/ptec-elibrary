-- 0111_learning_paths_curriculum.sql
-- Grows Learning Paths from a simple published/unpublished collection into a
-- managed curriculum: a real status lifecycle (draft → published → scheduled →
-- archived), a manually-featured path, difficulty / subject / language facets,
-- bilingual learning outcomes + prerequisites, tags, SEO fields, per-module
-- descriptions and per-step required/optional flags.
--
-- BACK-COMPAT: `learning_paths.is_published` is kept and mirrored from `status`
-- by a trigger, so every existing read (getPublishedPaths, the RLS policies on
-- modules/steps, ThisWeekAtPtec, search) keeps working unchanged. New code
-- reads `status`; nothing had to change its `is_published` predicate, and the
-- public RLS policy — "is_published = true" — remains exactly correct because
-- is_published === (status = 'published') at all times.
--
-- Everything here is additive (ADD COLUMN IF NOT EXISTS / CREATE ... IF NOT
-- EXISTS) so it re-applies cleanly on top of the hosted schema.

-- ── Status enum ──────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace and typname = 'learning_path_status'
  ) then
    create type public.learning_path_status as enum ('draft', 'published', 'scheduled', 'archived');
  end if;
end $$;

-- ── learning_paths: lifecycle, facets, metadata ─────────────────────────────
alter table public.learning_paths
  add column if not exists status            public.learning_path_status not null default 'draft',
  add column if not exists featured          boolean     not null default false,
  add column if not exists difficulty        text,        -- 'beginner' | 'intermediate' | 'advanced'
  add column if not exists subject           text,        -- free-text category/subject tag
  add column if not exists language          text,        -- 'en' | 'km' | 'both'
  add column if not exists estimated_minutes integer,     -- manual override; UI derives from steps when null
  add column if not exists outcomes          jsonb       not null default '[]'::jsonb,  -- [{ en, km }]
  add column if not exists prerequisites     jsonb       not null default '[]'::jsonb,  -- [{ en, km }]
  add column if not exists tags              text[]      not null default '{}',
  add column if not exists seo_title         text,
  add column if not exists seo_description   text,
  add column if not exists og_image_url      text,
  add column if not exists updated_by        uuid        references public.profiles(id) on delete set null,
  add column if not exists published_at      timestamptz,
  add column if not exists scheduled_at      timestamptz,
  add column if not exists archived_at       timestamptz;

alter table public.learning_paths
  drop constraint if exists learning_paths_difficulty_chk;
alter table public.learning_paths
  add constraint learning_paths_difficulty_chk
  check (difficulty is null or difficulty in ('beginner', 'intermediate', 'advanced'));

alter table public.learning_paths
  drop constraint if exists learning_paths_language_chk;
alter table public.learning_paths
  add constraint learning_paths_language_chk
  check (language is null or language in ('en', 'km', 'both'));

alter table public.learning_paths
  drop constraint if exists learning_paths_estimated_minutes_chk;
alter table public.learning_paths
  add constraint learning_paths_estimated_minutes_chk
  check (estimated_minutes is null or estimated_minutes >= 0);

-- Backfill the lifecycle from the legacy boolean (idempotent: only touches rows
-- still at the default 'draft').
update public.learning_paths
set status = 'published',
    published_at = coalesce(published_at, updated_at, now())
where is_published = true and status = 'draft';

-- ── Keep is_published mirrored from status + stamp lifecycle timestamps ──────
create or replace function public.sync_learning_path_status()
returns trigger language plpgsql as $$
begin
  new.is_published := (new.status = 'published');

  -- First time a path becomes published, record when.
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  -- Stamp / clear the archive timestamp as the path enters or leaves 'archived'.
  if new.status = 'archived' and new.archived_at is null then
    new.archived_at := now();
  elsif new.status <> 'archived' then
    new.archived_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_learning_paths_sync_status on public.learning_paths;
create trigger trg_learning_paths_sync_status
  before insert or update on public.learning_paths
  for each row execute function public.sync_learning_path_status();

-- ── Modules: bilingual description ──────────────────────────────────────────
alter table public.learning_path_modules
  add column if not exists description    text,
  add column if not exists description_km text;

-- ── Steps: required vs optional ─────────────────────────────────────────────
alter table public.learning_path_steps
  add column if not exists is_required boolean not null default true;

-- Publications become a valid step resource type alongside book/research/catalog.
alter table public.learning_path_steps
  drop constraint if exists learning_path_steps_resource_type_check;
alter table public.learning_path_steps
  add constraint learning_path_steps_resource_type_check
  check (resource_type in ('book', 'research', 'catalog', 'publication', 'external'));

-- ── Indexes for listing / filtering ─────────────────────────────────────────
create index if not exists learning_paths_status_position_idx
  on public.learning_paths (status, position);
-- One featured published path is the common lookup; keep it a tiny partial index.
create index if not exists learning_paths_featured_idx
  on public.learning_paths (featured)
  where featured and status = 'published';
create index if not exists learning_paths_audience_idx
  on public.learning_paths (audience) where audience is not null;
create index if not exists learning_paths_subject_idx
  on public.learning_paths (subject) where subject is not null;

-- ── Transaction-safe curriculum replacement ─────────────────────────────────
-- savePath replaces a path's whole module/step tree. Doing that as separate
-- delete + insert statements from the app is not atomic: a mid-way failure
-- would leave the path with a half-written curriculum. This function performs
-- the delete-and-reinsert inside a single (implicitly transactional) call, so
-- the curriculum either updates completely or not at all. SECURITY DEFINER +
-- an is_librarian() gate means only staff can invoke it even though it is
-- callable by authenticated (RLS on the underlying tables still applies to
-- everyone else).
create or replace function public.replace_learning_path_curriculum(
  p_path_id uuid,
  p_modules jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m            jsonb;
  s            jsonb;
  v_module_id  uuid;
  m_idx        int := 0;
  s_idx        int := 0;
begin
  if not public.is_librarian() then
    raise exception 'not authorized';
  end if;

  delete from public.learning_path_modules where path_id = p_path_id;

  for m in select * from jsonb_array_elements(coalesce(p_modules, '[]'::jsonb))
  loop
    insert into public.learning_path_modules (path_id, title, title_km, description, description_km, position)
    values (
      p_path_id,
      m->>'title',
      nullif(m->>'title_km', ''),
      nullif(m->>'description', ''),
      nullif(m->>'description_km', ''),
      m_idx
    )
    returning id into v_module_id;

    s_idx := 0;
    for s in select * from jsonb_array_elements(coalesce(m->'steps', '[]'::jsonb))
    loop
      insert into public.learning_path_steps (
        module_id, resource_type, resource_id, resource_title, external_url,
        instruction, instruction_km, est_minutes, is_required, position
      )
      values (
        v_module_id,
        s->>'resource_type',
        case when (s->>'resource_id') is null or (s->>'resource_id') = '' then null else (s->>'resource_id')::uuid end,
        nullif(s->>'resource_title', ''),
        nullif(s->>'external_url', ''),
        nullif(s->>'instruction', ''),
        nullif(s->>'instruction_km', ''),
        case when (s->>'est_minutes') is null or (s->>'est_minutes') = '' then null else (s->>'est_minutes')::int end,
        coalesce((s->>'is_required')::boolean, true),
        s_idx
      );
      s_idx := s_idx + 1;
    end loop;

    m_idx := m_idx + 1;
  end loop;
end;
$$;

revoke all on function public.replace_learning_path_curriculum(uuid, jsonb) from public, anon;
grant execute on function public.replace_learning_path_curriculum(uuid, jsonb) to authenticated, service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- No policy changes are needed: the public policies key off is_published, which
-- the trigger keeps equal to (status = 'published'). Scheduled/draft/archived
-- paths therefore never leak. Librarian full-access policies are unchanged.
