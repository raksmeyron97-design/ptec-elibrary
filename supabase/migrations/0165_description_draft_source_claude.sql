-- 0165_description_draft_source_claude.sql
--
-- A fourth draft source for the book description review queue (0164):
-- 'claude_cowork' — a description written by Claude in a supervised batch
-- (scripts/seo-cowork-descriptions.ts) from the book's metadata and its own
-- front-matter pages. It is a DRAFT like every other source: it lands in the
-- RLS-closed book_description_drafts table, books.description is untouched,
-- and only a librarian's approval in /admin/data-quality/descriptions
-- publishes it. Kept apart from 'ai_assisted' so a reviewer, and the audit,
-- can tell this batch from any other model's output.
--
-- Widening a CHECK only: no row changes, every existing value stays valid.

set local lock_timeout = '10s';

alter table public.book_description_drafts
  drop constraint if exists book_description_drafts_source_check;

alter table public.book_description_drafts
  add constraint book_description_drafts_source_check
  check (source in ('librarian', 'ai_assisted', 'extracted', 'claude_cowork'));
