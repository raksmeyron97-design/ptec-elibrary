-- 0024_home_stats.sql
-- Single RPC to fetch homepage statistics in one round-trip.
-- Service-role-only: anon/authenticated access is revoked.

create or replace function public.get_home_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'resources',
      (select count(*) from public.books where is_published = true)
      + (select count(*) from public.catalog_books where is_active = true),
    'views',
      coalesce((select sum(view_count)     from public.books where is_published = true), 0),
    'downloads',
      coalesce((select sum(download_count) from public.books where is_published = true), 0),
    'members',
      (select count(*) from public.profiles)
  );
$$;

-- Restrict to service-role only (homepage fetches via createServiceClient)
revoke all on function public.get_home_stats() from public, anon, authenticated;
