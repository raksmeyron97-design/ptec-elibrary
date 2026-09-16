-- 0149_books_featured.sql
--
-- Editorial curation for e-books: "Featured by PTEC Library".
--
-- WHY THREE COLUMNS AND NOT `is_pinned`. A boolean can answer "is this book
-- featured?" and nothing else. The questions a librarian actually asks on
-- /admin/books/featured are "who chose this?", "when?" and "in what order do
-- readers see them?", and a boolean answers none of the three — it would put
-- provenance in the audit log only (where the page cannot render it beside the
-- row) and leave the public order to fall back on `created_at`, which is
-- merchandising by accident.
--
--   featured_at        when the book entered the shelf
--   featured_by        who put it there (profile FK, ON DELETE SET NULL — a
--                      staff account being removed must never take the shelf
--                      down with it, and must never corrupt the position)
--   featured_position  1-based public order, contiguous, maintained by
--                      public.set_featured_book_order() below
--
-- CURATION IS A THIRD AXIS, not a status. `status` stays the publication
-- lifecycle (0086) and `verified_at` stays the verification stamp (0062).
-- Featuring writes NONE of them, and unfeaturing writes none of them either:
-- removing a book from the shelf must leave it published, which is only
-- structurally guaranteed if the two facts live in different columns.
--
-- Eligibility (published AND verified) is enforced in
-- app/actions/featured-books.ts against lib/books/featured.ts, not by a CHECK:
-- a book that is later unpublished must not make its own row un-updatable, and
-- a constraint here would do exactly that on the next unrelated UPDATE.
--
-- Rollback:
--   drop function if exists public.set_featured_book_order(uuid[]);
--   drop view if exists public.books_with_stats;  -- then re-run 0131's body
--   alter table public.books
--     drop column featured_at, drop column featured_by, drop column featured_position;
-- Nothing is destroyed that this migration did not create.

alter table public.books
  add column if not exists featured_at       timestamptz,
  add column if not exists featured_by       uuid references public.profiles(id) on delete set null,
  add column if not exists featured_position integer;

comment on column public.books.featured_at is
  'When a librarian added this book to the public "Featured by PTEC Library" shelf. Null => not featured. Independent of status and verified_at: unfeaturing never unpublishes.';
comment on column public.books.featured_by is
  'Profile that featured the book. ON DELETE SET NULL — the shelf survives a staff account being removed; the admin_audit_log keeps the full provenance.';
comment on column public.books.featured_position is
  'Contiguous 1-based public ordering of the featured shelf. Maintained only by public.set_featured_book_order(); never written directly.';

-- Both halves of the fact, or neither. A position without a timestamp is a
-- book on the shelf that nothing can explain; a timestamp without a position
-- is a book the public ordering cannot place.
alter table public.books
  drop constraint if exists books_featured_consistent;
alter table public.books
  add constraint books_featured_consistent
  check ((featured_at is null) = (featured_position is null));

-- Two books cannot occupy one slot. Partial, because the overwhelming
-- majority of rows are not featured and null positions must not collide.
-- Deliberately NOT restricted to positive values: the renumber below parks
-- rows in the negative space for one statement to avoid a spurious violation
-- while positions are being swapped.
drop index if exists public.books_featured_position_key;
create unique index books_featured_position_key
  on public.books (featured_position)
  where featured_at is not null;

-- The public read: "featured books, in order". Index-only for the shelf.
drop index if exists public.books_featured_order_idx;
create index books_featured_order_idx
  on public.books (featured_position)
  where featured_at is not null;

-- ── Atomic renumber ──────────────────────────────────────────────────────
--
-- Reordering is one operation, not N updates: a client that renumbers row by
-- row collides with the unique index the moment two books swap, and a client
-- that renumbers in a loop leaves the shelf half-applied if it dies halfway.
--
-- The caller must name EXACTLY the set it saw. That is the concurrency
-- guard: if another librarian featured or unfeatured a book since the page
-- rendered, applying a stale order would silently move THEIR book, and the
-- first librarian would never learn it happened. A mismatch raises
-- 40001 (serialization failure), which the action turns into a "the shelf
-- changed, reload" message rather than a generic error.
create or replace function public.set_featured_book_order(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  featured_count integer;
  named_count    integer;
  supplied       integer := coalesce(array_length(p_ids, 1), 0);
begin
  select count(*) into featured_count from public.books where featured_at is not null;

  select count(*) into named_count
    from public.books b
   where b.featured_at is not null
     and b.id = any (p_ids);

  -- Three readings of one requirement: no book missing from the order, no
  -- book in the order that is not on the shelf, and no id listed twice.
  if featured_count <> supplied or named_count <> supplied then
    raise exception 'featured_set_changed' using errcode = '40001';
  end if;

  if supplied = 0 then
    return 0;
  end if;

  -- Park, then place. A single UPDATE that swaps two positions trips the
  -- unique index mid-statement (it is a plain index, so it cannot be
  -- deferred); negating first moves every live row out of the target range.
  update public.books
     set featured_position = -featured_position
   where featured_at is not null
     and featured_position > 0;

  update public.books b
     set featured_position = o.pos
    from unnest(p_ids) with ordinality as o(id, pos)
   where b.id = o.id
     and b.featured_at is not null;

  return supplied;
end;
$$;

-- Service-role only: PostgREST would otherwise let `anon` renumber the shelf.
revoke all on function public.set_featured_book_order(uuid[]) from public, anon, authenticated;

-- ── Version history: curation is audited, not snapshotted ────────────────
--
-- capture_content_version() writes a full row snapshot on any non-volatile
-- UPDATE. Reordering a twelve-book shelf would therefore write twelve
-- snapshots per save and bury the metadata edits the history exists for.
-- Curation already has a durable, actor-stamped record in admin_audit_log
-- (book.featured / book.unfeatured / book.feature_reordered), which is the
-- right home for it: version history answers "what did this field say
-- before?", the audit log answers "who did what, when".
--
-- Body identical to 0086's except for the three added column names.
create or replace function public.capture_content_version()
returns trigger
language plpgsql
as $$
declare
  volatile_cols constant text[] := array[
    'view_count', 'download_count', 'rating', 'embedding', 'updated_at',
    'updated_by', 'last_health_check',
    'featured_at', 'featured_by', 'featured_position'
  ];
  old_cmp jsonb := to_jsonb(old) - volatile_cols;
  new_cmp jsonb := to_jsonb(new) - volatile_cols;
begin
  if old_cmp = new_cmp then
    return new;
  end if;

  insert into public.content_versions
    (table_name, record_id, snapshot, changed_by, status_from, status_to)
  values (
    tg_table_name,
    old.id,
    to_jsonb(old) - 'embedding',
    nullif(to_jsonb(new) ->> 'updated_by', '')::uuid,
    to_jsonb(old) ->> 'status',
    to_jsonb(new) ->> 'status'
  );
  return new;
end;
$$;

-- ── books_with_stats ─────────────────────────────────────────────────────
--
-- The view lists its columns explicitly (0131's note: it must never expose
-- books.embedding), so new columns are invisible to the public listing until
-- it is recreated. The shelf reads its order from here, which is what keeps
-- the public /books query to one round trip.
--
-- featured_by is deliberately ABSENT. It is a staff profile id, the reader
-- has no use for it, and "Featured by PTEC Library" is an institutional
-- credit, not a personal one — publishing the individual librarian's id to
-- anon would be a disclosure with no reader-facing purpose.
--
-- Body below is 0131's, unchanged except for the two added columns.
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
