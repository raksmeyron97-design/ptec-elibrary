-- 0172_subjects_follow_categories.sql
--
-- Keep the canonical `subjects` rows (0107/0146) in step with the `categories`
-- they shadow (SEO audit 2026-10, WI-2 / P1-5).
--
-- 0146 re-synced `subjects` from `categories` once. Since then a category was
-- renamed in the admin (the science hub, from វិទ្យាសាស្ត្រ to the misspelled
-- វិទ្យសាស្ត្រ — `updateCategory` rewrote its slug too), and its subject row
-- kept the old label and slug: the same drift 0146 was written to repair,
-- recurring, because nothing maintains the copy.
--
--   1. The 0146 step-1 re-sync, verbatim and idempotent: every subject takes
--      the slug and label of the category it points at.
--   2. A trigger that does the same for ONE row on every later rename. With
--      it, the order of this migration and the librarian's rename back to
--      វិទ្យាសាស្ត្រ stops mattering (correction C8 to the Gate 5 plan, whose
--      one-off re-sync gave a different result depending on which ran first).
--
-- `categories` stays the app's read source; nothing here changes what a page
-- shows. A plain AFTER UPDATE trigger with a WHEN clause (no column list), as
-- in 0170.
--
-- Rollback: drop trigger categories_sync_subject on public.categories;
--           drop function public.sync_subject_from_category();
-- (The re-sync in step 1 only corrects a shadow copy; there is nothing to undo.)

set local lock_timeout = '10s';

-- ── 1. Re-sync (0146 step 1) ────────────────────────────────────────────────
update public.subjects s
   set slug       = c.slug,
       name_en    = c.name,
       name_km    = case when c.name ~ '[ក-៿]' then c.name else s.name_km end,
       updated_at = timezone('utc'::text, now())
  from public.categories c
 where s.legacy_category_id = c.id
   and (s.slug is distinct from c.slug
     or s.name_en is distinct from c.name
     or s.name_km is distinct from case when c.name ~ '[ក-៿]' then c.name else s.name_km end);

-- ── 2. …and on every rename from now on ────────────────────────────────────
create or replace function public.sync_subject_from_category() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.subjects s
     set slug       = new.slug,
         name_en    = new.name,
         name_km    = case when new.name ~ '[ក-៿]' then new.name else s.name_km end,
         updated_at = timezone('utc'::text, now())
   where s.legacy_category_id = new.id;
  return null;
end $$;

drop trigger if exists categories_sync_subject on public.categories;
create trigger categories_sync_subject after update on public.categories
  for each row
  when (old.name is distinct from new.name or old.slug is distinct from new.slug)
  execute function public.sync_subject_from_category();
