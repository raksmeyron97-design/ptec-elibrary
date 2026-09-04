-- 0134_index_state_retry_and_staleness.sql
--
-- Retry accounting, failure CLASSIFICATION, and staleness for
-- `resource_index_state` (0133).
--
-- WHY, CONCRETELY
--
-- 0133 made indexing outcomes durable, and the first week of real data showed
-- what it still could not express. Production reached this state:
--
--     published 215 | indexed 8 | unfetchable 203 | failed 0
--
-- All 203 were healthy books whose PDFs fetch perfectly well. They were
-- written by a backfill run started on a developer laptop:
-- `scripts/extract-pdf-text.ts` loads `.env.local` before `.env`, so
-- `ZIMA_API_URL` was `http://localhost:4000`, `toAllowedStorageUrl()`
-- correctly refused every `storage-ptec.online` URL as off-allow-list, and the
-- script recorded `unfetchable` — against the PRODUCTION database, because the
-- Supabase credentials in the same environment pointed there.
--
-- Every layer behaved as designed. The bug is that the schema had no way to
-- say "this attempt failed because of OUR configuration, not because of the
-- resource", so a local misconfiguration overwrote 203 true verdicts with
-- false ones, and the health view — the instrument built to stop exactly this
-- class of lie — reported the lie with total confidence.
--
-- Three columns answer that, and one view change makes staleness visible.
--
-- 1. `failure_kind` — WHOSE problem is it?
--
--      transient   the world was briefly unavailable (storage 5xx, network,
--                  provider rate limit). Retry with backoff.
--      permanent   a property of the document (image-only scan, corrupt PDF).
--                  Retrying achieves nothing; a human or OCR is required.
--      config      OUR environment was wrong. Says NOTHING about the resource.
--                  Never overwrites a good state, never counted as evidence
--                  about the collection, and cleared the moment a properly
--                  configured run reaches the record.
--
--    The distinction is not cosmetic: `unresolvable-url` (our allow-list said
--    no) and `fetch-failed` (the storage said no) were one status in 0133 and
--    are now one status with two different kinds, because only the second is
--    evidence about the file.
--
-- 2. `attempt_count` / `next_attempt_at` — bounded retry. A transient failure
--    backs off and is retried by /api/cron/index-reconcile; a permanent one
--    gets no `next_attempt_at` at all, so nothing retries a corrupt PDF
--    forever.
--
-- 3. `running` + `claimed_at` — a claim, so the hourly cron and an operator's
--    manual backfill cannot process the same record twice. A claim older than
--    the stale-claim window is reclaimable: a process that died mid-extract
--    must not strand a record in `running` for good.
--
-- 4. Staleness is DERIVED, never stored as a status. `source_digest` (0133) is
--    the sha256 of the file URL that was indexed; the view compares it against
--    the digest of the file URL the resource carries NOW. A replaced PDF
--    therefore stops reading as healthy the instant the row changes, with no
--    write and no trigger — and, crucially, without a `stale` status that
--    could disagree with the files.

-- ── 1. Failure classification ───────────────────────────────────────────────

ALTER TABLE public.resource_index_state
  ADD COLUMN IF NOT EXISTS failure_kind text
    CHECK (failure_kind IS NULL OR failure_kind IN ('transient', 'permanent', 'config'));

COMMENT ON COLUMN public.resource_index_state.failure_kind IS
  'Whose problem the failure is: transient (world), permanent (document), config (our environment). NULL when the attempt succeeded. A config failure is never evidence about the resource.';

-- ── 2. Bounded retry accounting ─────────────────────────────────────────────

ALTER TABLE public.resource_index_state
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1
    CHECK (attempt_count >= 0);

ALTER TABLE public.resource_index_state
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

COMMENT ON COLUMN public.resource_index_state.attempt_count IS
  'Consecutive attempts since the last success. Reset to 0 on `indexed`. Drives the backoff in lib/indexing/retry.ts.';
COMMENT ON COLUMN public.resource_index_state.next_attempt_at IS
  'Earliest time the reconciler may retry. NULL means "do not retry automatically" — either the record is healthy or the failure is permanent or the attempt budget is spent.';

-- ── 3. Claim, so two runners cannot process one record ──────────────────────

ALTER TABLE public.resource_index_state
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

ALTER TABLE public.resource_index_state
  ADD COLUMN IF NOT EXISTS claimed_by text
    CHECK (claimed_by IS NULL OR length(claimed_by) <= 120);

COMMENT ON COLUMN public.resource_index_state.claimed_at IS
  'When a runner claimed this record (status = running). A claim older than the stale-claim window is reclaimable — a runner that died must not strand a record in `running`.';

-- `running` joins the status set. Drop-then-add so the migration is
-- re-runnable and does not depend on the constraint's generated name.
ALTER TABLE public.resource_index_state
  DROP CONSTRAINT IF EXISTS resource_index_state_status_check;

ALTER TABLE public.resource_index_state
  ADD CONSTRAINT resource_index_state_status_check
    CHECK (status IN ('running', 'indexed', 'no_text_layer', 'unfetchable', 'failed'));

-- The reconciler's work query: "due records of this type, worst first".
CREATE INDEX IF NOT EXISTS resource_index_state_due_idx
  ON public.resource_index_state (record_type, next_attempt_at)
  WHERE next_attempt_at IS NOT NULL;

-- ── 4. Health view: running, staleness, and the config split ────────────────
--
-- `pgcrypto` supplies digest(); Supabase ships it, and 0133's TypeScript
-- `sourceDigest()` is a full sha256 hex string, so the two are directly
-- comparable. lib/indexing/state.test.ts pins that equivalence.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- CREATE OR REPLACE cannot reorder or rename a view's columns, and this
-- version inserts `stale` between them. Drop first; nothing depends on the
-- view but the admin panel, which reads it by name at request time.
DROP VIEW IF EXISTS public.public_resource_index_health;

CREATE VIEW public.public_resource_index_health
WITH (security_invoker = true) AS
WITH published AS (
  -- One row per published resource, carrying the file URL it points at NOW.
  -- A book can have several book_files rows; take the same one the indexer
  -- would (the first non-null file_url, ordered for determinism).
  SELECT 'book'::text AS record_type,
         b.id         AS record_id,
         (SELECT f.file_url
            FROM public.book_files f
           WHERE f.book_id = b.id AND f.file_url IS NOT NULL
           ORDER BY f.file_url
           LIMIT 1)   AS file_url
    FROM public.books b WHERE b.is_published = true
  UNION ALL
  SELECT 'research', r.id, r.file_url
    FROM public.research_reports r WHERE r.is_published = true
  UNION ALL
  SELECT 'publication', p.id, p.pdf_url
    FROM public.publications p WHERE p.is_published = true
),
joined AS (
  SELECT
    p.record_type,
    s.record_id      AS state_id,
    s.status,
    s.failure_kind,
    s.pages,
    s.chunks,
    -- Stale = we indexed successfully, but from a DIFFERENT file than the one
    -- this resource points at today. Derived, never stored: a stored flag
    -- could disagree with the files it describes.
    (
      s.status = 'indexed'
      AND s.source_digest IS NOT NULL
      AND p.file_url IS NOT NULL
      AND s.source_digest IS DISTINCT FROM encode(extensions.digest(p.file_url, 'sha256'), 'hex')
    ) AS is_stale
  FROM published p
  LEFT JOIN public.resource_index_state s
         ON s.record_type = p.record_type
        AND s.record_id   = p.record_id
)
SELECT
  record_type,
  count(*)                                                              AS published,
  count(*) FILTER (WHERE status = 'indexed' AND NOT is_stale)           AS indexed,
  count(*) FILTER (WHERE status = 'indexed' AND is_stale)               AS stale,
  count(*) FILTER (WHERE status = 'no_text_layer')                      AS no_text_layer,
  count(*) FILTER (WHERE status = 'unfetchable')                        AS unfetchable,
  count(*) FILTER (WHERE status = 'failed')                             AS failed,
  count(*) FILTER (WHERE status = 'running')                            AS running,
  count(*) FILTER (WHERE state_id IS NULL)                              AS never_attempted,
  -- Failure breakdown by WHOSE fault, which is what decides the operator's
  -- next action. `config` is called out separately because it is the one
  -- bucket that says nothing about the collection.
  count(*) FILTER (WHERE failure_kind = 'transient')                    AS failed_transient,
  count(*) FILTER (WHERE failure_kind = 'permanent')                    AS failed_permanent,
  count(*) FILTER (WHERE failure_kind = 'config')                       AS failed_config,
  coalesce(sum(pages)  FILTER (WHERE status = 'indexed'), 0)            AS total_pages,
  coalesce(sum(chunks) FILTER (WHERE status = 'indexed'), 0)            AS total_chunks
  FROM joined
 GROUP BY record_type;

COMMENT ON VIEW public.public_resource_index_health IS
  'Per-type full-text index coverage for the admin Data Quality reconciliation: indexed, stale (indexed from a file the resource no longer points at), scans, failures split by whose problem they are, in-flight claims, and never-attempted. Service-role only.';

REVOKE ALL ON public.public_resource_index_health FROM PUBLIC;
REVOKE ALL ON public.public_resource_index_health FROM anon, authenticated;

-- ── 5. Retire the 203 false verdicts ────────────────────────────────────────
--
-- Every existing `unfetchable` row was written by 0133-era code, which had no
-- way to distinguish "our allow-list refused this URL" from "storage refused
-- it". In production every one of them carries detail = 'unresolvable-url'
-- and was produced by a laptop pointed at localhost storage.
--
-- They are DELETED rather than relabelled. A row here is a claim about the
-- last attempt on a resource; these rows attempted nothing about the resource,
-- so the honest state is "never attempted", which is what the absence of a row
-- means. Relabelling them `config` would leave 203 rows asserting a failure
-- that never happened, and the reconciler would then have to special-case
-- them forever.
--
-- Scoped as tightly as the evidence supports: only `unfetchable`, only that
-- exact detail string. A genuine storage outage recorded by NEW code carries
-- failure_kind = 'transient' and is untouched by this and by any re-run.
DELETE FROM public.resource_index_state
 WHERE status = 'unfetchable'
   AND failure_kind IS NULL
   AND detail = 'unresolvable-url';
