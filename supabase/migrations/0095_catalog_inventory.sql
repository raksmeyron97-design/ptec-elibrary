-- 0095_catalog_inventory.sql
-- Physical-catalog inventory integrity.
--
-- Context: catalog_copies gained barcode/call_number/shelf_location/
-- holding_library/notes/updated_at via dashboard drift, but the table has no
-- status constraint, no uniqueness, and nothing keeps the derived
-- catalog_books.copies_total / copies_available counters in sync with copy
-- rows. The app now recomputes those counters in server actions; this
-- migration makes the sync durable at the DB level and adds the missing
-- inventory columns/constraints.
--
-- Idempotent: safe to re-run. No destructive statements.
--
-- App behavior before this migration is applied (pre-migration-safe code):
--   • writes to copy_number / accession_number / condition retry without
--     those columns when PostgREST reports them missing (PGRST204);
--   • counters are still correct because server actions recount after every
--     copy mutation;
--   • duplicate barcodes are rejected by an app-level pre-check only.
-- After applying, the DB enforces all of it natively.

-- ── 1. Normalise legacy status values ────────────────────────────────────────
UPDATE public.catalog_copies SET status = 'on_loan'    WHERE status = 'checked_out';
UPDATE public.catalog_copies SET status = 'processing' WHERE status = 'on_order';
UPDATE public.catalog_copies SET status = 'available'  WHERE status IS NULL;

-- ── 2. Missing inventory columns ─────────────────────────────────────────────
ALTER TABLE public.catalog_copies
  ADD COLUMN IF NOT EXISTS copy_number      integer,
  ADD COLUMN IF NOT EXISTS accession_number text,
  ADD COLUMN IF NOT EXISTS condition        text;

-- Backfill copy numbers for existing rows (per book, in acquisition order).
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY catalog_book_id ORDER BY created_at, id) AS rn
  FROM public.catalog_copies
  WHERE copy_number IS NULL
)
UPDATE public.catalog_copies c
SET copy_number = numbered.rn
FROM numbered
WHERE c.id = numbered.id;

-- ── 3. Status check constraint ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalog_copies_status_check'
  ) THEN
    ALTER TABLE public.catalog_copies
      ADD CONSTRAINT catalog_copies_status_check CHECK (status IN (
        'available','on_loan','reserved','reference_only','processing',
        'in_repair','damaged','lost','missing','withdrawn'
      ));
  END IF;
END $$;

ALTER TABLE public.catalog_copies ALTER COLUMN status SET DEFAULT 'available';
ALTER TABLE public.catalog_copies ALTER COLUMN status SET NOT NULL;

-- ── 4. Uniqueness ────────────────────────────────────────────────────────────
-- Barcodes and accession numbers are unique among live (non-withdrawn) copies;
-- a withdrawn copy's barcode may be reused for its replacement.
CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_copies_barcode
  ON public.catalog_copies (barcode)
  WHERE barcode IS NOT NULL AND status <> 'withdrawn';

CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_copies_accession
  ON public.catalog_copies (accession_number)
  WHERE accession_number IS NOT NULL AND status <> 'withdrawn';

CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_copies_book_copy_no
  ON public.catalog_copies (catalog_book_id, copy_number)
  WHERE copy_number IS NOT NULL AND status <> 'withdrawn';

CREATE INDEX IF NOT EXISTS idx_catalog_copies_book_status
  ON public.catalog_copies (catalog_book_id, status);

-- ── 5. updated_at maintenance ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_catalog_copies_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_catalog_copies_touch ON public.catalog_copies;
CREATE TRIGGER trg_catalog_copies_touch
  BEFORE UPDATE ON public.catalog_copies
  FOR EACH ROW EXECUTE FUNCTION public.touch_catalog_copies_updated_at();

-- ── 6. Derived counters: copies_total / copies_available ────────────────────
-- Single source of truth is the copy rows. Withdrawn copies do not count.
CREATE OR REPLACE FUNCTION public.sync_catalog_book_copy_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected uuid[];
  b uuid;
BEGIN
  affected := ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN NEW.catalog_book_id END,
      CASE WHEN TG_OP IN ('DELETE','UPDATE') THEN OLD.catalog_book_id END
    ]) AS x WHERE x IS NOT NULL
  );
  FOREACH b IN ARRAY affected LOOP
    UPDATE public.catalog_books cb SET
      copies_total = (
        SELECT count(*) FROM public.catalog_copies cc
        WHERE cc.catalog_book_id = b AND cc.status <> 'withdrawn'
      ),
      copies_available = (
        SELECT count(*) FROM public.catalog_copies cc
        WHERE cc.catalog_book_id = b AND cc.status = 'available'
      ),
      updated_at = timezone('utc'::text, now())
    WHERE cb.id = b;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_catalog_copies_sync_counts ON public.catalog_copies;
CREATE TRIGGER trg_catalog_copies_sync_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.catalog_copies
  FOR EACH ROW EXECUTE FUNCTION public.sync_catalog_book_copy_counts();

-- ── 7. One-time backfill of the counters from existing copy rows ─────────────
UPDATE public.catalog_books cb SET
  copies_total = sub.total,
  copies_available = sub.avail
FROM (
  SELECT
    b.id,
    COALESCE(count(cc.id) FILTER (WHERE cc.status <> 'withdrawn'), 0) AS total,
    COALESCE(count(cc.id) FILTER (WHERE cc.status = 'available'), 0)  AS avail
  FROM public.catalog_books b
  LEFT JOIN public.catalog_copies cc ON cc.catalog_book_id = b.id
  GROUP BY b.id
) sub
WHERE cb.id = sub.id
  AND (cb.copies_total IS DISTINCT FROM sub.total
    OR cb.copies_available IS DISTINCT FROM sub.avail);
