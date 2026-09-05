-- 0137_resource_semantic_insights.sql
--
-- Precomputed, versioned, per-record semantic insights: the topics a document
-- demonstrably covers, and the body pages that prove each one.
--
-- ── Why a table and not a query ──────────────────────────────────────────────
--
-- The derivation reads every extracted page of a record and classifies it —
-- 1,622 pages and ~1.5 s of CPU for the largest book in the collection. That
-- is fine offline and unacceptable on a request path, so the result is
-- computed by `scripts/build-semantic-insights.ts` and READ by the book detail
-- page. The brief's §22 rule, and this codebase's own: a page request may not
-- fan out over a document's chunks.
--
-- ── Why not resource_index_state ─────────────────────────────────────────────
--
-- 0133 records whether extraction RAN and what it produced. This records
-- whether what it produced is usable and what it means. They disagree on
-- purpose and that disagreement is the finding: all 99 Khmer-script books in
-- production are `indexed` in 0133 and `damaged-text` here, because extraction
-- succeeded and returned text that is not the document's text. Folding the
-- second answer into the first would erase it.
--
-- ── What is stored, and what is deliberately not ─────────────────────────────
--
-- `topics` holds the label, the proving page numbers, the mention count and
-- the score. It holds NO extracted text. A page number is a fact about a
-- document that anyone holding it can check; a passage is content, governed by
-- a rights policy this library has not written (docs/BOOK-DOWNLOAD-PERMISSION.md
-- for the neighbouring decision). If excerpts are ever published they get their
-- own column and their own policy, not a quiet reuse of this one.
--
-- `semantic_version` is the generation of the pure logic that produced the
-- row (lib/semantic/build.ts SEMANTIC_VERSION). A row from an older generation
-- is stale by definition and is recomputed rather than trusted. `source_digest`
-- is the same idea for the INPUT — a digest of the record's extracted page
-- corpus, so a re-extracted PDF invalidates its insights without a trigger.
--
-- Polymorphic `(record_type, record_id)` with no foreign key, exactly like
-- book_pages (0066), book_chunks (0082) and resource_index_state (0133).
-- Deletes cascade through the same server code that already clears those.

CREATE TABLE IF NOT EXISTS public.resource_semantic_insights (
  record_type      text        NOT NULL CHECK (record_type IN ('book', 'research', 'publication')),
  record_id        uuid        NOT NULL,

  semantic_version integer     NOT NULL,

  --   ok                  topics were proven from body text
  --   no-text             no extracted pages, or too few to judge
  --   damaged-text        pages exist and are not this document's text
  --   unsupported-topics  text is good; no catalogue tag is discussed in it
  status           text        NOT NULL
                     CHECK (status IN ('ok', 'no-text', 'damaged-text', 'unsupported-topics')),

  -- [{ label, pages: int[], morePages, mentions, score }] — never any text
  -- from the document itself.
  topics           jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Structural page census: { total, body, front-matter, contents,
  -- references, back-matter, sparse }. This is the feature's own coverage
  -- report and the admin surface reads it directly.
  page_counts      jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- { script, verdict, reasons: text[] } from lib/semantic/text-quality.ts.
  -- Named damage modes, not a bare pass/fail: `khmer-coeng-detached` and
  -- `khmer-legacy-font` are different defects with different fixes.
  text_health      jsonb,

  -- Digest of the extracted page corpus this row was derived from. Recomputed
  -- rows overwrite; a changed digest means the source was re-extracted and the
  -- row is stale.
  source_digest    text        CHECK (source_digest IS NULL OR length(source_digest) <= 64),

  computed_at      timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (record_type, record_id)
);

COMMENT ON TABLE public.resource_semantic_insights IS
  'Precomputed topics a resource demonstrably covers, with the body pages proving each. Derived cache of book_pages; safe to truncate and rebuild with scripts/build-semantic-insights.ts. Holds no document text. Written only by server code via the service-role client.';

-- The admin coverage panel groups by status; the book page looks up one row by
-- its primary key, which needs no index of its own.
CREATE INDEX IF NOT EXISTS resource_semantic_insights_status_idx
  ON public.resource_semantic_insights (record_type, status);

-- Same posture as book_pages (0066), book_chunks (0082) and
-- resource_index_state (0133): server code through the service-role client,
-- nothing else. RLS on with no policies, and the default PostgREST grants
-- revoked explicitly — the public book page reads this through a server
-- component, so `anon` never needs to reach the table, and "which of your
-- books produced no usable text" is operational detail.
ALTER TABLE public.resource_semantic_insights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_semantic_insights FROM PUBLIC;
REVOKE ALL ON public.resource_semantic_insights FROM anon, authenticated;

-- ── Admin coverage view ─────────────────────────────────────────────────────
--
-- The counterpart to public_resource_index_health (0133). That view answers
-- "did we extract text"; this one answers "is the text we extracted usable,
-- and did it prove anything". Published resources are the population, LEFT
-- JOINed onto their insights, so `never_computed` stays its own bucket —
-- the same reasoning as 0133's `never_attempted`, and for the same reason:
-- conflating "not run" with "ran and found nothing" is how a total failure
-- stays invisible.
CREATE OR REPLACE VIEW public.public_resource_semantic_health
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
  count(*)                                                      AS published,
  count(*) FILTER (WHERE s.status = 'ok')                       AS with_topics,
  count(*) FILTER (WHERE s.status = 'damaged-text')             AS damaged_text,
  count(*) FILTER (WHERE s.status = 'no-text')                  AS no_text,
  count(*) FILTER (WHERE s.status = 'unsupported-topics')       AS unsupported_topics,
  count(*) FILTER (WHERE s.record_id IS NULL)                   AS never_computed,
  coalesce(sum(jsonb_array_length(s.topics))
             FILTER (WHERE s.status = 'ok'), 0)                 AS total_topics
  FROM published p
  LEFT JOIN public.resource_semantic_insights s
         ON s.record_type = p.record_type
        AND s.record_id   = p.record_id
 GROUP BY p.record_type;

COMMENT ON VIEW public.public_resource_semantic_health IS
  'Per-type semantic coverage for the admin Data Quality panel: how many published resources proved topics, how many hold structurally damaged text, and how many were never computed. Service-role only.';

REVOKE ALL ON public.public_resource_semantic_health FROM PUBLIC;
REVOKE ALL ON public.public_resource_semantic_health FROM anon, authenticated;
