-- 0133_resource_index_state.sql
--
-- Durable, per-record state for full-text page extraction and passage
-- embedding.
--
-- WHY THIS TABLE EXISTS
--
-- `lib/pdf-page-index.ts` and `lib/chunk-embed.ts` are called in the
-- background (`after(() => indexPdfPagesSafe(...))`) from every upload path.
-- Both wrappers are deliberately non-throwing — a PDF that will not parse must
-- not fail the librarian's save — but until now the ONLY record of what they
-- did was a `console.log`. That made four different outcomes indistinguishable
-- from each other and from success:
--
--   * indexed 172 pages
--   * skipped: the PDF is a scan with no text layer   (legitimate, permanent)
--   * skipped: the file could not be fetched          (transient, retryable)
--   * threw before extracting anything                (a BUG, needs a human)
--
-- In production that gap ran for five weeks. `book_pages` held 0 rows for
-- every record of every type while 120 books were uploaded, and nothing in the
-- application could say so: the admin Data Quality screen reported embedding
-- coverage (`public_resource_search_health`, 0103) and nothing at all about
-- page extraction, so "the indexer has never once succeeded" rendered
-- identically to "this library happens to be all scans". Search for a phrase
-- inside any book returned nothing, and the AI assistant could not cite a
-- single page, because `book_chunks` is derived from `book_pages`.
--
-- The fix is not more logging. It is that the index state of a resource is a
-- FACT ABOUT THE RESOURCE, and therefore belongs in the database next to it,
-- where a view can aggregate it and a human can be shown it.
--
-- WHAT IS STORED HERE AND WHAT IS NOT
--
-- One row per (record_type, record_id) — the outcome of the most recent
-- attempt, not a history. This is a cache of a derivable fact, so it is safe
-- to truncate: re-running `scripts/extract-pdf-text.ts` rebuilds it. The rows
-- it describes live in `book_pages` (0066) and `book_chunks` (0082); those
-- remain the source of truth for CONTENT, and this table never duplicates it.
--
-- `source_digest` is a digest of the file URL that was indexed, never the URL
-- itself. A storage URL is a permanent, policy-free, unlogged download link
-- (see docs/BOOK-DOWNLOAD-PERMISSION.md), so it does not get copied into a
-- second table; a digest is all that "has the file changed since we indexed
-- it?" actually needs.
--
-- POLYMORPHIC BY DESIGN
--
-- `(record_type, record_id)` with no foreign key, exactly like `book_pages`
-- and `book_chunks`: books, theses (`research`) and publications live in three
-- separate tables. Deletes are cascaded by the same server code that already
-- clears `book_pages`/`book_chunks` for a deleted record.

CREATE TABLE IF NOT EXISTS public.resource_index_state (
  record_type   text        NOT NULL CHECK (record_type IN ('book', 'research', 'publication')),
  record_id     uuid        NOT NULL,

  -- What happened on the most recent attempt.
  --   indexed        pages were extracted and stored
  --   no_text_layer  the PDF parsed but every page was empty (a scan)
  --   unfetchable    the file URL could not be resolved or fetched
  --   failed         the attempt threw — a parse error, a missing module, a
  --                  DB error. ALWAYS a bug or an outage, never a property of
  --                  the document.
  status        text        NOT NULL CHECK (status IN ('indexed', 'no_text_layer', 'unfetchable', 'failed')),

  pages         integer     NOT NULL DEFAULT 0 CHECK (pages  >= 0),
  chunks        integer     NOT NULL DEFAULT 0 CHECK (chunks >= 0),

  -- Short, sanitized reason. Never a stack trace, never a URL, never file
  -- content — this table is read by an admin screen, not by a debugger.
  detail        text        CHECK (detail IS NULL OR length(detail) <= 500),

  -- Digest of the file URL indexed, so a replaced PDF reads as stale rather
  -- than as indexed. NULL for rows written before a URL was resolvable.
  source_digest text        CHECK (source_digest IS NULL OR length(source_digest) <= 64),

  attempted_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (record_type, record_id)
);

COMMENT ON TABLE public.resource_index_state IS
  'Most recent full-text extraction + passage embedding outcome per resource. Derived cache of book_pages/book_chunks state; safe to truncate and rebuild with scripts/extract-pdf-text.ts. Written only by server code via the service-role client.';

-- The admin health view groups by status; the coverage lookups filter by type.
CREATE INDEX IF NOT EXISTS resource_index_state_status_idx
  ON public.resource_index_state (record_type, status);

-- Same posture as book_pages (0066) and book_chunks (0082): written and read
-- only through the service-role client from server code. RLS on, no policies,
-- and the grants revoked explicitly — PostgREST exposes every public-schema
-- table to anon by default, and "which of your books failed to index" is
-- operational detail, not public data.
ALTER TABLE public.resource_index_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_index_state FROM PUBLIC;
REVOKE ALL ON public.resource_index_state FROM anon, authenticated;

-- ── Admin reconciliation view ───────────────────────────────────────────────
--
-- The counterpart to public_resource_search_health (0103), which measures
-- EMBEDDING coverage. This one measures FULL-TEXT coverage, and the two
-- answer different questions: a book with an embedding is reachable by
-- semantic title/description match, while a book with extracted pages is
-- reachable by the words inside it and can be cited by page.
--
-- Published resources are the population, LEFT JOINed onto their state, so
-- "never attempted" (`unknown`) is a bucket of its own. That distinction is
-- the entire point: it is what separates "we have not run the indexer" from
-- "we ran it and these documents are scans", and conflating the two is how
-- the original defect stayed invisible.
CREATE OR REPLACE VIEW public.public_resource_index_health
WITH (security_invoker = true) AS
WITH published AS (
  SELECT 'book'::text AS record_type, b.id AS record_id
    FROM public.books b WHERE b.is_published = true
  UNION ALL
  SELECT 'research', r.id
    FROM public.research_reports r WHERE r.is_published = true
  UNION ALL
  SELECT 'publication', p.id
    FROM public.publications p WHERE p.is_published = true
)
SELECT
  p.record_type,
  count(*)                                                        AS published,
  count(*) FILTER (WHERE s.status = 'indexed')                    AS indexed,
  count(*) FILTER (WHERE s.status = 'no_text_layer')              AS no_text_layer,
  count(*) FILTER (WHERE s.status = 'unfetchable')                AS unfetchable,
  count(*) FILTER (WHERE s.status = 'failed')                     AS failed,
  count(*) FILTER (WHERE s.record_id IS NULL)                     AS never_attempted,
  coalesce(sum(s.pages)  FILTER (WHERE s.status = 'indexed'), 0)  AS total_pages,
  coalesce(sum(s.chunks) FILTER (WHERE s.status = 'indexed'), 0)  AS total_chunks
  FROM published p
  LEFT JOIN public.resource_index_state s
         ON s.record_type = p.record_type
        AND s.record_id   = p.record_id
 GROUP BY p.record_type;

COMMENT ON VIEW public.public_resource_index_health IS
  'Per-type full-text index coverage for the admin Data Quality reconciliation: how many published resources have extracted pages, how many are scans, how many failed, and how many were never attempted. Service-role only.';

REVOKE ALL ON public.public_resource_index_health FROM PUBLIC;
REVOKE ALL ON public.public_resource_index_health FROM anon, authenticated;
