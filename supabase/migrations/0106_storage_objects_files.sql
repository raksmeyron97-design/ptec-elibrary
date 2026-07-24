-- 0106_storage_objects_files.sql
-- ONE file/storage model across every resource type (targeted-consolidation
-- Phase 3 — see docs/CANONICAL-RESOURCES.md).
--
-- The problem this fixes: files are modelled three ways and storage references
-- are bare URLs with no integrity/scan/visibility layer —
--   * books           → book_files (format, file_url, file_size_kb)
--   * publications     → publication_files (label, file_url, size_bytes) + pdf_url/cover_url columns
--   * research_reports → single file_url + cover_url columns
--   * learning_paths   → cover_url column
-- so there is no place to record a checksum, a scan result, or an access policy,
-- and "replace the PDF" has no canonical target.
--
-- This adds `storage_objects` (the physical object: provider, key, checksum,
-- scan_status, visibility) and `resource_files` (polymorphic role link:
-- primary_pdf / cover / supplementary …), then BACKFILLS every known legacy
-- file/cover reference. Legacy columns/tables remain the app read source until
-- consumers migrate (see the ResourceFile service); additive and non-destructive.
--
-- Provider detection is a documented heuristic: an http(s) value is a resolved
-- Zima/external CDN URL (stored in both object_key and url); a bare value is a
-- legacy Cloudflare R2 key (object_key only, resolved to a signed URL at read
-- time by the existing download route). We do NOT re-point any download path in
-- this migration — we only record what the legacy columns already contain.
--
-- Idempotent: safe to re-run. Additive only.

-- ── 1. storage_objects ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.storage_objects (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL DEFAULT public.default_organization_id()
                                REFERENCES public.organizations(id),
  provider          text        NOT NULL DEFAULT 'zima'
                                CHECK (provider IN ('zima', 'r2', 'vercel_blob', 'external')),
  bucket            text,
  object_key        text        NOT NULL,   -- provider key/path, or full URL for CDN/external
  url               text,                   -- resolved public/CDN URL when known
  original_filename text,
  mime_type         text,
  size_bytes        bigint,
  checksum_sha256   text,
  storage_status    text        NOT NULL DEFAULT 'active'
                                CHECK (storage_status IN ('active', 'missing', 'deleted')),
  scan_status       text        NOT NULL DEFAULT 'unscanned'
                                CHECK (scan_status IN ('unscanned', 'clean', 'infected', 'error')),
  visibility        text        NOT NULL DEFAULT 'public'
                                CHECK (visibility IN ('public', 'authenticated', 'restricted', 'private')),
  created_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  deleted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_storage_objects_organization ON public.storage_objects (organization_id);
CREATE INDEX IF NOT EXISTS idx_storage_objects_checksum
  ON public.storage_objects (checksum_sha256) WHERE checksum_sha256 IS NOT NULL;

-- ── 2. resource_files (polymorphic role link) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_files (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type     text    NOT NULL CHECK (resource_type IN ('book', 'thesis', 'publication', 'learning_path')),
  resource_id       uuid    NOT NULL,
  storage_object_id uuid    NOT NULL REFERENCES public.storage_objects(id) ON DELETE CASCADE,
  file_role         text    NOT NULL
                            CHECK (file_role IN ('primary_pdf', 'epub', 'cover', 'thumbnail', 'preview',
                                                 'supplementary', 'dataset', 'attachment', 'transcript')),
  file_format       text,
  locale            text,
  sequence          integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  is_primary        boolean NOT NULL DEFAULT false,
  access_policy     text    NOT NULL DEFAULT 'public'
                            CHECK (access_policy IN ('public', 'authenticated', 'restricted')),
  legacy_book_file_id        uuid,   -- provenance for reconciliation / idempotency
  legacy_publication_file_id uuid,
  created_at        timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (resource_type, resource_id, storage_object_id, file_role)
);

-- At most one primary file per (resource, role).
CREATE UNIQUE INDEX IF NOT EXISTS ux_resource_files_primary
  ON public.resource_files (resource_type, resource_id, file_role) WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_resource_files_resource
  ON public.resource_files (resource_type, resource_id, file_role, sequence);
CREATE UNIQUE INDEX IF NOT EXISTS ux_resource_files_legacy_book
  ON public.resource_files (legacy_book_file_id) WHERE legacy_book_file_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_resource_files_legacy_pub
  ON public.resource_files (legacy_publication_file_id) WHERE legacy_publication_file_id IS NOT NULL;

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
-- storage_objects: metadata about physical files. Public may read metadata of
-- PUBLIC-visibility objects (needed to resolve cover/PDF references for
-- published resources); restricted/private objects are admin-only. This is
-- metadata, never bytes — bytes still flow through the download route.
-- resource_files: public only when it links to a PUBLISHED resource; admins all.
ALTER TABLE public.storage_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_files  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view public storage objects" ON public.storage_objects;
DROP POLICY IF EXISTS "Admins can manage storage objects"      ON public.storage_objects;
CREATE POLICY "Public can view public storage objects"
  ON public.storage_objects FOR SELECT
  USING (public.is_admin() OR (visibility = 'public' AND deleted_at IS NULL));
CREATE POLICY "Admins can manage storage objects"
  ON public.storage_objects FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can view files of published resources" ON public.resource_files;
DROP POLICY IF EXISTS "Admins can manage resource files"             ON public.resource_files;
CREATE POLICY "Public can view files of published resources"
  ON public.resource_files FOR SELECT USING (
    public.is_admin()
    OR (resource_type = 'book'          AND EXISTS (SELECT 1 FROM public.books            b  WHERE b.id  = resource_id AND b.is_published))
    OR (resource_type = 'thesis'        AND EXISTS (SELECT 1 FROM public.research_reports r  WHERE r.id  = resource_id AND r.is_published))
    OR (resource_type = 'publication'   AND EXISTS (SELECT 1 FROM public.publications     p  WHERE p.id  = resource_id AND p.is_published))
    OR (resource_type = 'learning_path' AND EXISTS (SELECT 1 FROM public.learning_paths   lp WHERE lp.id = resource_id AND lp.is_published))
  );
CREATE POLICY "Admins can manage resource files"
  ON public.resource_files FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.storage_objects TO anon, authenticated;
GRANT SELECT ON public.resource_files  TO anon, authenticated;

-- ── 4. Backfill helper: create a storage_object from a legacy URL/key ────────
-- Returns the new (or existing, keyed on object_key) storage_object id.
CREATE OR REPLACE FUNCTION public.upsert_legacy_storage_object(
  p_ref text, p_mime text, p_size bigint, p_visibility text
) RETURNS uuid
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_id       uuid;
  v_provider text;
  v_url      text;
BEGIN
  IF coalesce(btrim(p_ref), '') = '' THEN RETURN NULL; END IF;

  SELECT id INTO v_id FROM public.storage_objects WHERE object_key = p_ref LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  IF p_ref ~* '^https?://' THEN
    v_provider := 'zima'; v_url := p_ref;   -- resolved CDN/external URL
  ELSE
    v_provider := 'r2';   v_url := NULL;    -- bare legacy R2 key, signed at read time
  END IF;

  INSERT INTO public.storage_objects
    (provider, object_key, url, mime_type, size_bytes, visibility)
  VALUES (v_provider, p_ref, v_url, p_mime, p_size, coalesce(p_visibility, 'public'))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ── 5. Backfill A — book_files (PDF/EPUB/…) ──────────────────────────────────
-- is_primary is true for the FIRST non-EPUB (PDF) file of each book only, so a
-- book with several PDF rows never violates the one-primary-per-role index.
--
-- book_files.format is `text` in the squashed baseline but was drifted to the
-- enum public.file_format('pdf','epub') on the hosted DB (dashboard change, no
-- migration). coalesce(bf.format, '') would then coerce the '' literal to the
-- enum and fail (22P02). Casting bf.format::text first works for BOTH shapes —
-- text stays text, enum widens to its label — so this migration is drift-safe.
INSERT INTO public.resource_files
  (resource_type, resource_id, storage_object_id, file_role, file_format,
   is_primary, sequence, legacy_book_file_id)
SELECT 'book', ranked.book_id,
       public.upsert_legacy_storage_object(ranked.file_url, NULL, ranked.file_size_kb::bigint * 1024, 'public'),
       ranked.file_role,
       ranked.format,
       ranked.file_role = 'primary_pdf' AND ranked.pdf_rank = 1,   -- exactly one primary PDF per book
       0, ranked.id
FROM (
  SELECT bf.id, bf.book_id, bf.file_url, bf.file_size_kb, bf.format::text AS format,
         CASE lower(coalesce(bf.format::text, '')) WHEN 'epub' THEN 'epub' ELSE 'primary_pdf' END AS file_role,
         row_number() OVER (
           PARTITION BY bf.book_id,
             CASE lower(coalesce(bf.format::text, '')) WHEN 'epub' THEN 'epub' ELSE 'primary_pdf' END
           -- Order by id only: book_files has no created_at on the hosted DB
           -- (baseline/drift mismatch). id is the PK, so this is deterministic;
           -- which PDF becomes primary among several is arbitrary but stable.
           ORDER BY bf.id
         ) AS pdf_rank
  FROM public.book_files bf
  WHERE coalesce(btrim(bf.file_url), '') <> ''
) ranked
WHERE NOT EXISTS (SELECT 1 FROM public.resource_files rf WHERE rf.legacy_book_file_id = ranked.id)
ON CONFLICT (resource_type, resource_id, storage_object_id, file_role) DO NOTHING;

-- Book covers.
INSERT INTO public.resource_files
  (resource_type, resource_id, storage_object_id, file_role, is_primary, sequence)
SELECT 'book', b.id,
       public.upsert_legacy_storage_object(b.cover_url, NULL, NULL, 'public'),
       'cover', true, 0
FROM public.books b
WHERE coalesce(btrim(b.cover_url), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_files rf
    WHERE rf.resource_type = 'book' AND rf.resource_id = b.id AND rf.file_role = 'cover');

-- ── 6. Backfill B — research_reports (thesis PDF + cover) ─────────────────────
INSERT INTO public.resource_files
  (resource_type, resource_id, storage_object_id, file_role, is_primary, sequence)
SELECT 'thesis', rr.id,
       public.upsert_legacy_storage_object(rr.file_url, 'application/pdf', rr.file_size_kb::bigint * 1024, 'public'),
       'primary_pdf', true, 0
FROM public.research_reports rr
WHERE coalesce(btrim(rr.file_url), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_files rf
    WHERE rf.resource_type = 'thesis' AND rf.resource_id = rr.id AND rf.file_role = 'primary_pdf');

INSERT INTO public.resource_files
  (resource_type, resource_id, storage_object_id, file_role, is_primary, sequence)
SELECT 'thesis', rr.id,
       public.upsert_legacy_storage_object(rr.cover_url, NULL, NULL, 'public'),
       'cover', true, 0
FROM public.research_reports rr
WHERE coalesce(btrim(rr.cover_url), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_files rf
    WHERE rf.resource_type = 'thesis' AND rf.resource_id = rr.id AND rf.file_role = 'cover');

-- ── 7. Backfill C — publications (pdf_url primary, cover_url, publication_files) ──
INSERT INTO public.resource_files
  (resource_type, resource_id, storage_object_id, file_role, is_primary, sequence)
SELECT 'publication', p.id,
       public.upsert_legacy_storage_object(p.pdf_url, 'application/pdf', NULL, 'public'),
       'primary_pdf', true, 0
FROM public.publications p
WHERE coalesce(btrim(p.pdf_url), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_files rf
    WHERE rf.resource_type = 'publication' AND rf.resource_id = p.id AND rf.file_role = 'primary_pdf');

INSERT INTO public.resource_files
  (resource_type, resource_id, storage_object_id, file_role, is_primary, sequence)
SELECT 'publication', p.id,
       public.upsert_legacy_storage_object(p.cover_url, NULL, NULL, 'public'),
       'cover', true, 0
FROM public.publications p
WHERE coalesce(btrim(p.cover_url), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_files rf
    WHERE rf.resource_type = 'publication' AND rf.resource_id = p.id AND rf.file_role = 'cover');

INSERT INTO public.resource_files
  (resource_type, resource_id, storage_object_id, file_role, file_format,
   is_primary, sequence, legacy_publication_file_id)
SELECT 'publication', pf.publication_id,
       public.upsert_legacy_storage_object(pf.file_url, pf.file_type, pf.size_bytes, 'public'),
       'supplementary', pf.file_type, false, coalesce(pf.sort_order, 0), pf.id
FROM public.publication_files pf
WHERE coalesce(btrim(pf.file_url), '') <> ''
  AND NOT EXISTS (SELECT 1 FROM public.resource_files rf WHERE rf.legacy_publication_file_id = pf.id)
ON CONFLICT (resource_type, resource_id, storage_object_id, file_role) DO NOTHING;

-- ── 8. Backfill D — learning_paths cover ─────────────────────────────────────
INSERT INTO public.resource_files
  (resource_type, resource_id, storage_object_id, file_role, is_primary, sequence)
SELECT 'learning_path', lp.id,
       public.upsert_legacy_storage_object(lp.cover_url, NULL, NULL, 'public'),
       'cover', true, 0
FROM public.learning_paths lp
WHERE coalesce(btrim(lp.cover_url), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_files rf
    WHERE rf.resource_type = 'learning_path' AND rf.resource_id = lp.id AND rf.file_role = 'cover');

COMMENT ON TABLE public.storage_objects IS
  'Physical file references with integrity (checksum), scan_status and visibility. Backfilled from legacy URL/key columns; the download route still resolves bytes. See docs/CANONICAL-RESOURCES.md.';
COMMENT ON TABLE public.resource_files IS
  'Polymorphic (resource_type, resource_id) file-role links (primary_pdf/cover/supplementary/…). One primary per role. Legacy file tables/columns remain the app read source until consumers migrate.';
