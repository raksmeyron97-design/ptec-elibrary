-- 0102_settings_backfill_seo_fields.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill settings fields that were added to the TypeScript schema AFTER
-- migration 0098 wrote its seed documents.
--
-- The bug this closes: 0098 seeds the `seo` section with siteTitle,
-- titleTemplate, siteName and siteDescription only. `indexingEnabled` and
-- `verification` were added later. The public site coped (getSiteConfig() runs
-- every stored document through validateSectionDoc() + the mapper, which fill
-- optional fields in), but /admin/system-settings handed the RAW row to the
-- form, which read `doc.verification.google` on an object with no
-- `verification` key and crashed the page with:
--
--     Cannot read properties of undefined (reading 'google')
--
-- lib/system-settings/admin.ts now hydrates stored documents before they reach
-- the forms, so the crash is fixed with or without this migration. This file
-- additionally normalizes the DATA, so:
--   • the stored document is self-describing rather than relying on readers to
--     patch it, and
--   • the next publish diff doesn't list `verification.google` /
--     `indexingEnabled` as "changed" purely because the reader added them.
--
-- `defaults || stored` keeps every value the row already has (the right-hand
-- side wins on key collisions) and only fills in absent top-level keys — so
-- this is idempotent and cannot overwrite a configured token.
--
-- site_setting_versions.snapshot is deliberately NOT touched: publication
-- history is immutable. Restoring an old version re-validates the snapshot
-- through validateSectionDoc(), which supplies the missing fields anyway.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  -- Nothing to do if 0098 has not been applied yet.
  if to_regclass('public.site_settings') is null then
    return;
  end if;

  update public.site_settings
  set published = '{
        "indexingEnabled": true,
        "verification": {"google": "", "bing": ""}
      }'::jsonb || published
  where section = 'seo'
    and not (published ? 'verification' and published ? 'indexingEnabled');

  update public.site_settings
  set draft = '{
        "indexingEnabled": true,
        "verification": {"google": "", "bing": ""}
      }'::jsonb || draft
  where section = 'seo'
    and draft is not null
    and not (draft ? 'verification' and draft ? 'indexingEnabled');
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback: none needed. The added keys carry the same values the application
-- already substituted at read time, so removing them would only reintroduce
-- the incomplete document.
-- ─────────────────────────────────────────────────────────────────────────────
