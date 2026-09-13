-- 0146_subjects_canonical_backfill.sql
--
-- Fills the canonical topic graph (0107) from the legacy `categories` table and
-- `books.category_id`, gives it the hierarchy the co-occurrence evidence
-- supports, and records the three PISA books under the programme they name.
--
-- Idempotent: safe to re-run. Additive only — no legacy row is altered, and
-- `categories` remains the app's read source until a later phase moves it.
--
-- ── What production actually held before this ───────────────────────────────
--
-- `resource_subjects`: 0 rows. `subjects`: 12 rows for 25 categories, every one
-- of them with `parent_id` NULL and `name_km` NULL. The 0107 backfill ran once,
-- covered half the taxonomy and then drifted:
--
--   * 9 of 12 slugs are retired `book-<epoch>` strings. Migrations 0142/0143
--     rewrote those to Khmer in `categories` and never touched `subjects`, so
--     the canonical table still carries the slugs the redirects retired.
--   * `name_en` holds a KHMER string on all 12 rows, and `name_km` is NULL —
--     the two columns are being used the wrong way round.
--   * One name drifted outright: the subject reads ស្រាវជ្រាវសកម្មភាព while the
--     category it points at was renamed ស្រាវជ្រាវប្រតិបត្តិ.
--
-- Nothing in the application reads either table yet, which is why none of this
-- was visible. That also makes this backfill safe: it corrects a shadow copy.
--
-- ── What this deliberately does NOT invent ──────────────────────────────────
--
-- `name_en` is NOT NULL and no English name exists anywhere in this schema —
-- `categories` has a single Khmer `name` column. So `name_km` is filled with
-- the Khmer name (which is the truth about it) and `name_en` keeps the only
-- name the library holds. Translating 25 subject labels would be new metadata
-- invented by a migration, and it is a librarian's decision, not this file's.

DO $$
DECLARE
  v_updated   integer := 0;
  v_inserted  integer := 0;
  v_parented  integer := 0;
  v_edges     integer := 0;
  v_pisa      integer := 0;
  v_orphans   integer := 0;
  v_missing   text[]  := '{}';
  v_parent_id uuid;
  v_child_id  uuid;

  -- The hierarchy from docs/SEO-3.3-TOPIC-AUTHORITY-AUDIT.md §10.1, each pair
  -- carrying its measured shared-tag count. This is evidence, not taxonomy
  -- taste: every pair below is one of the strongest co-occurrences in the
  -- collection. The strongest pair overall (គណិតវិទ្យា ⇄ គរុកោសល្យ, 18) is
  -- deliberately ABSENT — "maths is taught" is a cross-link, not containment,
  -- and encoding it as parentage would assert that pedagogy contains
  -- mathematics.
  c_tree constant text[][] := ARRAY[
    ['ស្រាវជ្រាវបែបគុណភាព',        'ស្រាវជ្រាវ'],    -- 12 shared tags
    ['ស្រាវជ្រាវប្រតិបត្តិ',          'ស្រាវជ្រាវ'],    --  9
    ['ស្ថិតិ និងវិភាគទិន្នន័យ',      'ស្រាវជ្រាវ'],    -- 12
    ['គីមីវិទ្យា',                    'វិទ្យាសាស្ត្រ'],  -- 11
    ['ជីវវិទ្យា',                      'វិទ្យាសាស្ត្រ'],  --  8
    ['រូបវិទ្យា',                     'វិទ្យាសាស្ត្រ'],  -- shared grade cluster
    ['កញ្ជប់គណិតវិទ្យា',            'គណិតវិទ្យា']     -- 10
  ];
BEGIN
  -- ── 1. Re-sync the 12 existing rows to the category they point at ─────────
  -- `categories` is the source of truth for a subject's LABEL and SLUG today;
  -- these rows are a copy that stopped being maintained.
  UPDATE public.subjects s
     SET slug       = c.slug,
         name_en    = c.name,
         name_km    = CASE WHEN c.name ~ '[ក-៿]' THEN c.name ELSE s.name_km END,
         updated_at = timezone('utc'::text, now())
    FROM public.categories c
   WHERE s.legacy_category_id = c.id
     AND (s.slug IS DISTINCT FROM c.slug
       OR s.name_en IS DISTINCT FROM c.name
       OR s.name_km IS DISTINCT FROM CASE WHEN c.name ~ '[ក-៿]' THEN c.name ELSE s.name_km END);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- ── 2. One subject per category ───────────────────────────────────────────
  -- Runs AFTER the re-sync: an insert first would collide on
  -- UNIQUE (organization_id, slug) with a stale row holding the same slug.
  INSERT INTO public.subjects (name_en, name_km, slug, legacy_category_id, status)
  SELECT c.name,
         CASE WHEN c.name ~ '[ក-៿]' THEN c.name ELSE NULL END,
         c.slug,
         c.id,
         'active'
    FROM public.categories c
   WHERE NOT EXISTS (
           SELECT 1 FROM public.subjects s WHERE s.legacy_category_id = c.id
         )
     AND c.slug IS NOT NULL
     AND c.name IS NOT NULL;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- ── 3. The hierarchy ──────────────────────────────────────────────────────
  FOR i IN 1 .. array_length(c_tree, 1) LOOP
    SELECT s.id INTO v_child_id
      FROM public.subjects s
      JOIN public.categories c ON c.id = s.legacy_category_id
     WHERE c.name = c_tree[i][1];

    SELECT s.id INTO v_parent_id
      FROM public.subjects s
      JOIN public.categories c ON c.id = s.legacy_category_id
     WHERE c.name = c_tree[i][2];

    -- A name that does not resolve is REPORTED, never guessed at and never
    -- fatal: a category renamed after this file was written must not block a
    -- deploy, and a silently skipped parent must not look like success.
    IF v_child_id IS NULL OR v_parent_id IS NULL THEN
      v_missing := v_missing || (c_tree[i][1] || ' → ' || c_tree[i][2]);
      CONTINUE;
    END IF;

    -- Self-parenting would be a cycle the ON DELETE SET NULL cannot untangle.
    IF v_child_id = v_parent_id THEN
      v_missing := v_missing || ('SELF-PARENT REFUSED: ' || c_tree[i][1]);
      CONTINUE;
    END IF;

    UPDATE public.subjects
       SET parent_id = v_parent_id, updated_at = timezone('utc'::text, now())
     WHERE id = v_child_id
       AND parent_id IS DISTINCT FROM v_parent_id;
    IF FOUND THEN v_parented := v_parented + 1; END IF;
  END LOOP;

  -- ── 4. One primary edge per book, from its single category FK ─────────────
  -- EVERY book, not only published ones: a subject is a classification fact and
  -- publication is a separate one. Backfilling only published rows would leave
  -- a book with no canonical subject the moment it is published, until someone
  -- remembered to re-run this.
  INSERT INTO public.resource_subjects (resource_type, resource_id, subject_id, is_primary, sequence)
  SELECT 'book', b.id, s.id, true, 0
    FROM public.books b
    JOIN public.subjects s ON s.legacy_category_id = b.category_id
   WHERE b.category_id IS NOT NULL
  ON CONFLICT (resource_type, resource_id, subject_id) DO NOTHING;
  GET DIAGNOSTICS v_edges = ROW_COUNT;

  -- ── 5. PISA — the reason this table exists ────────────────────────────────
  -- `books.category_id` is a SINGLE foreign key, so the three PISA-D books are
  -- filed under ភាសា / វិទ្យាសាស្ត្រ / គណិតវិទ្យា and the PISA shelf reads
  -- empty. Filing them under PISA instead would have DELETED a true
  -- classification to populate a hub that stays below the indexability bar
  -- either way; this table is where a book gets to be both.
  --
  -- The evidence is the title, which names the programme outright — not a
  -- guess from a tag or a subject-matter resemblance. `is_primary = false`
  -- because their primary shelf is unchanged and still correct.
  INSERT INTO public.resource_subjects (resource_type, resource_id, subject_id, is_primary, sequence)
  SELECT 'book', b.id, s.id, false, 1
    FROM public.books b
    CROSS JOIN LATERAL (
      SELECT s2.id
        FROM public.subjects s2
        JOIN public.categories c ON c.id = s2.legacy_category_id
       WHERE c.name = 'កម្មវិធី PISA'
    ) s
   WHERE b.title ILIKE '%PISA%'
  ON CONFLICT (resource_type, resource_id, subject_id) DO NOTHING;
  GET DIAGNOSTICS v_pisa = ROW_COUNT;

  -- ── 6. Report ─────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_orphans
    FROM public.books b
   WHERE b.category_id IS NOT NULL
     AND NOT EXISTS (
           SELECT 1 FROM public.resource_subjects rs
            WHERE rs.resource_type = 'book' AND rs.resource_id = b.id
         );

  RAISE NOTICE '0146: % subject rows re-synced to their category', v_updated;
  RAISE NOTICE '0146: % subject rows created for previously uncovered categories', v_inserted;
  RAISE NOTICE '0146: % parent links set', v_parented;
  RAISE NOTICE '0146: % primary book→subject edges written', v_edges;
  RAISE NOTICE '0146: % PISA secondary edges written', v_pisa;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE NOTICE '0146: % hierarchy pair(s) did NOT resolve and were skipped: %',
      array_length(v_missing, 1), array_to_string(v_missing, '; ');
  END IF;

  -- A book carrying a category but no edge means step 2 failed to cover a
  -- category. Reported, not raised: this migration must not be able to block a
  -- deploy over a taxonomy gap it is describing rather than causing.
  IF v_orphans > 0 THEN
    RAISE NOTICE '0146: % book(s) have a category but no canonical subject edge', v_orphans;
  END IF;
END $$;
