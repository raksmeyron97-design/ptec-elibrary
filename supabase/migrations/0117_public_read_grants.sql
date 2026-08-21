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

-- ── Publication and post detail children ────────────────────────────────────
-- All content-scoped like their parents: `true` for the attribution tables,
-- a published-parent EXISTS() for the ones that expose files or links, and
-- is_deleted = false for comments.
grant select on public.publication_authorships to anon, authenticated;
grant select on public.publication_authors     to anon, authenticated;
grant select on public.publication_affiliations to anon, authenticated;
grant select on public.publication_files       to anon, authenticated;
grant select on public.post_comments           to anon, authenticated;

-- ── Team directory ──────────────────────────────────────────────────────────
-- team_members_public (the view the About pages and the middleware slug gate
-- read) is already granted by 0070/0115, but it resolves through these.
grant select on public.team_sections to anon, authenticated;
grant select on public.team_members  to anon, authenticated;

-- profiles needs the grant even though it yields NOTHING to anon.
--
-- Its SELECT policies are auth.uid()-scoped plus an is_admin() branch, so I
-- first granted this to authenticated only, reasoning that anon would read zero
-- rows either way. That was wrong about the failure mode: the posts pages embed
-- the author profile in the same PostgREST select, so "permission denied" fails
-- the WHOLE query rather than just blanking the author — the e2e log showed
-- `[getPostsPage] query failed` and `[getFeaturedPost] query failed`, i.e. no
-- posts at all. Production returns `200 []` here; that is the behaviour to
-- reproduce, and RLS still hands back no rows.
grant select on public.profiles to anon, authenticated;

-- ── Signed-in reader surfaces (user-scoped policies, never anon) ─────────────
-- No anon path reads these, so CI could not have caught them: the e2e suite
-- signs nobody in. A database built from this chain would serve the public site
-- correctly and then break the moment someone logged in.
grant select, insert, delete on public.post_likes       to authenticated;
grant select, insert, delete on public.post_saves       to authenticated;
grant select, insert, update on public.reading_progress to authenticated;

-- ── service_role: restore the platform default the flip took away ────────────
--
-- The grants above fix the ANONYMOUS reads, but most of the homepage never
-- makes one: lib/home-data.ts, getPublishedPaths() and getCollectionStats() all
-- go through createServiceClient(). service_role's privileges were never in this
-- chain either — Supabase's platform grants them — so the same flip revoked
-- those too. Measured: the anon grants alone moved the e2e stack from 253 to
-- 219 denials, and every survivor was a `[home-data] ...: permission denied`
-- line, i.e. a service-client read.
--
-- This is not a privilege escalation. service_role is the trusted server-only
-- key that already bypasses RLS by design (lib/supabase/server.ts, never
-- imported client-side); ALL is what the platform gives it, and every REVOKE in
-- this chain deliberately targets `public, anon, authenticated` and never
-- service_role. Writing it down just stops the chain depending on a default
-- that is being removed.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- Tables created by LATER migrations would land unprivileged again once the
-- implicit default is gone, so fix the default and not just the backlog.
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
