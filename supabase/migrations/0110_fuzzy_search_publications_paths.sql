-- 0110_fuzzy_search_publications_paths.sql
-- Extend the typo-tolerant fallback (search_library_fuzzy, 0059) to the two
-- resource types it never covered: Publications and Learning Paths.
--
-- Native search already exact-matches both types; the fuzzy RPC only fires when
-- exact ILIKE search returns zero rows, so before this migration a mistyped
-- publication or learning-path title fell through to "no results" while books,
-- theses, catalog and posts recovered. The API's FUZZY_URL map already knows
-- how to route 'publication' and 'learning_path' rows — the RPC simply never
-- emitted them.
--
-- word_similarity(query, text) scores the best-matching window of `text`, so
-- short queries against long titles still rank well, and trigram matching works
-- on Khmer codepoints (no word boundaries) — same rationale as 0059.

-- Trigram GIN indexes for the newly-searched columns (idempotent).
create index if not exists publications_title_trgm_idx
  on public.publications using gin (title gin_trgm_ops);
create index if not exists publications_title_km_trgm_idx
  on public.publications using gin (title_km gin_trgm_ops);
create index if not exists learning_paths_title_trgm_idx
  on public.learning_paths using gin (title gin_trgm_ops);
create index if not exists learning_paths_title_km_trgm_idx
  on public.learning_paths using gin (title_km gin_trgm_ops);

create or replace function public.search_library_fuzzy(
  query_text text,
  match_count int default 8,
  min_similarity real default 0.3
)
returns table (
  source     text,   -- 'book' | 'research' | 'publication' | 'catalog' | 'learning_path' | 'post'
  id         text,
  ref        text,   -- slug for book/catalog/post/publication/learning_path, id for research
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
        'publication'::text,
        p.id::text,
        p.slug,
        p.title,
        coalesce(p.journal_name, 'Publication'),
        coalesce(p.article_type, 'Publication'),
        p.cover_url,
        left(coalesce(p.abstract, ''), 300),
        greatest(
          word_similarity(query_text, p.title),
          word_similarity(query_text, coalesce(p.title_km, '')),
          word_similarity(query_text, coalesce(p.journal_name, ''))
        ) as similarity
      from public.publications p
      where p.is_published
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
        'learning_path'::text,
        lp.id::text,
        lp.slug,
        lp.title,
        'PTEC Library'::text,
        coalesce(lp.audience, 'Learning Path'),
        lp.cover_url,
        left(coalesce(lp.description, ''), 300),
        greatest(
          word_similarity(query_text, lp.title),
          word_similarity(query_text, coalesce(lp.title_km, '')),
          word_similarity(query_text, coalesce(lp.audience, ''))
        ) as similarity
      from public.learning_paths lp
      where lp.is_published
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
