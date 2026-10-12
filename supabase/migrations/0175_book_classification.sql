-- 0175_book_classification.sql
--
-- What a book IS — its resource type, grade and part — as data a librarian
-- confirmed (SEO audit 2026-10, WI-6 / P1-2; owner decision D-C = yes).
--
-- No record said whether a book is a student textbook, a teacher's guide, an
-- answer key or an exam paper, or which grade it is for, though most of the
-- collection's titles state it. A rule can READ that from a title; only a
-- librarian may ASSERT it. So:
--
--   books.resource_type / grade_from / grade_to / part_no
--       the CONFIRMED values. Written only by the confirm action
--       (confirmBookClassification); NULL means unknown, never a default.
--   books.classification_status   'none' | 'draft' | 'confirmed'.
--       'confirmed' is the only state any future public reader may use.
--       This migration adds no public reader.
--   books.classification_reviewed_by / _at   who confirmed, and when.
--   book_classification_drafts     what a rule proposed, private (RLS on,
--       revoked) — `books` is anon-readable and an unreviewed draft must not be.
--
-- Additive and defaulted: every existing reader and writer keeps working.
--
-- Rollback:
--   drop table public.book_classification_drafts;
--   alter table public.books drop constraint if exists books_resource_type_check,
--     drop constraint if exists books_grade_check, drop constraint if exists books_part_check,
--     drop constraint if exists books_classification_status_check,
--     drop column if exists resource_type, drop column if exists grade_from,
--     drop column if exists grade_to, drop column if exists part_no,
--     drop column if exists classification_status,
--     drop column if exists classification_reviewed_by,
--     drop column if exists classification_reviewed_at;

set local lock_timeout = '10s';

alter table public.books
  add column if not exists resource_type text,
  add column if not exists grade_from smallint,
  add column if not exists grade_to smallint,
  add column if not exists part_no smallint,
  add column if not exists classification_status text not null default 'none',
  add column if not exists classification_reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists classification_reviewed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'books_resource_type_check' and conrelid = 'public.books'::regclass) then
    alter table public.books add constraint books_resource_type_check check (resource_type in (
      'student_textbook', 'teacher_guide', 'answer_key', 'supplementary', 'homework_exercise', 'exam_paper',
      'lesson_plan', 'curriculum', 'lab_manual', 'children_reader', 'reference', 'research_report', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'books_grade_check' and conrelid = 'public.books'::regclass) then
    alter table public.books add constraint books_grade_check check (
      (grade_from is null or grade_from between 0 and 12)
      and (grade_to is null or grade_to between 0 and 12)
      and (grade_from is null or grade_to is null or grade_to >= grade_from));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'books_part_check' and conrelid = 'public.books'::regclass) then
    alter table public.books add constraint books_part_check check (part_no is null or part_no > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'books_classification_status_check' and conrelid = 'public.books'::regclass) then
    alter table public.books add constraint books_classification_status_check
      check (classification_status in ('none', 'draft', 'confirmed'));
  end if;
end $$;

create table if not exists public.book_classification_drafts (
  book_id       uuid primary key references public.books (id) on delete cascade,
  resource_type text check (resource_type in (
      'student_textbook', 'teacher_guide', 'answer_key', 'supplementary', 'homework_exercise', 'exam_paper',
      'lesson_plan', 'curriculum', 'lab_manual', 'children_reader', 'reference', 'research_report', 'other')),
  grade_from    smallint check (grade_from between 0 and 12),
  grade_to      smallint check (grade_to between 0 and 12),
  part_no       smallint check (part_no > 0),
  rule          text not null check (char_length(rule) <= 120),
  created_at    timestamptz not null default now(),
  constraint book_classification_drafts_grade_order check (grade_from is null or grade_to is null or grade_to >= grade_from)
);

alter table public.book_classification_drafts enable row level security;
revoke all on table public.book_classification_drafts from public, anon, authenticated;

-- A confirm is a real metadata edit, so it is NOT added to the volatile list
-- of capture_content_version() (0149): one version snapshot per confirm is the
-- history a librarian would want.
