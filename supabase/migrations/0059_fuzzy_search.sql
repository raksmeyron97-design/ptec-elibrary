-- 0059_fuzzy_search.sql
-- Typo-tolerant search fallback for /api/search/native.
--
-- 1. Trigram GIN indexes for the tables native search hits with ILIKE.
--    (books.title/description and authors.name already have them from the
--    squashed baseline; these cover the remaining searched columns.)
-- 2. search_library_fuzzy(): word_similarity() ranking across books,
--    research_reports, catalog_books and posts. Trigram similarity works on
--    codepoints, so it handles Khmer script (no word boundaries) and one or
--    two mistyped characters in either language. Called by the API only when
--    exact ILIKE search returns zero rows.

create index if not exists research_reports_title_trgm_idx
  on public.research_reports using gin (title gin_trgm_ops);
create index if not exists research_reports_abstract_trgm_idx
  on public.research_reports using gin (abstract gin_trgm_ops);
create index if not exists research_reports_author_names_trgm_idx
  on public.research_reports using gin (author_names gin_trgm_ops);

create index if not exists catalog_books_title_trgm_idx
  on public.catalog_books using gin (title gin_trgm_ops);
create index if not exists catalog_books_author_trgm_idx
  on public.catalog_books using gin (author gin_trgm_ops);
create index if not exists catalog_books_description_trgm_idx
  on public.catalog_books using gin (description gin_trgm_ops);

create index if not exists posts_title_trgm_idx
  on public.posts using gin (title gin_trgm_ops);
create index if not exists posts_excerpt_trgm_idx
  on public.posts using gin (excerpt gin_trgm_ops);

-- word_similarity(query, text) scores the best-matching window of `text`
-- against the whole query, so short queries against long titles still score
-- high — better than plain similarity() for both Khmer and English.
create or replace function public.search_library_fuzzy(
  query_text text,
  match_count int default 8,
  min_similarity real default 0.3
)
returns table (
  source     text,   -- 'book' | 'research' | 'catalog' | 'post'
  id         text,
  ref        text,   -- slug for book/catalog/post, id for research
  title      text,
  author     text,
  category   text,
  cover_url  text,
  excerpt    text,
  similarity real
)
language sql
stable
set search_path = public, extensions
as $$
  with hits as (
    (
      select
        'book'::text as source,
        b.id::text   as id,
        b.slug       as ref,
        b.title,
        coalesce(a.name, 'Unknown')                as author,
        coalesce(c.name, b.department, 'E-Book')   as category,
        b.cover_url,
        left(coalesce(b.description, ''), 300)     as excerpt,
        greatest(
          word_similarity(query_text, b.title),
          word_similarity(query_text, coalesce(a.name, ''))
        ) as similarity
      from public.books b
      left join public.authors a    on a.id = b.author_id
      left join public.categories c on c.id = b.category_id
      where b.is_published
      order by similarity desc
      limit match_count
    )
    union all
    (
      select
        'research'::text,
        r.id::text,
        r.id::text,
        r.title,
        coalesce(r.author_names, 'Unknown'),
        coalesce(r.program, 'Thesis'),
        r.cover_url,
        left(coalesce(r.abstract, ''), 300),
        greatest(
          word_similarity(query_text, r.title),
          word_similarity(query_text, coalesce(r.author_names, ''))
        ) as similarity
      from public.research_reports r
      where r.is_published
      order by similarity desc
      limit match_count
    )
    union all
    (
      select
        'catalog'::text,
        cb.id::text,
        coalesce(cb.slug, cb.id::text),
        cb.title,
        coalesce(cb.author, 'Unknown'),
        coalesce(cb.category, 'Physical Book'),
        cb.cover_url,
        left(coalesce(cb.description, ''), 300),
        greatest(
          word_similarity(query_text, cb.title),
          word_similarity(query_text, coalesce(cb.author, ''))
        ) as similarity
      from public.catalog_books cb
      where cb.is_active
      order by similarity desc
      limit match_count
    )
    union all
    (
      select
        'post'::text,
        p.id::text,
        p.slug,
        p.title,
        ''::text,
        coalesce(p.category, 'News'),
        p.cover_url,
        left(coalesce(p.excerpt, ''), 300),
        word_similarity(query_text, p.title) as similarity
      from public.posts p
      where p.is_published
      order by similarity desc
      limit match_count
    )
  )
  select *
  from hits
  where similarity >= min_similarity
  order by similarity desc
  limit match_count;
$$;

grant execute on function public.search_library_fuzzy(text, int, real)
  to anon, authenticated, service_role;
