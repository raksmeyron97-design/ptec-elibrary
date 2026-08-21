-- Explicit Data API read grants for the public site.
--
-- WHY THIS EXISTS
--
-- The hosted project was created before Supabase's 2026-05-30 change and still
-- auto-exposes public-schema tables to the Data API roles, so the app has never
-- needed these grants: `anon` could read `books`, `research_reports` and the
-- rest implicitly. The migration chain therefore never recorded them, and any
-- database built FROM the chain instead of from the hosted project's history
-- gets a public site that renders nothing. Two places already hit this:
--
--   * the e2e job's local stack (supabase/setup-cli tracks `latest`), where the
--     last green run on main logged 253 "permission denied for table ..." lines
--     while still passing, because nothing asserted on data; and
--   * a fresh self-hosted deploy (docs/ZIMAOS-DEPLOYMENT.md), which builds its
--     database from this chain.
--
-- supabase/config.toml pins auto_expose_new_tables = true so CI reproduces
-- production today, but that field disappears on 2026-10-30 when always-revoked
-- becomes permanent. These grants are what has to be in place by then.
--
-- WHY THIS IS NOT A WIDENING
--
-- Every relation below already answers `anon` on the hosted database — verified
-- by direct PostgREST probe, not assumed. Each one is also protected by an RLS
-- policy whose USING clause is content-scoped, never user-scoped:
--
--   books, research_reports, publications   USING (is_published = true)
--   catalog_books, catalog_copies           USING (true)
--   authors, categories, departments        USING (true)
--   reviews                                 USING (true)
--   book_files                              published-parent check
--
-- SELECT privilege is what lets RLS be consulted at all; the policy still
-- decides the rows. Unpublished content stays invisible.
--
-- Deliberately NOT granted, to keep this from becoming a blanket exposure:
--   * rate_limit, search_queries, catalog_import_jobs, canonical_backfill_health
--     and the site_settings pair — the chain revokes these on purpose.
--   * check_rate_limit() and the other service-role-only functions. The e2e log
--     also showed these failing, but that is service_role losing its IMPLICIT
--     access, not anon needing a grant; the explicit REVOKE targets
--     public/anon/authenticated and must keep winning.
--   * book_pages — RLS is enabled with no public SELECT policy, so it is read
--     server-side with the service client. A grant would return zero rows.
--
-- Idempotent: GRANT is a no-op where the privilege already exists, so this is
-- a no-op against the hosted database.

-- ── Content the public site reads as an anonymous visitor ────────────────────
grant select on public.books            to anon, authenticated;
grant select on public.research_reports to anon, authenticated;
grant select on public.publications     to anon, authenticated;
grant select on public.catalog_books    to anon, authenticated;
grant select on public.catalog_copies   to anon, authenticated;
grant select on public.book_files       to anon, authenticated;

-- ── Taxonomy + attribution behind listing filters and detail pages ───────────
grant select on public.authors     to anon, authenticated;
grant select on public.categories  to anon, authenticated;
grant select on public.departments to anon, authenticated;
grant select on public.reviews     to anon, authenticated;

-- `posts` was already granted to anon in the squashed baseline (0034) but never
-- to authenticated, so a signed-in reader lost the news pages that a signed-out
-- one could see.
grant select on public.posts to authenticated;

-- profiles is the one exception to the pattern: its SELECT policies are
-- auth.uid()-scoped ("Users can view own profile") plus an is_admin() branch,
-- so anon would read zero rows and the grant would only widen the API surface
-- for nothing. authenticated is the role that actually needs it.
grant select on public.profiles to authenticated;
