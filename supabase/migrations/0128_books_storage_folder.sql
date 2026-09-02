-- 0128_books_storage_folder.sql
--
-- Record WHERE a book's files live, instead of re-deriving it from the title.
--
-- THE BUG THIS FIXES
--
-- A book's Zima folder is `books/<category>/<title-slug>-<uid>`, built at
-- upload time by lib/book-utils.ts → bookFolder(). Nothing stored it, so every
-- later write had to reconstruct it — and reconstruction is not possible:
--
--   * the `uid` is random, so it cannot be recomputed at all;
--   * the title slug is now TRUNCATED to fit Zima's 80-character-per-segment
--     cap, so even the recoverable part is lossy;
--   * an admin who edits the title changes the input the reconstruction reads,
--     so the recomputed folder names a directory that never existed.
--
-- The edit form worked around this by recovering the folder from the cover URL
-- (bookFolderFromCoverUrl) and, when a book had no cover, falling back to
-- bookFolder(category, title, makeUid()) — i.e. it minted a BRAND-NEW folder
-- on every PDF replacement, scattering one book's files across directories.
--
-- WHY A COLUMN AND NOT A DERIVED VALUE
--
-- The folder is a fact about what was written to disk, not a function of the
-- current row. It must survive a title change, a category change, a slug
-- change and a truncation-rule change, because none of those move the bytes.
--
-- BACKFILL
--
-- Existing rows recover it from a stored URL, which is authoritative: both
-- shapes are `.../files/books/<cat>/<folder>/<file>` (Zima) or the same key
-- bare (legacy R2). Rows whose files are flat/legacy match neither pattern and
-- are left NULL — callers keep the existing bookFolderFromCoverUrl() fallback
-- for those, so nothing regresses.

alter table public.books
  add column if not exists storage_folder text;

comment on column public.books.storage_folder is
  'Zima Storage folder holding this book''s files, e.g. "books/research/a-title-jm0p7tqz". Written once at upload; NEVER recomputed from the title (the uid is random and the slug is truncated). NULL for legacy rows with a flat storage layout.';

-- Backfill from book_files.file_url, else books.cover_url. Both shapes end in
-- `books/<cat>/<folder>/<filename>`, whether they are full Zima URLs or bare
-- legacy keys, so one end-anchored pattern covers both without caring about
-- the origin or the `/files/` prefix. `substring(x from '(...)...')` returns
-- the first capture group, or NULL when the pattern does not match — which is
-- exactly the "leave flat legacy rows alone" behaviour we want.
--
--   https://cdn…/files/books/research/a-title-jm0p7tqz/book.pdf
--                           └──────── captured ───────┘
--   books/some-flat-legacy-file.pdf   → no match → NULL
with recovered as (
  select
    b.id,
    coalesce(
      substring(
        (select bf.file_url
           from public.book_files bf
          where bf.book_id = b.id
            and bf.file_url is not null
          order by bf.created_at asc nulls last
          limit 1)
        from '(books/[^/]+/[^/]+)/[^/]+$'
      ),
      substring(b.cover_url from '(books/[^/]+/[^/]+)/[^/]+$')
    ) as folder
  from public.books b
)
update public.books b
   set storage_folder = r.folder
  from recovered r
 where r.id = b.id
   and r.folder is not null
   and b.storage_folder is null;

-- Not unique: two books legitimately share a folder only if something went
-- wrong, but enforcing it would fail the migration on existing data rather
-- than surface the problem. scripts/audit-book-storage.ts reports duplicates.
create index if not exists books_storage_folder_idx
  on public.books (storage_folder)
  where storage_folder is not null;
