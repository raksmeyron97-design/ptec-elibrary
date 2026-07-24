-- 0108_references_relations.sql
-- Structured academic references + typed cross-resource relations
-- (targeted-consolidation Phase 5 — see docs/CANONICAL-RESOURCES.md).
--
-- The problem this fixes: bibliographic references are stored two ways —
--   * publications     → "references" jsonb  ([{index,text,doi?,url?}])
--   * research_reports → "references" text   (free-text block)
-- so references cannot be ordered, deduplicated, validated or exported
-- consistently, and there is no way to say "publication X cites resource Y".
--
-- This adds `resource_references` (one structured/raw reference per row,
-- preserving order and validation status) and `resource_relations` (typed
-- source→target links between PTEC resources), and BACKFILLS both reference
-- shapes. resource_relations starts empty — the structure is added now so
-- "related"/"cites" can be populated by consumers without another migration.
-- Legacy columns remain the app read source; additive and non-destructive.
--
-- Idempotent: safe to re-run. Additive only.

-- ── 1. resource_references ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_references (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type     text    NOT NULL CHECK (resource_type IN ('book', 'thesis', 'publication', 'learning_path')),
  resource_id       uuid    NOT NULL,
  sequence          integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  reference_type    text    NOT NULL DEFAULT 'unknown',
  raw_text          text,
  title             text,
  publication_title text,
  year              integer,
  volume            text,
  issue             text,
  pages             text,
  doi               text,
  url               text,
  validation_status text    NOT NULL DEFAULT 'unverified'
                            CHECK (validation_status IN ('unverified', 'parsed', 'verified', 'invalid')),
  created_at        timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at        timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (resource_type, resource_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_resource_references_resource
  ON public.resource_references (resource_type, resource_id, sequence);

-- ── 2. resource_relations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_relations (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  source_resource_type text    NOT NULL CHECK (source_resource_type IN ('book', 'thesis', 'publication', 'learning_path')),
  source_resource_id   uuid    NOT NULL,
  target_resource_type text    NOT NULL CHECK (target_resource_type IN ('book', 'thesis', 'publication', 'learning_path')),
  target_resource_id   uuid    NOT NULL,
  relation_type        text    NOT NULL
                               CHECK (relation_type IN ('cites', 'is_cited_by', 'related', 'part_of', 'has_part',
                                                        'previous_version', 'translation_of', 'supplement_to',
                                                        'recommended_after', 'recommended_before')),
  sequence             integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  metadata             jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (source_resource_type, source_resource_id, target_resource_type, target_resource_id, relation_type),
  CHECK (NOT (source_resource_type = target_resource_type AND source_resource_id = target_resource_id))
);
CREATE INDEX IF NOT EXISTS idx_resource_relations_source
  ON public.resource_relations (source_resource_type, source_resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_relations_target
  ON public.resource_relations (target_resource_type, target_resource_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
-- Both public only when the (source) resource is published; admins all.
ALTER TABLE public.resource_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_relations  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view references of published resources" ON public.resource_references;
DROP POLICY IF EXISTS "Admins can manage resource references"             ON public.resource_references;
CREATE POLICY "Public can view references of published resources"
  ON public.resource_references FOR SELECT USING (
    public.is_admin()
    OR (resource_type = 'book'          AND EXISTS (SELECT 1 FROM public.books            b  WHERE b.id  = resource_id AND b.is_published))
    OR (resource_type = 'thesis'        AND EXISTS (SELECT 1 FROM public.research_reports r  WHERE r.id  = resource_id AND r.is_published))
    OR (resource_type = 'publication'   AND EXISTS (SELECT 1 FROM public.publications     p  WHERE p.id  = resource_id AND p.is_published))
    OR (resource_type = 'learning_path' AND EXISTS (SELECT 1 FROM public.learning_paths   lp WHERE lp.id = resource_id AND lp.is_published))
  );
CREATE POLICY "Admins can manage resource references"
  ON public.resource_references FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can view relations of published resources" ON public.resource_relations;
DROP POLICY IF EXISTS "Admins can manage resource relations"             ON public.resource_relations;
CREATE POLICY "Public can view relations of published resources"
  ON public.resource_relations FOR SELECT USING (
    public.is_admin()
    OR (source_resource_type = 'book'          AND EXISTS (SELECT 1 FROM public.books            b  WHERE b.id  = source_resource_id AND b.is_published))
    OR (source_resource_type = 'thesis'        AND EXISTS (SELECT 1 FROM public.research_reports r  WHERE r.id  = source_resource_id AND r.is_published))
    OR (source_resource_type = 'publication'   AND EXISTS (SELECT 1 FROM public.publications     p  WHERE p.id  = source_resource_id AND p.is_published))
    OR (source_resource_type = 'learning_path' AND EXISTS (SELECT 1 FROM public.learning_paths   lp WHERE lp.id = source_resource_id AND lp.is_published))
  );
CREATE POLICY "Admins can manage resource relations"
  ON public.resource_relations FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.resource_references TO anon, authenticated;
GRANT SELECT ON public.resource_relations  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_resource_references_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_resource_references_touch ON public.resource_references;
CREATE TRIGGER trg_resource_references_touch
  BEFORE UPDATE ON public.resource_references
  FOR EACH ROW EXECUTE FUNCTION public.touch_resource_references_updated_at();

-- ── 4. Backfill A — publications."references" jsonb → structured rows ─────────
-- Sequence is the array position (ordinality), so it is collision-free even if
-- the stored "index" values repeat or are missing.
INSERT INTO public.resource_references
  (resource_type, resource_id, sequence, raw_text, doi, url, validation_status)
SELECT 'publication', p.id, (t.ord - 1)::int,
       nullif(btrim(t.elem->>'text'), ''),
       nullif(t.elem->>'doi', ''),
       nullif(t.elem->>'url', ''),
       'parsed'
FROM public.publications p,
     LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(coalesce(p."references", '[]'::jsonb)) = 'array'
            THEN p."references" ELSE '[]'::jsonb END
     ) WITH ORDINALITY AS t(elem, ord)
WHERE coalesce(btrim(t.elem->>'text'), '') <> ''
ON CONFLICT (resource_type, resource_id, sequence) DO NOTHING;

-- ── 5. Backfill B — research_reports."references" free text → one row per line ──
INSERT INTO public.resource_references
  (resource_type, resource_id, sequence, raw_text, validation_status)
SELECT 'thesis', rr.id, (ln.ord - 1)::int, btrim(ln.line), 'unverified'
FROM public.research_reports rr,
     LATERAL (
       SELECT line, row_number() OVER () AS ord
       FROM regexp_split_to_table(coalesce(rr."references", ''), E'\\r?\\n') AS line
     ) ln
WHERE btrim(ln.line) <> ''
ON CONFLICT (resource_type, resource_id, sequence) DO NOTHING;

COMMENT ON TABLE public.resource_references IS
  'Structured/raw bibliographic references, ordered per resource. Backfilled from publications.references (jsonb) and research_reports.references (text). Legacy columns remain the app read source until consumers migrate.';
COMMENT ON TABLE public.resource_relations IS
  'Typed source→target links between PTEC resources (cites/related/part_of/…). Empty at creation; populated by consumers. See docs/CANONICAL-RESOURCES.md.';
