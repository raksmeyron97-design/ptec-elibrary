-- 0053_publications_search.sql
-- Union publications into the unified semantic search (match_library from 0029).
-- Adds a fourth source branch: 'publication', ref = slug, category = journal
-- name (falling back to 'Publication'). Only published, embedded rows match.
-- CREATE OR REPLACE keeps the existing grants from 0029.

create or replace function public.match_library(
  query_embedding vector(768),
  match_count int default 6,
  min_similarity float default 0.25
)
returns table (
  source     text,
  ref        text,   -- slug for books/catalog/publications, id for research
  title      text,
  author     text,
  category   text,
  cover_url  text,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  (
    select
      'book'::text,
      b.slug,
      b.title,
      coalesce(a.name, 'Unknown'),
      coalesce(c.name, b.department, 'E-Book'),
      b.cover_url,
      1 - (b.embedding <=> query_embedding) as similarity
    from public.books b
    left join public.authors a    on a.id = b.author_id
    left join public.categories c on c.id = b.category_id
    where b.is_published
      and b.embedding is not null
      and 1 - (b.embedding <=> query_embedding) > min_similarity
    order by b.embedding <=> query_embedding
    limit match_count
  )
  union all
  (
    select
      'research'::text,
      r.id::text,
      r.title,
      coalesce(r.author_names, 'Unknown'),
      'Research Report'::text,
      r.cover_url,
      1 - (r.embedding <=> query_embedding) as similarity
    from public.research_reports r
    where r.is_published
      and r.embedding is not null
      and 1 - (r.embedding <=> query_embedding) > min_similarity
    order by r.embedding <=> query_embedding
    limit match_count
  )
  union all
  (
    select
      'catalog'::text,
      cb.slug,
      cb.title,
      coalesce(cb.author, 'Unknown'),
      coalesce(cb.category, 'Physical Book'),
      cb.cover_url,
      1 - (cb.embedding <=> query_embedding) as similarity
    from public.catalog_books cb
    where cb.is_active
      and cb.embedding is not null
      and 1 - (cb.embedding <=> query_embedding) > min_similarity
    order by cb.embedding <=> query_embedding
    limit match_count
  )
  union all
  (
    select
      'publication'::text,
      p.slug,
      p.title,
      coalesce(
        (
          select string_agg(pa.full_name, ', ' order by pas.author_order)
          from public.publication_authorships pas
          join public.publication_authors pa on pa.id = pas.author_id
          where pas.publication_id = p.id
        ),
        'Unknown'
      ),
      coalesce(p.journal_name, 'Publication'),
      p.cover_url,
      1 - (p.embedding <=> query_embedding) as similarity
    from public.publications p
    where p.is_published
      and p.embedding is not null
      and 1 - (p.embedding <=> query_embedding) > min_similarity
    order by p.embedding <=> query_embedding
    limit match_count
  )
  order by similarity desc
  limit match_count;
$$;
