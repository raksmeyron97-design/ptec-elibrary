-- 0097_collection_stats_rule.sql
--
-- Align get_home_stats() with the documented public counting rule
-- (lib/collection-stats.ts):
--
--   digital resources = published books + published theses + published
--                       publications
--
-- The old definition counted published books + ACTIVE PHYSICAL CATALOG
-- RECORDS, which is why the homepage claimed "120+ digital resources" while
-- /books showed 116: the two surfaces used different counting rules. The app
-- no longer reads `resources` from this RPC (it computes exact counts via
-- lib/collection-stats.ts), but the RPC stays consistent so any future
-- consumer cannot resurrect the divergent rule.
--
-- Safe to apply at any time; no table or data changes.

CREATE OR REPLACE FUNCTION public.get_home_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    -- Digital resources ONLY (rule: lib/collection-stats.ts). Physical
    -- catalog records are a separate figure, never blended into this one.
    'resources',
      (SELECT count(*) FROM public.books            WHERE is_published = true)
      + (SELECT count(*) FROM public.research_reports WHERE is_published = true)
      + (SELECT count(*) FROM public.publications     WHERE is_published = true),
    'views',
      coalesce((SELECT sum(view_count)     FROM public.books WHERE is_published = true), 0),
    'downloads',
      coalesce((SELECT sum(download_count) FROM public.books WHERE is_published = true), 0),
    'members',
      (SELECT count(*) FROM public.profiles)
  );
$$;
