-- 0105_contributors.sql
-- ONE contributor model across every resource type (targeted-consolidation
-- Phase 2 — see docs/CANONICAL-RESOURCES.md).
--
-- The problem this fixes: authorship is modelled three incompatible ways —
--   * books           → single author_id FK into public.authors
--   * research_reports → author_names + advisor_name as FREE TEXT
--   * publications     → normalised publication_authors + publication_authorships
-- so "who wrote this" cannot be queried, ordered, deduplicated or credited
-- consistently, and a multi-author thesis is an opaque string.
--
-- This migration adds a canonical `contributors` authority table and a
-- polymorphic `resource_contributors` link table (same (resource_type,
-- resource_id) convention already used by learning_path_steps in 0063 — no
-- formal cross-table FK), then BACKFILLS all three legacy models into it,
-- preserving order, roles and corresponding-author flags.
--
-- The legacy columns/tables are LEFT IN PLACE and remain the read source for
-- the app until consumers are switched over (see the ResourceContributors
-- service). This migration is additive and non-destructive; nothing that reads
-- today changes behaviour. Provenance columns on `contributors`
-- (source / legacy_author_id / legacy_publication_author_id) make the backfill
-- idempotent and reconcilable without a separate mapping table.
--
-- Idempotent: safe to re-run. Additive only.

-- ── 1. contributors (authority record) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contributors (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL DEFAULT public.default_organization_id()
                               REFERENCES public.organizations(id),
  contributor_type text        NOT NULL DEFAULT 'person'
                               CHECK (contributor_type IN ('person', 'organization')),
  display_name     text        NOT NULL,
  name_en          text,
  name_km          text,
  given_name       text,
  family_name      text,
  biography_en     text,
  biography_km     text,
  email            text,
  orcid            text,
  affiliation      text,
  photo_url        text,
  credentials      text,
  -- Backfill provenance (idempotency + reconciliation; no separate map table).
  source           text        NOT NULL DEFAULT 'manual'
                               CHECK (source IN ('manual', 'authors', 'publication_authors',
                                                 'thesis_text', 'thesis_advisor')),
  legacy_author_id             uuid,   -- public.authors.id when source = 'authors'
  legacy_publication_author_id uuid,   -- public.publication_authors.id when source = 'publication_authors'
  created_at       timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at       timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- A real ORCID identifies exactly one person within a tenant.
CREATE UNIQUE INDEX IF NOT EXISTS ux_contributors_orcid
  ON public.contributors (organization_id, lower(orcid))
  WHERE orcid IS NOT NULL AND orcid <> '';

-- Backfill dedup keys (partial, only where the legacy id is set).
CREATE UNIQUE INDEX IF NOT EXISTS ux_contributors_legacy_author
  ON public.contributors (legacy_author_id) WHERE legacy_author_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_contributors_legacy_pub_author
  ON public.contributors (legacy_publication_author_id) WHERE legacy_publication_author_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contributors_organization ON public.contributors (organization_id);
CREATE INDEX IF NOT EXISTS idx_contributors_name_trgm
  ON public.contributors USING gin (display_name gin_trgm_ops);

-- ── 2. resource_contributors (polymorphic credit link) ───────────────────────
CREATE TABLE IF NOT EXISTS public.resource_contributors (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type  text    NOT NULL CHECK (resource_type IN ('book', 'thesis', 'publication', 'learning_path')),
  resource_id    uuid    NOT NULL,
  contributor_id uuid    NOT NULL REFERENCES public.contributors(id) ON DELETE CASCADE,
  role           text    NOT NULL DEFAULT 'author'
                         CHECK (role IN ('author', 'editor', 'advisor', 'supervisor', 'translator',
                                         'compiler', 'reviewer', 'illustrator', 'publisher', 'institution')),
  sequence       integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  is_corresponding      boolean NOT NULL DEFAULT false,
  display_name_override text,
  affiliation_override  text,
  created_at     timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (resource_type, resource_id, contributor_id, role)
);

CREATE INDEX IF NOT EXISTS idx_resource_contributors_resource
  ON public.resource_contributors (resource_type, resource_id, sequence);
CREATE INDEX IF NOT EXISTS idx_resource_contributors_contributor
  ON public.resource_contributors (contributor_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
-- contributors: public authority records, mirroring public.authors (public
-- read, admin write). resource_contributors: public only for PUBLISHED
-- resources (mirroring publication_authorships), admins see all.
ALTER TABLE public.contributors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_contributors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contributors are viewable by everyone" ON public.contributors;
DROP POLICY IF EXISTS "Admins can manage contributors"        ON public.contributors;
CREATE POLICY "Contributors are viewable by everyone"
  ON public.contributors FOR SELECT USING (true);
CREATE POLICY "Admins can manage contributors"
  ON public.contributors FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can view credits of published resources" ON public.resource_contributors;
DROP POLICY IF EXISTS "Admins can manage resource contributors"        ON public.resource_contributors;
CREATE POLICY "Public can view credits of published resources"
  ON public.resource_contributors FOR SELECT USING (
    public.is_admin()
    OR (resource_type = 'book'          AND EXISTS (SELECT 1 FROM public.books            b  WHERE b.id  = resource_id AND b.is_published))
    OR (resource_type = 'thesis'        AND EXISTS (SELECT 1 FROM public.research_reports r  WHERE r.id  = resource_id AND r.is_published))
    OR (resource_type = 'publication'   AND EXISTS (SELECT 1 FROM public.publications     p  WHERE p.id  = resource_id AND p.is_published))
    OR (resource_type = 'learning_path' AND EXISTS (SELECT 1 FROM public.learning_paths   lp WHERE lp.id = resource_id AND lp.is_published))
  );
CREATE POLICY "Admins can manage resource contributors"
  ON public.resource_contributors FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.contributors          TO anon, authenticated;
GRANT SELECT ON public.resource_contributors TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_contributors_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_contributors_touch ON public.contributors;
CREATE TRIGGER trg_contributors_touch
  BEFORE UPDATE ON public.contributors
  FOR EACH ROW EXECUTE FUNCTION public.touch_contributors_updated_at();

-- ── 4. Backfill A — books' authors table → contributors ──────────────────────
INSERT INTO public.contributors
  (organization_id, contributor_type, display_name, name_en, biography_en,
   photo_url, credentials, source, legacy_author_id)
SELECT public.default_organization_id(), 'person', a.name, a.name, a.bio,
       a.photo_url, a.credentials, 'authors', a.id
FROM public.authors a
WHERE NOT EXISTS (SELECT 1 FROM public.contributors c WHERE c.legacy_author_id = a.id);

INSERT INTO public.resource_contributors
  (resource_type, resource_id, contributor_id, role, sequence)
SELECT 'book', b.id, c.id, 'author', 0
FROM public.books b
JOIN public.contributors c ON c.legacy_author_id = b.author_id
WHERE b.author_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_contributors rc
    WHERE rc.resource_type = 'book' AND rc.resource_id = b.id
      AND rc.contributor_id = c.id AND rc.role = 'author');

-- ── 5. Backfill B — publications' normalised authors → contributors ──────────
INSERT INTO public.contributors
  (organization_id, contributor_type, display_name, name_en, name_km, orcid, email,
   source, legacy_publication_author_id)
SELECT public.default_organization_id(), 'person', pa.full_name, pa.full_name,
       pa.full_name_km, nullif(pa.orcid, ''), nullif(pa.email, ''),
       'publication_authors', pa.id
FROM public.publication_authors pa
WHERE NOT EXISTS (SELECT 1 FROM public.contributors c WHERE c.legacy_publication_author_id = pa.id);

INSERT INTO public.resource_contributors
  (resource_type, resource_id, contributor_id, role, sequence, is_corresponding)
SELECT 'publication', pau.publication_id, c.id, 'author',
       greatest(pau.author_order - 1, 0), pau.is_corresponding
FROM public.publication_authorships pau
JOIN public.contributors c ON c.legacy_publication_author_id = pau.author_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.resource_contributors rc
  WHERE rc.resource_type = 'publication' AND rc.resource_id = pau.publication_id
    AND rc.contributor_id = c.id AND rc.role = 'author');

-- ── 6. Backfill C — theses' free-text authors + advisor → contributors ───────
-- author_names is delimited free text ("A, B and C" / "A; B" / "A / B"). Split
-- on comma / semicolon / slash / ampersand / the word "and" (spelled out with
-- surrounding spaces so we never touch names containing "and"). Postgres regex
-- uses \b for BACKSPACE, so we match " and " literally rather than a word
-- boundary escape. thesis_text contributors dedup by display_name (a repeated
-- name across theses is treated as the same person — acceptable and keeps
-- re-runs from multiplying rows).
INSERT INTO public.contributors
  (organization_id, contributor_type, display_name, name_en, source)
SELECT DISTINCT public.default_organization_id(), 'person', p.name, p.name, 'thesis_text'
FROM (
  SELECT btrim(tok) AS name
  FROM public.research_reports rr,
       LATERAL regexp_split_to_table(
         coalesce(rr.author_names, ''),
         '\s*,\s*|\s*;\s*|\s*/\s*|\s*&\s*|\s+and\s+'
       ) AS tok
) p
WHERE p.name <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.contributors c
    WHERE c.source = 'thesis_text' AND c.display_name = p.name);

INSERT INTO public.resource_contributors
  (resource_type, resource_id, contributor_id, role, sequence)
SELECT 'thesis', p.report_id, cc.id, 'author', p.seq
FROM (
  SELECT rr.id AS report_id, btrim(tok.name) AS name, (tok.ord - 1)::int AS seq
  FROM public.research_reports rr,
       LATERAL (
         SELECT name, row_number() OVER () AS ord
         FROM regexp_split_to_table(
           coalesce(rr.author_names, ''),
           '\s*,\s*|\s*;\s*|\s*/\s*|\s*&\s*|\s+and\s+'
         ) AS name
       ) tok
  WHERE btrim(tok.name) <> ''
) p
JOIN public.contributors cc ON cc.source = 'thesis_text' AND cc.display_name = p.name
WHERE NOT EXISTS (
  SELECT 1 FROM public.resource_contributors rc
  WHERE rc.resource_type = 'thesis' AND rc.resource_id = p.report_id
    AND rc.contributor_id = cc.id AND rc.role = 'author');

-- Advisors.
INSERT INTO public.contributors
  (organization_id, contributor_type, display_name, name_en, source)
SELECT DISTINCT public.default_organization_id(), 'person', btrim(rr.advisor_name),
       btrim(rr.advisor_name), 'thesis_advisor'
FROM public.research_reports rr
WHERE coalesce(btrim(rr.advisor_name), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.contributors c
    WHERE c.source = 'thesis_advisor' AND c.display_name = btrim(rr.advisor_name));

INSERT INTO public.resource_contributors
  (resource_type, resource_id, contributor_id, role, sequence)
SELECT 'thesis', rr.id, c.id, 'advisor', 0
FROM public.research_reports rr
JOIN public.contributors c
  ON c.source = 'thesis_advisor' AND c.display_name = btrim(rr.advisor_name)
WHERE coalesce(btrim(rr.advisor_name), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_contributors rc
    WHERE rc.resource_type = 'thesis' AND rc.resource_id = rr.id
      AND rc.contributor_id = c.id AND rc.role = 'advisor');

COMMENT ON TABLE public.contributors IS
  'Canonical contributor authority records. Backfilled from public.authors, publication_authors, and research_reports free text (see source column). Legacy tables remain the app read source until consumers migrate.';
COMMENT ON TABLE public.resource_contributors IS
  'Polymorphic (resource_type, resource_id) credit links with role + ordering. No cross-table FK, matching learning_path_steps (0063).';
