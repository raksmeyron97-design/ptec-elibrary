-- 0076_thesis_form_upgrade.sql
-- Admin Theses CMS rebuild (Phase 2): upload/edit wizard fields + autosave
-- storage. Purely additive — no existing column is renamed or removed, and
-- every new column is nullable/defaulted so pre-migration rows keep working.

alter table public.research_reports
  add column if not exists thesis_type text
    check (thesis_type is null or thesis_type in ('thesis', 'research_report', 'capstone', 'action_research', 'other')),
  add column if not exists language text
    check (language is null or language in ('km', 'en', 'km_en')),
  add column if not exists co_advisor_name text,
  add column if not exists defense_date date,
  add column if not exists submitted_date date,
  add column if not exists cover_alt_text text,
  add column if not exists supplementary_files jsonb not null default '[]',
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists og_image text;

comment on column public.research_reports.supplementary_files is
  'Array of {url, filename, mimeType, size, description} — lightweight multi-file support chosen over a relational ThesisFile table (see the Phase 1 roadmap''s non-breaking-enhancement decision).';

-- ── Autosave storage ─────────────────────────────────────────────────────────
-- Same pattern as post_drafts (0074_post_drafts.sql) and for the same reason:
-- autosave must never write to the live research_reports row directly, or a
-- half-typed sentence on a published thesis would go live the instant the
-- debounce fires. Drafts here are only merged into the real row when the
-- admin explicitly submits the form.
create table if not exists public.thesis_drafts (
  id uuid primary key default gen_random_uuid(),
  -- Existing thesis being edited. Null while drafting a brand-new thesis
  -- that hasn't been created yet.
  thesis_id uuid references public.research_reports(id) on delete cascade,
  -- Client-generated key (crypto.randomUUID(), persisted in sessionStorage)
  -- used to autosave a new thesis before it has a real id.
  draft_key text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  constraint thesis_drafts_has_target check (thesis_id is not null or draft_key is not null)
);

create unique index if not exists idx_thesis_drafts_user_thesis
  on public.thesis_drafts (user_id, thesis_id) where thesis_id is not null;
create unique index if not exists idx_thesis_drafts_user_key
  on public.thesis_drafts (user_id, draft_key) where draft_key is not null;

create or replace function public.thesis_drafts_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_thesis_drafts_updated_at on public.thesis_drafts;
create trigger trg_thesis_drafts_updated_at
  before update on public.thesis_drafts
  for each row execute function public.thesis_drafts_set_updated_at();

alter table public.thesis_drafts enable row level security;

-- All access goes through requirePermission("research", ...)-guarded Server
-- Actions using the service-role client — RLS here is a defense-in-depth
-- backstop, not the primary gate (same posture as post_drafts).
create policy "Admins can manage thesis drafts" on public.thesis_drafts
  for all using (public.is_admin());
