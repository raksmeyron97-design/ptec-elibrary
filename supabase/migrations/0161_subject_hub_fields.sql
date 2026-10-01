-- 0161_subject_hub_fields.sql
--
-- A subject hub that can be a landing page (SEO programme Phase 2.1, decision
-- D14; docs/seo/AUDIT-VERIFICATION.md F2).
--
-- `categories` has a single `name` column, and every category in this library
-- is named in Khmer, so an English subject page was titled "គណិតវិទ្យា · PTEC
-- Library" and described by counts alone. These columns let a librarian give a
-- subject an English name and a short introduction in each language:
--
--   name_en        The subject's English name. `name` stays the Khmer name
--                  (it is the name_km the programme asks for, and the one
--                  every existing reader and the slug already use). Empty
--                  means "no English name approved": English pages then show
--                  the Khmer name, never a guessed translation.
--   intro_en,      An 80–150-word introduction per language, written or
--   intro_km       approved by a librarian. Drafts never live here: they are
--                  proposed in content/drafts/subject-intros.json and imported
--                  only once approved (scripts/seo-import-subject-intros.ts).
--   intro_status   'draft' | 'approved'. The page shows an intro only when
--                  'approved', so a half-finished text can be stored safely.
--
-- Additive and nullable (intro_status has a default): every existing reader,
-- writer and the e2e seed keep working untouched. No new table, so the
-- existing `categories` RLS policy and the 0117 anon/authenticated grant
-- govern the new columns — they are public copy, like `name`.

-- Give up rather than queue. On the box each migration runs in ONE
-- transaction (infra/supabase/scripts/migrate.sh), so this lasts exactly as
-- long as this file. Under load, an ALTER waiting for its lock makes every
-- read of the table wait behind it; failing after 10 s instead aborts the
-- deploy cleanly (the old image keeps serving) and the next deploy tick
-- retries. Outside a transaction it is a warning and changes nothing.
set local lock_timeout = '10s';

alter table public.categories
  add column if not exists name_en text,
  add column if not exists intro_en text,
  add column if not exists intro_km text,
  add column if not exists intro_status text not null default 'draft';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_intro_status_check'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_intro_status_check
      check (intro_status in ('draft', 'approved'));
  end if;
end $$;

comment on column public.categories.name_en is
  'English subject name, approved by a librarian. Empty: English pages show the Khmer name.';
comment on column public.categories.intro_en is
  'English subject introduction (80–150 words). Shown only when intro_status = approved.';
comment on column public.categories.intro_km is
  'Khmer subject introduction (80–150 words). Shown only when intro_status = approved.';
comment on column public.categories.intro_status is
  'draft | approved. Imported from content/drafts/subject-intros.json once approved.';
