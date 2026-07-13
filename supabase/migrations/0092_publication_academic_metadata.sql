-- 0092_publication_academic_metadata.sql
-- Academic-metadata integrity for the publications collection (SEO/academic
-- integrity phase). ADDITIVE + IDEMPOTENT schema only — no data is mutated
-- here, so this is safe to apply/auto-apply on deploy.
--
-- The actual correction of the representative ACS record (placeholder DOI /
-- ORCID / license → Crossref-verified values) is deliberately kept OUT of the
-- migrations directory so it does not auto-run against production. It lives at
-- supabase/manual/0092_publication_data_correction.sql and must be applied by
-- an authorized administrator after review (it touches canonical academic
-- identity + licensing).
--
-- Rollback: see the bottom of this file.

-- ── 1. Journal ISSN ──────────────────────────────────────────────────────────
-- Distinct from a reviewed book's ISBN (publications.isbn). A journal article's
-- machine-readable identifier is its ISSN; conflating the two mislabels the
-- record for Google Scholar / structured data.
alter table public.publications
  add column if not exists issn text;

comment on column public.publications.issn is
  'Journal ISSN (e.g. 0021-9584). Validated in lib/seo/identifiers.ts before it '
  'reaches JSON-LD / citation_* meta. NOT the reviewed-book ISBN (see .isbn).';

-- ── 2. Metadata verification + provenance ────────────────────────────────────
-- Records that a publication's bibliographic metadata was checked against an
-- authoritative source, and where that source is. Powers the admin
-- academic-integrity panel and lets structured data assert only verified facts.
alter table public.publications
  add column if not exists metadata_verified    boolean not null default false,
  add column if not exists metadata_verified_at timestamptz,
  add column if not exists metadata_verified_by uuid references public.profiles(id) on delete set null,
  -- Free-text provenance, e.g. 'Crossref: https://doi.org/10.1021/ed500143m'.
  add column if not exists metadata_source      text,
  -- Whether full-text redistribution of the hosted file is authorized. Default
  -- false: we do NOT claim redistribution rights for third-party ©content until
  -- an administrator records the permission + its source.
  add column if not exists fulltext_redistributable boolean not null default false,
  add column if not exists rights_source        text;

comment on column public.publications.metadata_source is
  'Provenance of externally-verified bibliographic metadata (source name + URL).';
comment on column public.publications.fulltext_redistributable is
  'True only when redistribution of the hosted full text is documented as '
  'authorized (rights_source). Governs whether the file may be offered for '
  'download and whether isAccessibleForFree may be asserted.';

-- ── 3. Same provenance markers for theses (parity) ───────────────────────────
-- research_reports already has verified_at/verified_by (0062) + status (0086);
-- add the provenance source + an explicit "official title verified" flag so the
-- generic-title workflow can record an authorized exception.
alter table public.research_reports
  add column if not exists metadata_source        text,
  add column if not exists official_title_verified boolean not null default false;

comment on column public.research_reports.official_title_verified is
  'Set true by an authorized admin once the thesis official title has been '
  'checked against the source document — lets a generic-looking title publish.';

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- alter table public.publications
--   drop column if exists issn,
--   drop column if exists metadata_verified,
--   drop column if exists metadata_verified_at,
--   drop column if exists metadata_verified_by,
--   drop column if exists metadata_source,
--   drop column if exists fulltext_redistributable,
--   drop column if exists rights_source;
-- alter table public.research_reports
--   drop column if exists metadata_source,
--   drop column if exists official_title_verified;
