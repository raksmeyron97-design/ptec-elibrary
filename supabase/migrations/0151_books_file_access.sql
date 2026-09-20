-- 0151_books_file_access.sql
--
-- "Catalogue record only": a librarian may publish a book's bibliographic
-- record while the library distributes no file for it at all.
--
-- ── Why a third VALUE and not a second boolean ───────────────────────────────
--
-- 0131 gave books `allow_download`, which answers one question: may the reader
-- keep a copy? It cannot answer the new one: may the library serve the bytes
-- at all? A second boolean would make the two axes four states, two of which
-- mean nothing ("no download but yes catalogue-only"?), and two booleans can
-- disagree. One ordered column cannot:
--
--     public          read online, download, quote, harvest       (today)
--     read_online     read online only                            (= 0131 false)
--     catalogue_only  the record stands; no route serves the file
--
-- ── Backward compatibility: the 0111 mirror, not a rename ────────────────────
--
-- `allow_download` STAYS, and a trigger keeps it in step. 34 files read that
-- flag today — the detail page, the read page, the download route, search,
-- OAI, the metadata exports, the admin forms — and every one of them stays
-- correct with no edit, exactly as `learning_paths.is_published` did when
-- 0111 introduced `status`. New code reads `file_access`.
--
-- The mirror is deliberately NOT symmetric. A writer that knows only about
-- `allow_download` may tighten, and may restore what it itself tightened, but
-- it may never loosen a restriction it cannot see: setting allow_download =
-- true on a catalogue_only row RAISES, naming the column to use instead. A
-- rights withdrawal must not be undone by a legacy code path that predates
-- the concept.
--
-- The backfill writes today's behaviour row for row, so APPLYING THIS CHANGES
-- NOTHING. No book becomes restricted until a librarian says so.
--
-- Rollback:
--   drop trigger if exists books_file_access_mirror on public.books;
--   drop function if exists public.books_file_access_mirror();
--   alter table public.books drop column file_access;
--   drop view if exists public.books_with_stats;   -- then re-run 0149's body
-- No data is destroyed that this migration did not create.

alter table public.books
  add column if not exists file_access text not null default 'public';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'books_file_access_check'
  ) then
    alter table public.books
      add constraint books_file_access_check
      check (file_access in ('public', 'read_online', 'catalogue_only'));
  end if;
end $$;

-- Today's behaviour, row for row.
update public.books
   set file_access = case when allow_download then 'public' else 'read_online' end
 where file_access = 'public' and allow_download is distinct from true;

comment on column public.books.file_access is
  'Authoritative file policy. public => read + download; read_online => viewer only, no file handed over; catalogue_only => the bibliographic record stands and NO public route serves the bytes (no reader, no download, no citation_pdf_url, no OAI fileUrl, and the text may not ground an AI answer). allow_download is mirrored from this column by a trigger and must not be written directly.';

-- ── The mirror ───────────────────────────────────────────────────────────────

create or replace function public.books_file_access_mirror()
returns trigger
language plpgsql
as $$
begin
  -- A write that names file_access is authoritative: derive the legacy flag.
  if tg_op = 'INSERT' or new.file_access is distinct from old.file_access then
    new.allow_download := (new.file_access = 'public');
    return new;
  end if;

  -- A legacy write that names only allow_download. Map it, but never let it
  -- loosen a restriction it does not know about.
  if new.allow_download is distinct from old.allow_download then
    if new.allow_download then
      if old.file_access = 'catalogue_only' then
        raise exception
          'allow_download cannot re-enable a catalogue_only book (book %). Set books.file_access instead.',
          old.id
          using errcode = 'check_violation';
      end if;
      if old.file_access = 'read_online' then
        new.file_access := 'public';
      end if;
    else
      -- Tightening. Only 'public' has anywhere to fall to; the stricter
      -- states are already at least this restricted, so this is a no-op
      -- rather than a loosening of catalogue_only to read_online.
      if old.file_access = 'public' then
        new.file_access := 'read_online';
      end if;
      new.allow_download := false;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists books_file_access_mirror on public.books;
create trigger books_file_access_mirror
  before insert or update of file_access, allow_download on public.books
  for each row execute function public.books_file_access_mirror();

-- ── books_with_stats ─────────────────────────────────────────────────────────
--
-- The view lists its columns explicitly (0131's note: it must never expose
-- books.embedding), so file_access is invisible to the public listing until
-- it is recreated. Body below is 0149's, unchanged except for the added
-- column — starting from 0131's would silently drop the curation columns.
drop view if exists public.books_with_stats;

create view public.books_with_stats
with (security_invoker = true)
as
select
  b.id, b.title, b.slug, b.description, b.author_id, b.category_id,
  b.department, b.isbn, b.language, b.published_at, b.is_published,
  b.rating, b.pages, b.cover_color, b.cover_url, b.download_count,
  b.view_count, b.tags, b.created_at, b.department_id,
  b.allow_download,
  b.file_access,
  b.featured_at, b.featured_position,
  coalesce(r.review_count, 0)::int as review_count,
  r.avg_rating
from public.books b
left join (
  select
    book_id,
    count(*)::int as review_count,
    avg(rating)   as avg_rating
  from public.reviews
  group by book_id
) r on r.book_id = b.id;

grant select on public.books_with_stats to anon, authenticated;

-- ── match_book_chunks: exclude withdrawn books from the CANDIDATE set ───────
--
-- The application already drops restricted rows after retrieval, which is
-- what makes the boundary correct. This makes it cheap as well: without it a
-- withdrawn book still consumes candidate slots, and the withdrawn books are
-- precisely the well-written textbooks that match a query best — so a handful
-- of them could crowd out every passage the reader is allowed to see, and the
-- answer would degrade with no visible cause.
--
-- The filter sits inside the candidate CTE, the same place 0135 put the
-- record scope, so it bounds the ANN scan rather than the result.
--
-- DROP then CREATE, not CREATE OR REPLACE: a fourth parameter — even a
-- defaulted one — is a different signature, so a replace would leave TWO
-- overloads and every existing 3-argument call would become ambiguous
-- (42725) rather than resolving to either.
drop function if exists public.match_book_chunks(vector, int, float);

create or replace function public.match_book_chunks(
  query_embedding vector(768),
  match_count int default 8,
  min_similarity float default 0.30,
  p_exclude_ids uuid[] default '{}'
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
    where not (c.record_type = 'book' and c.record_id = any(p_exclude_ids))
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

-- Called only through the service-role client.
revoke execute on function public.match_book_chunks(vector, int, float, uuid[]) from public, anon, authenticated;
grant  execute on function public.match_book_chunks(vector, int, float, uuid[]) to service_role;
