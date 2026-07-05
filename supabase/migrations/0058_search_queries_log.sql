-- 0058: Search query log — powers "Popular searches" on /search
--
-- Logged fire-and-forget from /api/search/native for each distinct query
-- (see route: only logged once per query, not on every tab/page change).
-- No RLS needed: never read/written with the user's session, only via the
-- service-role client from server code.

CREATE TABLE public.search_queries (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  term            text        NOT NULL,
  normalized_term text        GENERATED ALWAYS AS (lower(trim(term))) STORED,
  searched_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX search_queries_normalized_term_idx
  ON public.search_queries (normalized_term, searched_at DESC);
