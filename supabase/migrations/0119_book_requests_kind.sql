-- 0119_book_requests_kind.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- One queue, two directions.
--
-- `book_requests` has so far modelled a single act: a reader asking the library
-- to ACQUIRE something it does not have. The homepage now also invites the
-- opposite act — a PTEC student or lecturer offering their own thesis for the
-- library to take in. Both are "a person tells the librarian about a work that
-- should be in the collection", both need the same fields (title, author, a
-- note), the same anti-spam ceiling, the same pending → approved → added
-- lifecycle, and the same human sitting in /admin/book-requests deciding.
--
-- So this is a column, not a table. A parallel `thesis_deposits` table would
-- have duplicated the RLS, the trigger, the status CHECK and the admin screen,
-- and would have split one librarian's inbox in two.
--
-- `kind` is NOT NULL with a default, and the backfill is implicit: every
-- existing row predates the deposit flow and is therefore an acquisition, which
-- is exactly what the default gives it. No UPDATE needed.
--
--   acquisition — "please add this book"     (reader → library, library sources it)
--   deposit     — "please take my thesis"    (author → library, author supplies it)
--
-- `source_url` exists only for deposits: somewhere the librarian can fetch the
-- file (Drive, institutional repository, an email reference). It is deliberately
-- a free-text link rather than an upload — accepting anonymous file uploads into
-- the storage bucket is a different security problem and is not solved here.
-- The deposit conversation continues by email/phone from the admin queue.
--
-- RLS is untouched: the existing users_read_own / users_insert_own /
-- service_role_all policies already cover the new column, and `kind` carries no
-- privilege of its own.
--
-- Rollback:
--   ALTER TABLE public.book_requests DROP COLUMN source_url;
--   ALTER TABLE public.book_requests DROP COLUMN kind;

ALTER TABLE public.book_requests
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'acquisition';

-- Added separately from the column so re-running the migration cannot end up
-- with two identically-named constraints.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'book_requests_kind_check'
  ) THEN
    ALTER TABLE public.book_requests
      ADD CONSTRAINT book_requests_kind_check
      CHECK (kind IN ('acquisition', 'deposit'));
  END IF;
END $$;

ALTER TABLE public.book_requests
  ADD COLUMN IF NOT EXISTS source_url text;

-- The admin queue's default view is "pending, newest first", and the deposit
-- filter is the one new axis it gained. Partial on pending because that is the
-- only status anyone filters by in practice.
CREATE INDEX IF NOT EXISTS book_requests_kind_pending_idx
  ON public.book_requests (kind, created_at DESC)
  WHERE status = 'pending';

COMMENT ON COLUMN public.book_requests.kind IS
  'acquisition = reader asks the library to source a work; deposit = author offers their own work to the collection.';
COMMENT ON COLUMN public.book_requests.source_url IS
  'Deposits only: where the librarian can retrieve the submitted file. Never an uploaded path.';
