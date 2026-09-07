-- 0140_catalog_books_ddc.sql
-- Dewey Decimal Classification for the physical catalog.
--
-- Context: catalog_books had no classification column at all, so a DDC value
-- coming out of PMB had nowhere to live and was being forced into
-- shelf_location. Those are different facts about different things:
-- shelf_location is a physical shelf/rack code (where the object sits), DDC is
-- a subject classification (what the work is about). One book can move shelves
-- without changing class, and two books on one shelf can hold different
-- classes. This adds the missing column; shelf_location is untouched, and
-- nothing is backfilled from it — the incoming exports carry ddc in its own
-- column and deliberately leave shelf_location blank for librarians to fill in.
--
-- Length: 80 characters, matching the existing call_number cap in
-- lib/catalog.ts MAX_TEXT. Measured against the real PMB export (13,429
-- non-empty values): the longest is 63 characters, none exceeds 80, but 52
-- exceed 32 — so a 32-char cap would have truncated real catalogue data.
--
-- No format constraint on purpose. Real values include plain classes
-- ("372.7"), class + author mark ("372.7 BIL", "660 គីម"), Khmer local codes
-- ("ស.គ", "ប.ល") and hand-written composites ("428 - ស្តង់ដា… / Standard
-- English Usage GRA"). A numeric-only pattern would reject the collection it
-- exists to describe. The app trims and collapses whitespace and stores NULL
-- for blank (lib/catalog.ts validateDdc).
--
-- Purely additive and idempotent: the column is nullable with no default, so
-- pre-migration rows keep working and every reader treats NULL as "unclassified".
-- No RLS change needed — catalog_books already carries its policies (public
-- SELECT, admin manage) and a new column inherits them.

ALTER TABLE public.catalog_books
  ADD COLUMN IF NOT EXISTS ddc text;

-- Length guard. Wrapped so re-running the migration is safe (ADD CONSTRAINT
-- has no IF NOT EXISTS), matching the 0095 idiom.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalog_books_ddc_len'
  ) THEN
    ALTER TABLE public.catalog_books
      ADD CONSTRAINT catalog_books_ddc_len
      CHECK (ddc IS NULL OR char_length(ddc) <= 80);
  END IF;
END $$;

-- Equality / ORDER BY (the admin catalog list sorts by DDC).
CREATE INDEX IF NOT EXISTS catalog_books_ddc_idx
  ON public.catalog_books (ddc);

-- Substring search. Every catalog filter in the app is `ilike '%q%'` (admin
-- list, public list, native search) — never a prefix match — so a
-- text_pattern_ops prefix index would never be used. pg_trgm is already
-- installed (0059).
CREATE INDEX IF NOT EXISTS catalog_books_ddc_trgm_idx
  ON public.catalog_books USING gin (ddc gin_trgm_ops);
