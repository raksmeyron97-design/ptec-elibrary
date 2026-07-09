-- 0080_advanced_search_engine.sql
-- Advanced global search support:
--   * richer search query analytics fields
--   * click analytics for conversion / most-clicked-result reports
--   * publication-aware PDF page indexing
--   * trigram indexes and fuzzy fallback coverage for publications

alter table public.search_queries
  add column if not exists query_language text,
  add column if not exists resource_type text,
  add column if not exists sort text;

create index if not exists search_queries_language_idx
  on public.search_queries (query_language, searched_at desc);

create index if not exists search_queries_resource_type_idx
  on public.search_queries (resource_type, searched_at desc);

create table if not exists public.search_result_clicks (
  id              uuid        primary key default gen_random_uuid(),
  term            text        not null,
  normalized_term text        generated always as (lower(trim(term))) stored,
  query_language  text,
  result_type     text        not null check (result_type in ('book', 'research', 'publication', 'catalog', 'post')),
  result_id       text        not null,
  result_url      text        not null,
  result_title    text,
  action          text        not null default 'view',
  clicked_at      timestamptz not null default now()
);

create index if not exists search_clicks_term_idx
  on public.search_result_clicks (normalized_term, clicked_at desc);

create index if not exists search_clicks_result_idx
  on public.search_result_clicks (result_type, result_id, clicked_at desc);

alter table public.search_result_clicks enable row level security;

-- Service-role only. Public requests write through /api/search/click.

alter table public.book_pages
  drop constraint if exists book_pages_record_type_check;

alter table public.book_pages
  add constraint book_pages_record_type_check
  check (record_type in ('book', 'research', 'publication'));

create index if not exists publications_title_trgm_idx
  on public.publications using gin (title gin_trgm_ops);
create index if not exists publications_title_km_trgm_idx
  on public.publications using gin (title_km gin_trgm_ops);
create index if not exists publications_abstract_trgm_idx
  on public.publications using gin (abstract gin_trgm_ops);
create index if not exists publications_abstract_km_trgm_idx
  on public.publications using gin (abstract_km gin_trgm_ops);
create index if not exists publication_authors_full_name_trgm_idx
  on public.publication_authors using gin (full_name gin_trgm_ops);
create index if not exists publication_authors_full_name_km_trgm_idx
  on public.publication_authors using gin (full_name_km gin_trgm_ops);

create or replace function public.search_library_fuzzy(
  query_text text,
  match_count int default 8,
  min_similarity real default 0.3
)
returns table (
  source     text,
  id         text,
  ref        text,
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
        coalesce(a.name, 'Unknown')              as author,
        coalesce(c.name, b.department, 'E-Book') as category,
        b.cover_url,
        left(coalesce(b.description, ''), 300)   as excerpt,
        greatest(
          word_similarity(query_text, b.title),
          word_similarity(query_text, coalesce(a.name, ''))
        ) as similarity
      from public.books b
      left join public.authors a on a.id = b.author_id
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
        coalesce(r.slug, r.id::text),
        r.title,
        coalesce(r.author_names, 'Unknown'),
        coalesce(r.subject, r.program, 'Thesis'),
        r.cover_url,
        left(coalesce(r.abstract, ''), 300),
        greatest(
          word_similarity(query_text, r.title),
          word_similarity(query_text, coalesce(r.author_names, '')),
          word_similarity(query_text, coalesce(r.advisor_name, ''))
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
        coalesce(
          (
            select string_agg(pa.full_name, ', ' order by pas.author_order)
            from public.publication_authorships pas
            join public.publication_authors pa on pa.id = pas.author_id
            where pas.publication_id = p.id
          ),
          'Unknown'
        ),
        coalesce(p.journal_name, p.article_type, 'Publication'),
        p.cover_url,
        left(coalesce(p.abstract, p.abstract_km, ''), 300),
        greatest(
          word_similarity(query_text, p.title),
          word_similarity(query_text, coalesce(p.title_km, '')),
          word_similarity(query_text, coalesce(p.abstract, '')),
          word_similarity(query_text, coalesce(p.abstract_km, ''))
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
