-- 0126_author_profiles_public_view.sql
--
-- A slug-existence view for /authors/[slug], so middleware's resource slug gate
-- can turn an unknown author URL into a real HTTP 404.
--
-- THE BUG THIS FIXES
--
-- Every route under app/[locale]/(public) streams its `loading` boundary before
-- the page resolves, so the 200 is already committed by the time the page calls
-- notFound(). /authors/<anything> therefore answered HTTP 200 with "not found"
-- content — a soft 404. That is the exact failure lib/resource-slug-gate.ts was
-- written for, and it matters here specifically because robots.ts ALLOWS
-- /authors/ and app/sitemap.ts advertises author URLs: search engines were being
-- invited to index not-found pages as live ones.
--
-- WHY A VIEW
--
-- The gate resolves one table per URL segment (`cfg.table` keys its snapshot,
-- its confirming lookup and its redirect embed). An author is not one table —
-- publication_authors holds the academic profiles and authors holds the e-book
-- authors, and /authors/[slug] resolves against both. Rather than teach an
-- edge-executed, fail-open module to union two tables (one of which has no
-- published column at all), this collapses the union into a relation the gate
-- can read unchanged.
--
-- Precedent: `about/team` already gates on team_members_public for the same
-- structural reason. As there, `is_published` is a constant-true column that
-- exists so the gate's `=eq.true` filter has something to bind to.
--
-- WHY EVERY SLUG IS INCLUDED, INCLUDING HIDDEN PROFILES
--
-- publication_authors.is_published = false hides the biography, photo and
-- links; it does NOT remove the page. The profile still renders the name and
-- the works list, and the author still appears in every byline they earned. So
-- a hidden profile is a live URL and must be in this view — excluding it would
-- 404 a page the application deliberately serves.
--
-- Rollback: drop view public.author_profiles_public; and remove the `authors`
-- entry from RESOURCE_GATES + middleware. The gate fails open on a missing
-- relation, so dropping the view alone restores the previous (soft-404)
-- behaviour rather than breaking the route.

drop view if exists public.author_profiles_public;

create view public.author_profiles_public
with (security_invoker = true)
as
-- UNION, not UNION ALL: one person can hold both a publication_authors profile
-- and an authors row under the same slug (that is the normal case for a PTEC
-- academic who has written both a book and an article), and the gate only
-- needs to know the slug resolves to something.
select pa.slug, true as is_published
  from public.publication_authors pa
 where pa.slug is not null
union
select a.slug, true
  from public.authors a
 where a.slug is not null;

comment on view public.author_profiles_public is
  'Slug-existence union of publication_authors and authors, read by middleware''s resource slug gate so an unknown /authors/<slug> is a real 404 instead of a streamed 200. is_published is constant true — it exists for the gate''s filter to bind to.';

-- The gate runs at the edge with the anon key.
grant select on public.author_profiles_public to anon, authenticated;
