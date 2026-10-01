-- 0164_book_description_review.sql
--
-- A review queue for book descriptions (SEO programme Phase 5.2, finding F3).
--
-- 1,530 of 1,956 published books share a description template with four or
-- more others (docs/seo/description-quality.md): the same sentence with the
-- title swapped in. A better description is a librarian's job; this lets one
-- be drafted, reviewed and published without touching the live text until
-- someone approves it.
--
-- The DRAFTS live in their own table, not on `books`: `books` is readable by
-- anon through PostgREST, and a draft is unreviewed text that must not be
-- fetchable by anyone before a librarian has approved it. The table is RLS-on
-- and revoked from anon and authenticated; only the service role (the admin
-- actions) reads or writes it.
--
--   book_description_drafts.draft_en / draft_km   the proposed descriptions.
--   book_description_drafts.source   'librarian' | 'ai_assisted' (a model
--                                    drafted it; D7 keeps that off) |
--                                    'extracted' (built by rule from the
--                                    book's own contents pages).
--   books.description_status         'none' (default) | 'draft' | 'approved'.
--                                    Only an approval copies a draft into
--                                    `description` — the draft in the book's
--                                    own language (`books` has one description
--                                    column).
--   books.description_reviewed_by / _at   who approved, and when.
--
-- Additive and defaulted: every existing reader and writer keeps working,
-- and every book starts as 'none'.

alter table public.books
  add column if not exists description_status text not null default 'none',
  add column if not exists description_reviewed_by uuid,
  add column if not exists description_reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'books_description_status_check' and conrelid = 'public.books'::regclass
  ) then
    alter table public.books
      add constraint books_description_status_check
      check (description_status in ('none', 'draft', 'approved'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'books_description_reviewed_by_fkey' and conrelid = 'public.books'::regclass
  ) then
    alter table public.books
      add constraint books_description_reviewed_by_fkey
      foreign key (description_reviewed_by) references public.profiles (id) on delete set null;
  end if;
end $$;

create table if not exists public.book_description_drafts (
  book_id uuid primary key references public.books (id) on delete cascade,
  draft_en text,
  draft_km text,
  source text not null default 'librarian'
    check (source in ('librarian', 'ai_assisted', 'extracted')),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.book_description_drafts enable row level security;
revoke all on public.book_description_drafts from public, anon, authenticated;

comment on table public.book_description_drafts is
  'Unreviewed description drafts (SEO Phase 5.2). Service role only — never readable by anon.';
comment on column public.books.description_status is
  'none | draft | approved. Approval copies the draft in the book''s own language into description.';
comment on column public.books.description_reviewed_by is 'Profile that approved the description.';
comment on column public.books.description_reviewed_at is 'When the description was approved.';
