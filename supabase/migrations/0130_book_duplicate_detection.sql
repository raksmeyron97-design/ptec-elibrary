-- 0130_book_duplicate_detection.sql
--
-- Indexed candidate generation for the upload gate, plus canonical-author
-- lookup for the author picker.
--
-- WHY THE DATABASE DOES RECALL AND TYPESCRIPT DOES PRECISION
--
-- The scoring rules (lib/books/duplicate-detection/signals.ts) are pure and
-- unit-tested, and they must stay the only definition of what a duplicate IS.
-- So nothing here scores anything: these functions return a BOUNDED candidate
-- set — the rows that could plausibly match — and the application decides.
--
-- The alternative, normalizing titles in SQL to match the TypeScript
-- normalizer exactly, was rejected: Postgres has no NFKD + Unicode-category
-- fold that agrees with `normalizeTitle()` character for character, so the two
-- would drift silently and the drift would look like "no duplicate found".
-- Trigram recall cannot drift that way — a near-miss just widens the candidate
-- set, and the scorer still refuses it.
--
-- COST. Each branch is separately indexed and separately capped, so the total
-- work per keystroke-debounced check is a handful of index lookups, never a
-- scan of the collection.
--
-- SECURITY. Both functions are SECURITY INVOKER (the default) and are granted
-- to service_role only — they are reached exclusively through admin Server
-- Actions that have already passed requirePermission("books", "write").
-- PostgREST exposes every public function to anon/authenticated by default,
-- which is precisely what the REVOKEs below undo: a public endpoint that
-- returns unpublished titles by fuzzy title match is a catalogue leak.

-- ── Indexes ────────────────────────────────────────────────────────────────

-- ISBN, compared as bare characters so hyphenation and spacing never decide
-- identity. regexp_replace/upper are IMMUTABLE, so this is a legal expression
-- index; the application supplies BOTH the ISBN-10 and ISBN-13 spellings of
-- the number it is checking (isbnMatchKeys), which is why the index only has
-- to store what the row literally holds.
create index if not exists books_isbn_digits_idx
  on public.books ((regexp_replace(upper(isbn), '[^0-9X]'::text, ''::text, 'g')))
  where isbn is not null;

-- Exact-title equality, case- and padding-insensitive. The trigram index
-- cannot serve this cheaply for short titles, and an exact title match must
-- never be missed because a similarity threshold was a hair too high.
create index if not exists books_title_lower_idx
  on public.books (lower(btrim(title)));

-- Canonical-author reuse: "did this exact person already get a row?"
--
-- NOT UNIQUE, deliberately. authors.name already carries a UNIQUE constraint,
-- but it is case-sensitive, so a collection that has accumulated both "John
-- Smith" and "john smith" is legal today. Adding UNIQUE here would fail the
-- migration on exactly the databases that need the feature most, and the
-- remedy would be deleting one of two rows that books point at. The picker
-- surfaces such pairs to a human instead (scripts/audit-book-duplicates.ts).
create index if not exists authors_name_lower_idx
  on public.authors (lower(btrim(name)));

comment on index public.authors_name_lower_idx is
  'Case-folded author lookup for the upload form''s author picker. Not unique: pre-existing casing variants are real rows with real books attached and are resolved by a human, never by a constraint.';

-- ── Candidate generation ───────────────────────────────────────────────────

create or replace function public.find_book_duplicate_candidates(
  p_title        text default null,
  p_isbn_keys    text[] default null,
  p_author       text default null,
  p_content_hash text default null,
  p_exclude_id   uuid default null,
  p_limit        int default 25
)
returns table (
  id            uuid,
  slug          text,
  title         text,
  author        text,
  isbn          text,
  publisher     text,
  year          int,
  content_hash  text,
  status        text,
  is_published  boolean,
  cover_url     text,
  match_source  text
)
language sql
stable
set search_path = public, extensions
-- NO `set pg_trgm.word_similarity_threshold` HERE, deliberately. A SET clause
-- is validated when the function is CREATED, and a custom GUC belonging to an
-- extension is only registered once that extension's library has been loaded
-- into the session — so a migration that happens to be the first thing to
-- touch pg_trgm fails with "permission denied to set parameter" on a database
-- where nothing loaded it first. Verified against the local stack. The `%>`
-- operator below therefore runs at the server default, which is a RECALL
-- setting, not a decision: everything it returns is scored properly in
-- TypeScript, and a looser or tighter default only changes how many
-- non-matches are examined and discarded.
as $$
  with hash_hits as (
    select b.id, 'content_hash'::text as src
      from public.books b
      join public.book_files f on f.book_id = b.id
     where coalesce(p_content_hash, '') <> ''
       and f.content_hash = p_content_hash
     limit 5
  ),
  isbn_hits as (
    select b.id, 'isbn'::text as src
      from public.books b
     where p_isbn_keys is not null
       and array_length(p_isbn_keys, 1) > 0
       and b.isbn is not null
       and regexp_replace(upper(b.isbn), '[^0-9X]'::text, ''::text, 'g') = any (p_isbn_keys)
     limit 10
  ),
  exact_title_hits as (
    select b.id, 'exact_title'::text as src
      from public.books b
     where coalesce(btrim(p_title), '') <> ''
       and lower(btrim(b.title)) = lower(btrim(p_title))
     limit 10
  ),
  fuzzy_title_hits as (
    select b.id, 'fuzzy_title'::text as src
      from public.books b
     where char_length(coalesce(btrim(p_title), '')) >= 4
       and b.title %> p_title
     order by word_similarity(p_title, b.title) desc
     limit 20
  ),
  -- The truncated-title duplicate: the same work catalogued once in full and
  -- once cut short. Word similarity scores that pair poorly (most of the long
  -- title is unshared), so it needs its own branch. ILIKE 'prefix%' is served
  -- by the same trigram GIN index.
  prefix_title_hits as (
    select b.id, 'title_prefix'::text as src
      from public.books b
     where char_length(coalesce(btrim(p_title), '')) >= 8
       and b.title ilike
           replace(replace(replace(btrim(p_title), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%'
     limit 10
  ),
  -- The same work re-catalogued with a heavily rewritten title is invisible to
  -- both title branches; its author is not. Bounded and newest-first, so a
  -- prolific author cannot drag the whole collection into the candidate set.
  author_hits as (
    select b.id, 'author'::text as src
      from public.books b
      join public.authors a on a.id = b.author_id
     where coalesce(btrim(p_author), '') <> ''
       and lower(btrim(a.name)) = lower(btrim(p_author))
     order by b.created_at desc
     limit 20
  ),
  candidates as (
    select u.id, string_agg(distinct u.src, ',' order by u.src) as src
      from (
        select * from hash_hits
        union all select * from isbn_hits
        union all select * from exact_title_hits
        union all select * from fuzzy_title_hits
        union all select * from prefix_title_hits
        union all select * from author_hits
      ) u
     group by u.id
  )
  select
    b.id,
    b.slug,
    b.title,
    a.name,
    b.isbn,
    b.publisher,
    extract(year from b.published_at)::int,
    (select f.content_hash
       from public.book_files f
      where f.book_id = b.id
        and f.content_hash is not null
      limit 1),
    b.status,
    b.is_published,
    b.cover_url,
    c.src
    from candidates c
    join public.books b on b.id = c.id
    left join public.authors a on a.id = b.author_id
   where p_exclude_id is null or b.id <> p_exclude_id
   limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

comment on function public.find_book_duplicate_candidates is
  'Bounded candidate set for duplicate scoring. Returns rows that COULD match; lib/books/duplicate-detection/signals.ts decides whether they do. Service-role only.';

-- ── Canonical authors ──────────────────────────────────────────────────────

create or replace function public.search_book_authors(
  p_query text default null,
  p_limit int default 8
)
returns table (
  id         uuid,
  name       text,
  book_count bigint,
  match_kind text
)
language sql
stable
set search_path = public, extensions
as $$
  with needle as (
    select
      btrim(coalesce(p_query, '')) as raw,
      -- LIKE metacharacters in a librarian's typing are literal text, not
      -- pattern syntax. Backslash first, or the escapes get re-escaped.
      replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') as pattern
  ),
  matched as (
    select
      a.id,
      a.name,
      case
        when lower(btrim(a.name)) = lower(n.raw) then 'exact'
        when a.name ilike n.pattern || '%' then 'prefix'
        when a.name ilike '%' || n.pattern || '%' then 'contains'
        else 'fuzzy'
      end as match_kind,
      similarity(a.name, n.raw) as sim
      from public.authors a
     cross join needle n
     where char_length(n.raw) >= 1
       and (a.name ilike '%' || n.pattern || '%' or a.name %> n.raw)
  )
  select
    m.id,
    m.name,
    (select count(*) from public.books b where b.author_id = m.id) as book_count,
    m.match_kind
    from matched m
   order by
     case m.match_kind
       when 'exact' then 0
       when 'prefix' then 1
       when 'contains' then 2
       else 3
     end,
     m.sim desc nulls last,
     m.name
   limit greatest(1, least(coalesce(p_limit, 8), 25));
$$;

comment on function public.search_book_authors is
  'Author autocomplete for the book upload/edit forms. Returns existing canonical authors with how many books each holds, ranked exact → prefix → contains → fuzzy. Never merges anything. Service-role only.';

-- ── Grants ─────────────────────────────────────────────────────────────────
-- PostgREST publishes every public-schema function to anon and authenticated
-- by default. Both of these read unpublished rows, so both are closed.

revoke all on function public.find_book_duplicate_candidates(text, text[], text, text, uuid, int) from public, anon, authenticated;
revoke all on function public.search_book_authors(text, int) from public, anon, authenticated;

grant execute on function public.find_book_duplicate_candidates(text, text[], text, text, uuid, int) to service_role;
grant execute on function public.search_book_authors(text, int) to service_role;
