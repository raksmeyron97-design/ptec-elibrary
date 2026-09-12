-- 0143_subject_slug_cleanup_tenth.sql
--
-- The TENTH generated `book-<epoch>` category slug, which 0142 did not cover.
--
-- WHY THERE IS A TENTH
-- ────────────────────
-- 0142 migrated the nine timestamp slugs that existed when it was written.
-- `កញ្ជប់គណិតវិទ្យា` carries `book-1781239299098` — a timestamp minted ~1,176
-- seconds after the latest of those nine, i.e. a category created after that
-- set was enumerated but still before slugify() stopped falling back to
-- `book-${Date.now()}` for Khmer. It was therefore invisible to 0142 and has
-- been live, indexed and self-canonical ever since.
--
-- Measured on production 2026-09-12: /subjects/book-1781239299098 returns 200
-- with `index, follow`, titled កញ្ជប់គណិតវិទ្យា, holding 18 resources. It is
-- not a thin page — the URL is the defect, so it is renamed and 301'd rather
-- than removed. See docs/SEO-3.0-AUDIT.md F-4.
--
-- THE TARGET IS FREE
-- ──────────────────
-- /subjects/កញ្ជប់គណិតវិទ្យា appeared to answer 200 before this change, which
-- would have meant a collision. It did not: that 200 was the `/subjects` soft
-- 404 (F-6 in the same audit — every unknown subject slug answered 200 because
-- the route had no middleware gate), and the body was "Nothing here yet" with
-- `noindex`. The slug is unheld. The collision check below is kept regardless:
-- it is what proves that claim at apply time rather than trusting this note.
--
-- Everything else — why the target is literal rather than computed in SQL, why
-- a slug change cannot move a book, and the safety properties — is unchanged
-- from 0142; read that file's header for the reasoning.
--
-- Applied on the ZimaOS box by infra/supabase/scripts/migrate.sh during deploy
-- (migrate.yml is in self-hosted mode and does not reach production).
--
-- Pre-flight against the live table:  npx tsx scripts/audit-subject-slugs.ts

do $$
declare
  pair   record;
  cat_id uuid;
  cat_nm text;
  holder uuid;
  renamed int := 0;
  skipped int := 0;
begin
  for pair in
    select * from (values
      ('book-1781239299098', 'កញ្ជប់គណិតវិទ្យា', 'កញ្ជប់គណិតវិទ្យា')
    ) as t(old_slug, new_slug, expected_name)
  loop
    select id, name into cat_id, cat_nm
      from public.categories
     where slug = pair.old_slug;

    -- Already migrated, or a database that never had this row (seed, e2e).
    if cat_id is null then
      skipped := skipped + 1;
      continue;
    end if;

    -- The target must be free. UNIQUE would reject it anyway; this turns a
    -- constraint violation into a sentence naming both categories.
    select id into holder
      from public.categories
     where slug = pair.new_slug and id <> cat_id;

    if holder is not null then
      raise exception
        'subject slug collision: % (%) cannot take slug "%" — already held by category %. '
        'Resolve by hand, then re-run. next.config.ts 301s to this slug, so leaving it '
        'unmigrated would redirect an indexed URL into a 404.',
        cat_nm, pair.old_slug, pair.new_slug, holder;
    end if;

    -- Name drift is reported, never fatal: the redirect target is fixed in
    -- next.config.ts, so the column must match it regardless of a rename.
    if cat_nm is distinct from pair.expected_name then
      raise notice
        'subject % renamed since this migration was written (expected "%", found "%") — '
        'slug still set to "%" to match next.config.ts',
        pair.old_slug, pair.expected_name, cat_nm, pair.new_slug;
    end if;

    update public.categories set slug = pair.new_slug where id = cat_id;
    renamed := renamed + 1;
  end loop;

  raise notice 'subject slug cleanup (tenth): % renamed, % already clean or absent', renamed, skipped;
end $$;
