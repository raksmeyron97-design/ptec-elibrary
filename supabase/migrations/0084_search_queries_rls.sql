-- 0084: search_queries — enable RLS + revoke client roles (service-role only)
--
-- 0058 created this table without RLS, reasoning that app code only touches
-- it via the service-role client. But PostgREST exposes every public-schema
-- table under Supabase's default grants, so in a fresh environment anon
-- could read the entire search log (raw search terms are user-typed and
-- privacy-sensitive) and insert/delete rows.
--
-- The hosted DB was NOT exposed — RLS is already enabled there (verified
-- 2026-07-11: anon SELECT returns 0 of 257 rows). This migration aligns the
-- migration history with that live state so fresh environments are safe too.
-- Safe to apply anytime; idempotent with the live dashboard change.
--
-- All consumers (search-insights action, /api/search/native, /api/search/
-- popular, theses summary logging) use createServiceClient(), which bypasses
-- both RLS and grants — no behavior change.

ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

-- Belt-and-braces, matching rate_limit's explicit revoke: even if a future
-- policy is added carelessly, client roles hold no table privileges at all.
REVOKE ALL ON TABLE public.search_queries FROM public, anon, authenticated;
