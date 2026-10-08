-- 0174_book_rights.sql
--
-- A PRIVATE record of the basis on which the library may share each book
-- (SEO audit 2026-10, WI-5 / P0-3).
--
-- Nothing in the application could say which books PTEC may open to anonymous
-- readers: the MoEYS curriculum, PTEC's own publications and openly licensed
-- material are mixed with commercial textbooks, and every book sits behind a
-- sign-in. This table is where a librarian records the answer, one book at a
-- time or as an explicitly filtered set. No public surface reads it; a later,
-- separately approved decision (D-A) may let a public surface read the
-- DECISION derived from it — never the basis, the evidence or the reason.
--
--   basis          what a librarian CONFIRMED. NULL until reviewed.
--   draft_basis    what a rule proposed (lib/books/rights-draft.ts). A draft
--                  is never a decision.
--   draft_source   which rule, e.g. 'rule:moeys_publisher'.
--   evidence       the reviewer's note, optional.
--   reviewed_by / reviewed_at   who confirmed, and when.
--
-- 'unknown' is a real answer ("we looked and cannot tell"). Every consumer
-- treats a missing row, an unreviewed row and 'unknown' as 'commercial'
-- (lib/books/rights.ts) — the restrictive reading is the default.
--
-- RLS on and revoked from public/anon/authenticated: the service role (the
-- registry-guarded admin actions) is the only reader and writer. Rights
-- material per title must not reach a view, a column grant, a sitemap, JSON-LD
-- or a log (lib/books/rights-boundary.test.ts).
--
-- Rollback: drop table public.book_rights;

set local lock_timeout = '10s';

create table if not exists public.book_rights (
  book_id      uuid primary key references public.books (id) on delete cascade,
  basis        text check (basis in ('ptec_original', 'government_public', 'open_licence', 'commercial', 'unknown')),
  draft_basis  text check (draft_basis in ('ptec_original', 'government_public', 'open_licence', 'commercial', 'unknown')),
  evidence     text check (evidence is null or char_length(evidence) <= 2000),
  draft_source text check (draft_source is null or char_length(draft_source) <= 80),
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- A basis exists exactly when someone reviewed it.
  constraint book_rights_reviewed check ((basis is null) = (reviewed_at is null))
);

alter table public.book_rights enable row level security;
revoke all on table public.book_rights from public, anon, authenticated;

create index if not exists book_rights_unreviewed_idx
  on public.book_rights (draft_basis, draft_source) where basis is null;
