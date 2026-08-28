-- 0121_ptec_library_brand.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Consolidate the library brand onto ONE name.
--
--   English         PTEC Library
--   Khmer           បណ្ណាល័យ វ.គ.ភ
--   Formal / footer PTEC Library · Phnom Penh Teacher Education College
--
-- "PTEC Digital Library" is retired as a variant name: "digital library"
-- describes what the service is, it is not a brand. It survived in the seed of
-- 0098 (siteTitle + siteName) and in 0113, so every Open Graph card, JSON-LD
-- publisher, OAI-PMH repositoryName and installed-app name rendered a name the
-- wordmark never used.
--
-- The Khmer library name is likewise shortened: the seed carried the full
-- institution name ("បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ"), which is the
-- INSTITUTION, not the library brand — the navbar and drawer already showed
-- "បណ្ណាល័យ វ.គ.ភ". organization.name is untouched: it must keep matching
-- www.ptec.edu.kh exactly.
--
-- Only rows still holding a known-old value are rewritten, so an admin who has
-- deliberately published something else in /admin/system-settings keeps it.
-- Code-level fallbacks live in lib/system-settings/defaults.ts and are updated
-- in the same commit.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.site_settings') is null then
    return;
  end if;

  -- ── seo.siteTitle / seo.siteName → "PTEC Library" ───────────────────────────
  update public.site_settings
  set published = jsonb_set(published, '{siteTitle}', '"PTEC Library"')
  where section = 'seo'
    and published->>'siteTitle' in ('PTEC Digital Library', 'PTEC Digital Teaching Library');

  update public.site_settings
  set published = jsonb_set(published, '{siteName}', '"PTEC Library"')
  where section = 'seo'
    and published->>'siteName' in ('PTEC Digital Library', 'PTEC Digital Teaching Library');

  update public.site_settings
  set draft = jsonb_set(draft, '{siteTitle}', '"PTEC Library"')
  where section = 'seo'
    and draft is not null
    and draft->>'siteTitle' in ('PTEC Digital Library', 'PTEC Digital Teaching Library');

  update public.site_settings
  set draft = jsonb_set(draft, '{siteName}', '"PTEC Library"')
  where section = 'seo'
    and draft is not null
    and draft->>'siteName' in ('PTEC Digital Library', 'PTEC Digital Teaching Library');

  -- ── organization.libraryName.km → "បណ្ណាល័យ វ.គ.ភ" ──────────────────────────
  update public.site_settings
  set published = jsonb_set(published, '{libraryName,km}', '"បណ្ណាល័យ វ.គ.ភ"')
  where section = 'organization'
    and published->'libraryName'->>'km' in (
      'បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ',
      'បណ្ណាល័យឌីជីថល វ.គ.ភ'
    );

  update public.site_settings
  set draft = jsonb_set(draft, '{libraryName,km}', '"បណ្ណាល័យ វ.គ.ភ"')
  where section = 'organization'
    and draft is not null
    and draft->'libraryName'->>'km' in (
      'បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ',
      'បណ្ណាល័យឌីជីថល វ.គ.ភ'
    );

  -- ── organization.libraryName.en → "PTEC Library" ────────────────────────────
  update public.site_settings
  set published = jsonb_set(published, '{libraryName,en}', '"PTEC Library"')
  where section = 'organization'
    and published->'libraryName'->>'en' in ('PTEC Digital Library', 'PTEC Digital Teaching Library');

  update public.site_settings
  set draft = jsonb_set(draft, '{libraryName,en}', '"PTEC Library"')
  where section = 'organization'
    and draft is not null
    and draft->'libraryName'->>'en' in ('PTEC Digital Library', 'PTEC Digital Teaching Library');
end
$$;
