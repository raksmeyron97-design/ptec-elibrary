-- supabase/migrations/0001_pgvector_search.sql
-- Semantic search across e-books, research reports, and the physical catalog.
-- Uses gemini-embedding-001 truncated to 768 dims (Matryoshka, index-safe).

-- 1. Extension ----------------------------------------------------------------
create extension if not exists vector;

-- 2. Embedding columns --------------------------------------------------------
alter table public.books            add column if not exists embedding vector(768);
alter table public.research_reports add column if not exists embedding vector(768);
alter table public.catalog_books    add column if not exists embedding vector(768);

-- 3. ANN indexes (cosine). HNSW = fast, good recall. Build is fine on empty
--    columns; it populates as rows get embedded.
create index if not exists books_embedding_idx
  on public.books using hnsw (embedding vector_cosine_ops);
create index if not exists research_embedding_idx
  on public.research_reports using hnsw (embedding vector_cosine_ops);
create index if not exists catalog_embedding_idx
  on public.catalog_books using hnsw (embedding vector_cosine_ops);

-- 4. Unified similarity search ------------------------------------------------
-- Returns the top matches across all three sources, ranked by cosine similarity.
-- `<=>` is cosine distance; similarity = 1 - distance.
create or replace function public.match_library(
  query_embedding vector(768),
  match_count int default 6,
  min_similarity float default 0.25
)
returns table (
  source     text,
  ref        text,   -- slug for books/catalog, id for research
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
  order by similarity desc
  limit match_count;
$$;

-- Allow the API (anon / authenticated) to call it.
grant execute on function public.match_library(vector, int, float) to anon, authenticated, service_role;