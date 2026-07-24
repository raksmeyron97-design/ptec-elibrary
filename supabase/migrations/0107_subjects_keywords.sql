-- 0107_subjects_keywords.sql
-- Normalised classification across resource types (targeted-consolidation
-- Phase 4 — see docs/CANONICAL-RESOURCES.md).
--
-- The problem this fixes: classification is scattered and untyped —
--   * books           → category_id FK + tags text[]
--   * research_reports → subject text code + keywords text[]
--   * publications     → keywords text[]
-- There is no shared subject taxonomy (no hierarchy, no Khmer labels) and
-- keywords live as comma-free text arrays that search cannot normalise.
--
-- This adds:
--   * `subjects`          — hierarchical EN/KM taxonomy (org-scoped, slugged)
--   * `resource_subjects` — polymorphic subject links (primary flag + order)
--   * `resource_keywords` — one normalised keyword per row (search-friendly)
-- and BACKFILLS from categories, the thesis subject code, and every text[]
-- keyword/tag column. Legacy columns remain the app read source until consumers
-- migrate; additive and non-destructive.
--
-- Idempotent: safe to re-run. Additive only.

-- ── 1. subjects ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subjects (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL DEFAULT public.default_organization_id()
                               REFERENCES public.organizations(id),
  parent_id        uuid        REFERENCES public.subjects(id) ON DELETE SET NULL,
  code             text,
  name_en          text        NOT NULL,
  name_km          text,
  slug             text        NOT NULL,
  status           text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  legacy_category_id uuid,   -- public.categories.id when derived from a book category
  created_at       timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at       timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (organization_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_subjects_organization ON public.subjects (organization_id);
CREATE INDEX IF NOT EXISTS idx_subjects_parent       ON public.subjects (parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_subjects_legacy_category
  ON public.subjects (legacy_category_id) WHERE legacy_category_id IS NOT NULL;

-- ── 2. resource_subjects ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_subjects (
  resource_type text    NOT NULL CHECK (resource_type IN ('book', 'thesis', 'publication', 'learning_path')),
  resource_id   uuid    NOT NULL,
  subject_id    uuid    NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  is_primary    boolean NOT NULL DEFAULT false,
  sequence      integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  created_at    timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (resource_type, resource_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_resource_subjects_subject ON public.resource_subjects (subject_id);

-- ── 3. resource_keywords ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_keywords (
  id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type      text    NOT NULL CHECK (resource_type IN ('book', 'thesis', 'publication', 'learning_path')),
  resource_id        uuid    NOT NULL,
  keyword            text    NOT NULL,
  locale             text,
  normalized_keyword text    NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (resource_type, resource_id, normalized_keyword)
);
CREATE INDEX IF NOT EXISTS idx_resource_keywords_norm ON public.resource_keywords (normalized_keyword);

-- ── 4. RLS ───────────────────────────────────────────────────────────────────
-- subjects: public authority taxonomy (public read, admin write), mirroring
-- categories. resource_subjects / resource_keywords: public only for PUBLISHED
-- resources; admins all.
ALTER TABLE public.subjects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Subjects are viewable by everyone" ON public.subjects;
DROP POLICY IF EXISTS "Admins can manage subjects"        ON public.subjects;
CREATE POLICY "Subjects are viewable by everyone"
  ON public.subjects FOR SELECT USING (status = 'active' OR public.is_admin());
CREATE POLICY "Admins can manage subjects"
  ON public.subjects FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Shared published-visibility predicate, inlined per table (RLS can't call a
-- polymorphic helper cheaply, and these mirror resource_contributors' policy).
DROP POLICY IF EXISTS "Public can view subjects of published resources" ON public.resource_subjects;
DROP POLICY IF EXISTS "Admins can manage resource subjects"             ON public.resource_subjects;
CREATE POLICY "Public can view subjects of published resources"
  ON public.resource_subjects FOR SELECT USING (
    public.is_admin()
    OR (resource_type = 'book'          AND EXISTS (SELECT 1 FROM public.books            b  WHERE b.id  = resource_id AND b.is_published))
    OR (resource_type = 'thesis'        AND EXISTS (SELECT 1 FROM public.research_reports r  WHERE r.id  = resource_id AND r.is_published))
    OR (resource_type = 'publication'   AND EXISTS (SELECT 1 FROM public.publications     p  WHERE p.id  = resource_id AND p.is_published))
    OR (resource_type = 'learning_path' AND EXISTS (SELECT 1 FROM public.learning_paths   lp WHERE lp.id = resource_id AND lp.is_published))
  );
CREATE POLICY "Admins can manage resource subjects"
  ON public.resource_subjects FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can view keywords of published resources" ON public.resource_keywords;
DROP POLICY IF EXISTS "Admins can manage resource keywords"             ON public.resource_keywords;
CREATE POLICY "Public can view keywords of published resources"
  ON public.resource_keywords FOR SELECT USING (
    public.is_admin()
    OR (resource_type = 'book'          AND EXISTS (SELECT 1 FROM public.books            b  WHERE b.id  = resource_id AND b.is_published))
    OR (resource_type = 'thesis'        AND EXISTS (SELECT 1 FROM public.research_reports r  WHERE r.id  = resource_id AND r.is_published))
    OR (resource_type = 'publication'   AND EXISTS (SELECT 1 FROM public.publications     p  WHERE p.id  = resource_id AND p.is_published))
    OR (resource_type = 'learning_path' AND EXISTS (SELECT 1 FROM public.learning_paths   lp WHERE lp.id = resource_id AND lp.is_published))
  );
CREATE POLICY "Admins can manage resource keywords"
  ON public.resource_keywords FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.subjects          TO anon, authenticated;
GRANT SELECT ON public.resource_subjects TO anon, authenticated;
GRANT SELECT ON public.resource_keywords TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_subjects_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_subjects_touch ON public.subjects;
CREATE TRIGGER trg_subjects_touch
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.touch_subjects_updated_at();

-- ── 5. Backfill A — book categories → subjects ───────────────────────────────
INSERT INTO public.subjects (organization_id, name_en, slug, legacy_category_id)
SELECT public.default_organization_id(), cat.name, cat.slug, cat.id
FROM public.categories cat
WHERE NOT EXISTS (SELECT 1 FROM public.subjects s WHERE s.legacy_category_id = cat.id);

INSERT INTO public.resource_subjects (resource_type, resource_id, subject_id, is_primary, sequence)
SELECT 'book', b.id, s.id, true, 0
FROM public.books b
JOIN public.subjects s ON s.legacy_category_id = b.category_id
WHERE b.category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_subjects rs
    WHERE rs.resource_type = 'book' AND rs.resource_id = b.id AND rs.subject_id = s.id);

-- ── 6. Backfill B — thesis subject code → subjects ───────────────────────────
INSERT INTO public.subjects (organization_id, code, name_en, slug)
SELECT DISTINCT public.default_organization_id(), btrim(rr.subject), btrim(rr.subject),
       regexp_replace(lower(btrim(rr.subject)), '[^a-z0-9]+', '-', 'g')
FROM public.research_reports rr
WHERE coalesce(btrim(rr.subject), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.subjects s
    WHERE s.organization_id = public.default_organization_id()
      AND s.slug = regexp_replace(lower(btrim(rr.subject)), '[^a-z0-9]+', '-', 'g'));

INSERT INTO public.resource_subjects (resource_type, resource_id, subject_id, is_primary, sequence)
SELECT 'thesis', rr.id, s.id, true, 0
FROM public.research_reports rr
JOIN public.subjects s
  ON s.organization_id = public.default_organization_id()
 AND s.slug = regexp_replace(lower(btrim(rr.subject)), '[^a-z0-9]+', '-', 'g')
WHERE coalesce(btrim(rr.subject), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_subjects rs
    WHERE rs.resource_type = 'thesis' AND rs.resource_id = rr.id AND rs.subject_id = s.id);

-- ── 7. Backfill C — keyword/tag arrays → resource_keywords ───────────────────
-- Books use `tags`; theses/publications use `keywords`. One normalised row each.
INSERT INTO public.resource_keywords (resource_type, resource_id, keyword, normalized_keyword)
SELECT 'book', b.id, kw, lower(btrim(kw))
FROM public.books b, LATERAL unnest(coalesce(b.tags, '{}'::text[])) AS kw
WHERE btrim(kw) <> ''
ON CONFLICT (resource_type, resource_id, normalized_keyword) DO NOTHING;

INSERT INTO public.resource_keywords (resource_type, resource_id, keyword, normalized_keyword)
SELECT 'thesis', rr.id, kw, lower(btrim(kw))
FROM public.research_reports rr, LATERAL unnest(coalesce(rr.keywords, '{}'::text[])) AS kw
WHERE btrim(kw) <> ''
ON CONFLICT (resource_type, resource_id, normalized_keyword) DO NOTHING;

INSERT INTO public.resource_keywords (resource_type, resource_id, keyword, normalized_keyword)
SELECT 'publication', p.id, kw, lower(btrim(kw))
FROM public.publications p, LATERAL unnest(coalesce(p.keywords, '{}'::text[])) AS kw
WHERE btrim(kw) <> ''
ON CONFLICT (resource_type, resource_id, normalized_keyword) DO NOTHING;

COMMENT ON TABLE public.subjects IS
  'Hierarchical EN/KM subject taxonomy (org-scoped). Backfilled from book categories and the thesis subject code. Legacy category_id/subject columns remain the app read source until consumers migrate.';
COMMENT ON TABLE public.resource_keywords IS
  'One normalised keyword per row across resource types, backfilled from tags/keywords arrays. For consistent keyword search; the arrays remain the app read source until consumers migrate.';
