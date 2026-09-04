-- 0135 — retrieval scoped to ONE record.
--
-- "Ask this book" could not be built on match_book_chunks (0082): that
-- function takes no record filter, so the only way to answer a question about
-- the book a reader is holding was to search the whole corpus and hope. Two
-- things made that worse than it sounds. The application-side dedupe keeps at
-- most one passage per work, so even a corpus-wide hit on the right book
-- returned a single page — never enough for a grounded answer about it. And
-- filtering after retrieval is the wrong shape for a security boundary: the
-- rule this codebase holds to is that visibility is a retrieval INPUT, never a
-- post-condition.
--
-- So this is a second function rather than a parameter added to the first.
-- match_book_chunks stays exactly as it is (the global assistant and
-- /api/search/native both call it, and its ANN candidate pool is tuned for a
-- corpus-wide scan); this one pushes the record filter INSIDE the candidate
-- CTE, so the index scan is over one document's chunks and the over-fetch
-- multiplier that a global scan needs is unnecessary.
--
-- Publish state is still re-checked at read time by the same joins, so a
-- record unpublished after embedding cannot answer a question about itself.

create or replace function public.match_record_chunks(
  query_embedding vector(768),
  p_record_type text,
  p_record_id uuid,
  match_count int default 8,
  min_similarity float default 0.30
)
returns table (
  source     text,
  record_id  uuid,
  ref        text,
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
    where c.record_type = p_record_type
      and c.record_id = p_record_id
    order by c.embedding <=> query_embedding
    limit greatest(match_count * 2, 24)
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

-- Same posture as match_book_chunks: reachable only through the service-role
-- client, which is the only place authorization has already been decided.
revoke execute on function public.match_record_chunks(vector, text, uuid, int, float)
  from public, anon, authenticated;
grant execute on function public.match_record_chunks(vector, text, uuid, int, float)
  to service_role;
