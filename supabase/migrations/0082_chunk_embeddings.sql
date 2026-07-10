-- 0082_chunk_embeddings.sql
-- Page-level semantic search: overlapping text chunks derived from book_pages
-- (0066) content, embedded with gemini-embedding-001 truncated to 768 dims —
-- the same vector space as the 0029 metadata embeddings. Powers passage
-- retrieval in /api/search and page-cited RAG context in /api/chat via
-- match_book_chunks(). Rows are written only by server code
-- (lib/chunk-embed.ts from the upload server actions, and
-- scripts/embed-library.ts as the backfill/repair safety net).

create table public.book_chunks (
  id          uuid        primary key default gen_random_uuid(),
  record_type text        not null check (record_type in ('book', 'research', 'publication')),
  record_id   uuid        not null,
  page_no     integer     not null,
  chunk_no    integer     not null,  -- order of the chunk within its page
  content     text        not null,
  embedding   vector(768) not null,
  embedded_at timestamptz not null default now(),
  unique (record_type, record_id, page_no, chunk_no)
);

create index book_chunks_record_idx
  on public.book_chunks (record_type, record_id);

-- ANN index — HNSW, cosine, same shape as the 0029 embedding indexes.
create index book_chunks_embedding_idx
  on public.book_chunks using hnsw (embedding vector_cosine_ops);

-- Only ever read/written via the service-role client from server code —
-- same posture as book_pages: RLS on, no policies.
alter table public.book_chunks enable row level security;

-- Top matching chunks across all record types, with parent metadata for
-- rendering. Publish state is re-checked at read time (join condition), so
-- content unpublished after embedding can't leak. One ANN scan feeds all
-- three types; the candidate pool over-fetches because unpublished/orphaned
-- chunks are dropped by the outer join.
create or replace function public.match_book_chunks(
  query_embedding vector(768),
  match_count int default 8,
  min_similarity float default 0.30
)
returns table (
  source     text,
  record_id  uuid,
  ref        text,   -- slug for books/publications; slug (or id) for research
  title      text,
  author     text,
  cover_url  text,
  page_no    int,
  content    text,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  with candidates as (
    select
      c.record_type,
      c.record_id,
      c.page_no,
      c.content,
      1 - (c.embedding <=> query_embedding) as similarity
    from public.book_chunks c
    order by c.embedding <=> query_embedding
    limit greatest(match_count * 8, 64)
  )
  select
    c.record_type as source,
    c.record_id,
    case c.record_type
      when 'book'        then b.slug
      when 'research'    then coalesce(r.slug, r.id::text)
      when 'publication' then p.slug
    end as ref,
    coalesce(b.title, r.title, p.title) as title,
    case c.record_type
      when 'book'        then coalesce(a.name, 'Unknown')
      when 'research'    then coalesce(r.author_names, 'Unknown')
      when 'publication' then coalesce(
        (
          select string_agg(pa.full_name, ', ' order by pas.author_order)
          from public.publication_authorships pas
          join public.publication_authors pa on pa.id = pas.author_id
          where pas.publication_id = p.id
        ),
        'Unknown'
      )
    end as author,
    coalesce(b.cover_url, r.cover_url, p.cover_url) as cover_url,
    c.page_no,
    c.content,
    c.similarity
  from candidates c
  left join public.books b
    on c.record_type = 'book' and b.id = c.record_id and b.is_published
  left join public.authors a on a.id = b.author_id
  left join public.research_reports r
    on c.record_type = 'research' and r.id = c.record_id and r.is_published
  left join public.publications p
    on c.record_type = 'publication' and p.id = c.record_id and p.is_published
  where c.similarity > min_similarity
    and coalesce(b.id, r.id, p.id) is not null
  order by c.similarity desc, c.page_no asc
  limit match_count;
$$;

-- Called only through the service-role client (/api/search, /api/chat).
revoke execute on function public.match_book_chunks(vector, int, float) from public, anon, authenticated;
grant execute on function public.match_book_chunks(vector, int, float) to service_role;
