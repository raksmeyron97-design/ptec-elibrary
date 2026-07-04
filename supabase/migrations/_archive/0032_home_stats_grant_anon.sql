-- 0032_home_stats_grant_anon.sql
-- Allow the anon role to call get_home_stats() so the public home page
-- can use the regular (anon-key) Supabase client instead of the service role.
-- The function is SECURITY DEFINER and returns only aggregate counts — no PII.
grant execute on function public.get_home_stats() to anon;
