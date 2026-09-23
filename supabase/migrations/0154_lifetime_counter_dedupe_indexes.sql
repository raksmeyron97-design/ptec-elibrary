-- 0154_lifetime_counter_dedupe_indexes.sql
--
-- Indexes for the reads that decide whether a public lifetime counter moves.
--
-- `books.view_count` and `books.download_count` now count one event per viewer
-- per rolling 24 hours (lib/analytics/counting.ts). That rule costs one read
-- per book-detail view and one per download: "has THIS viewer a row for THIS
-- book since <timestamp>". Both tables are append-only logs that only grow, so
-- the read has to be an index lookup and not a range scan that gets slower
-- every month.
--
-- WHY THE LEADING COLUMNS ARE (content_type, content_id) AND NOT THE VIEWER.
-- The selective pair is the resource: the window holds every view in the
-- library, of which one book's are a small slice, and the viewer column
-- differs between the two callers (a signed-in reader is `user_id`, a guest is
-- the daily `session_hash`) so it cannot lead a shared index. Narrowing to one
-- book inside the window leaves a handful of rows to filter.
--
-- view_logs had NO index on (content_type, content_id) at all — only 0090's
-- `view_logs_viewed_at_idx (viewed_at desc)`, which answers the dashboard's
-- "everything in this period" question and is the wrong shape for this one.
-- download_logs already has 0072's `download_logs_content_idx
-- (content_type, content_id)`; this adds the time column so the window bound
-- is satisfied by the index rather than by a filter over a book's whole
-- download history. The old index stays — dropping it is a separate decision
-- and a prefix index is still used by the queries that want it.
--
-- Additive and idempotent: no table, no column, no policy, no data change.
-- Nothing here is reachable by `anon` (both tables are service-role only), so
-- there is no RLS surface to extend.

create index if not exists view_logs_content_viewed_at_idx
  on public.view_logs (content_type, content_id, viewed_at desc);

create index if not exists download_logs_content_downloaded_at_idx
  on public.download_logs (content_type, content_id, downloaded_at desc);
