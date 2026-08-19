-- 0114_refresh_publications_with_stats_view.sql
--
-- Re-expand publications_with_stats so it exposes the columns added to
-- public.publications after the view was first created.
--
-- WHY. The view is defined as `SELECT p.*, (…) AS author_names`. Postgres
-- expands `p.*` ONCE, at CREATE time, and freezes the resulting column list —
-- a column added to the base table afterwards never appears in the view. Every
-- migration since 0052 that widened `publications` therefore widened the table
-- and not the view, silently.
--
-- Measured against the hosted database, the view exposed 31 columns while the
-- table had 42. Missing: subjects, publisher, isbn, issn, table_of_contents,
-- learning_outcomes, faqs, seo_title, seo_description, og_image,
-- content_revision.
--
-- The failure mode is silent because mapRowToPublication() defaults every one
-- of those to null/[] (`row.subjects ?? []`), so a listing row simply looked
-- like a record with no subjects and no publisher rather than like an error.
-- The publication listing's new ?subject= filter matched nothing at all for
-- this reason, and the SEO overrides added in 0112 never reached any surface
-- reading the view.
--
-- CREATE OR REPLACE VIEW cannot do this: replacing may only APPEND columns,
-- and re-expanding `p.*` inserts the new base columns BEFORE author_names,
-- which Postgres rejects as renaming existing view columns. So the view is
-- dropped and recreated.
--
-- Safe to drop: no other view, function, policy or trigger in this migration
-- chain references publications_with_stats — it is read only by the
-- application through PostgREST.
--
-- security_invoker = true is preserved deliberately. It is what makes the
-- base table's RLS policies apply to the querying role; without it the view
-- would read as its owner and bypass row-level security on publications.

drop view if exists public.publications_with_stats;

create view public.publications_with_stats
with (security_invoker = true)
as
select
  p.*,
  (
    select string_agg(pa.full_name, ', ' order by pas.author_order)
    from public.publication_authorships pas
    join public.publication_authors pa on pa.id = pas.author_id
    where pas.publication_id = p.id
  ) as author_names
from public.publications p;

-- Recreating the view creates a NEW object, so restate the read grants rather
-- than relying on whatever the dropped one happened to carry. Read-only: all
-- writes go to the base table through the admin actions.
grant select on public.publications_with_stats to anon, authenticated;

comment on view public.publications_with_stats is
  'Publication rows plus the aggregated author byline. Defined with p.* — if a '
  'column is added to public.publications, this view must be dropped and '
  'recreated (see 0114) or the new column will not appear here.';
