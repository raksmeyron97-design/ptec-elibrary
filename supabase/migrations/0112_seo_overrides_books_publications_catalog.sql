-- 0112_seo_overrides_books_publications_catalog.sql
-- Per-resource SEO override parity. Posts (0073), theses (0076) and learning
-- paths (0111) already let an admin override the auto-generated SEO title,
-- description and Open Graph image; books, publications and physical catalog
-- records did not — their metadata was fully auto-generated with no manual
-- escape hatch. This adds the same three nullable columns to those three tables.
--
-- Purely additive: every column is nullable with no default, so pre-migration
-- rows keep working and the builders fall back to auto-generated values whenever
-- an override is null/blank (see lib/seo/book-seo.ts, lib/seo/publication-seo.ts,
-- and the catalog detail page). No RLS change needed — these tables already have
-- their policies; a new nullable column inherits them.

alter table public.books
  add column if not exists seo_title       text,
  add column if not exists seo_description text,
  add column if not exists og_image        text;

alter table public.publications
  add column if not exists seo_title       text,
  add column if not exists seo_description text,
  add column if not exists og_image        text;

alter table public.catalog_books
  add column if not exists seo_title       text,
  add column if not exists seo_description text,
  add column if not exists og_image        text;
