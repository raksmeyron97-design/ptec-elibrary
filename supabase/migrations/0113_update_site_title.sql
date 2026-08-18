-- 0113_update_site_title.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Remove "Teaching" from siteTitle in the system_settings table to match "PTEC Digital Library".
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.site_settings') is null then
    return;
  end if;

  update public.site_settings
  set published = jsonb_set(published, '{siteTitle}', '"PTEC Digital Library"')
  where section = 'seo'
    and published->>'siteTitle' = 'PTEC Digital Teaching Library';

  update public.site_settings
  set draft = jsonb_set(draft, '{siteTitle}', '"PTEC Digital Library"')
  where section = 'seo'
    and draft is not null
    and draft->>'siteTitle' = 'PTEC Digital Teaching Library';
end
$$;
