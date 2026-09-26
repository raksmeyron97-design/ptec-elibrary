-- 0158_catalog_books_nullable_drift.sql
--
-- Production's catalog_books refused NULL in columns the migration chain has
-- always declared nullable (00000000000000_initial_schema.sql: `author text`,
-- `category text`, `created_by uuid … ON DELETE SET NULL`). The chain never
-- created those constraints; they are drift, like the dashboard-made
-- created_by column the baseline already records. Nothing noticed while every
-- record came through the admin form, which always supplies an author.
--
-- The Koha sync (0157, docs/KOHA-SYNC.md) does not: it copies what Koha holds.
-- The first production build failed with
--   null value in column "author" of relation "catalog_books" violates not-null constraint
-- on the 122 PMB titles Koha holds with no author (none in PMB, or a byline
-- that names nobody — lib/resources/contributor-trust.ts). Two more columns
-- carry NULL from the sync and were never proven nullable in production,
-- because every row carrying one fell in a rejected batch or has not been
-- written yet:
--   category    92 Koha records have no 653 (PMB class label);
--   created_by  records the SCHEDULED sync creates have no person behind them.
--
-- Restating the chain's intent is idempotent: DROP NOT NULL on a nullable
-- column is a no-op, so this changes nothing on any database built from the
-- chain (local, CI) and removes only the drifted constraints in production.
-- Public pages already render a record with no author (no byline).

alter table public.catalog_books alter column author     drop not null;
alter table public.catalog_books alter column category   drop not null;
alter table public.catalog_books alter column created_by drop not null;
