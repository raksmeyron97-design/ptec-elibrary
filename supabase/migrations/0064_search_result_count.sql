-- 0064_search_result_count.sql
-- search_queries (0058) only logged the term, not whether it actually found
-- anything — so there was no way to build a "what are people searching for
-- that we don't have" report for collection development. Adds result_count;
-- NULL for rows logged before this migration (excluded from the report,
-- rather than misread as zero-result).

alter table public.search_queries
  add column if not exists result_count integer;

create index if not exists search_queries_zero_result_idx
  on public.search_queries (normalized_term, searched_at desc)
  where result_count = 0;
