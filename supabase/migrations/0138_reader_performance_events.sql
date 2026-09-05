-- ─────────────────────────────────────────────────────────────────────────────
-- 0138 — reader performance events
--
-- The reader has emitted telemetry beacons (pdf_first_page, pdf_load_error, …)
-- to /api/reader-events since the large-PDF work, and the route wrote them to
-- the server log only. That answers nothing operationally: first-page p50/p95,
-- which device class is slowest, how often large files fail, how often the
-- reader recovers from an outage. `app_events` (0090) already holds exactly
-- this shape for AI telemetry — kind / status / route / latency_ms / detail —
-- so the reader gets a kind of its own rather than a table of its own.
--
-- Privacy is unchanged: `detail` carries counts and enums only (device class,
-- network tier, cache/network source, request and byte counts), never a
-- title, a URL with a token, an IP or a user id. The route clamps every
-- number and rejects every unknown key before the row is written.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Admit the new kind. The constraint was created inline in 0090, so it
--    carries Postgres's generated name; drop by name where it exists, and by
--    definition otherwise, so a hosted database whose constraint was ever
--    recreated under another name still ends up with the same rule.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.app_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.app_events drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.app_events
  add constraint app_events_kind_check
  check (kind in ('ai_request', 'storage_operation', 'notification', 'export', 'reader_event'));

-- 2. One row per reader event, keyed for the dashboard's range scans. `route`
--    holds the event type (pdf_first_page, page_load_error, reader_session, …).
create index if not exists app_events_reader_route_idx
  on public.app_events (route, created_at desc)
  where kind = 'reader_event';

-- 3. The operational view. Percentiles are ordered-set aggregates with a
--    FILTER, so one scan answers every column. `device` comes from the client
--    as a three-value enum (phone / tablet / desktop) validated by the route.
create or replace view public.reader_performance_daily as
select
  (created_at at time zone 'utc')::date                                    as day,
  coalesce(detail ->> 'device', 'unknown')                                 as device,
  count(*) filter (where route = 'pdf_first_page')                         as first_page_samples,
  percentile_cont(0.5)  within group (order by latency_ms)
    filter (where route = 'pdf_first_page' and latency_ms is not null)     as first_page_p50_ms,
  percentile_cont(0.95) within group (order by latency_ms)
    filter (where route = 'pdf_first_page' and latency_ms is not null)     as first_page_p95_ms,
  count(*) filter (where route = 'pdf_first_page'
                     and coalesce((detail ->> 'large')::boolean, false))   as large_first_pages,
  count(*) filter (where route = 'pdf_load_error')                         as load_errors,
  count(*) filter (where route = 'pdf_load_error'
                     and coalesce((detail ->> 'large')::boolean, false))   as large_load_errors,
  count(*) filter (where route = 'page_load_error')                        as page_load_errors,
  count(*) filter (where route = 'pdf_render_error')                       as render_errors,
  count(*) filter (where route = 'offline_transition')                     as offline_transitions,
  count(*) filter (where route = 'network_recovery')                       as network_recoveries,
  count(*) filter (where route = 'reader_session')                         as sessions,
  coalesce(sum((detail ->> 'prefetch_hits')::int)
    filter (where route = 'reader_session'), 0)                            as prefetch_hits,
  coalesce(sum((detail ->> 'prefetch_misses')::int)
    filter (where route = 'reader_session'), 0)                            as prefetch_misses,
  max((detail ->> 'max_mounted')::int)
    filter (where route = 'reader_session')                                as max_mounted_pages
from public.app_events
where kind = 'reader_event'
group by 1, 2;

comment on view public.reader_performance_daily is
  'Reader telemetry rollup per UTC day and device class: first-page p50/p95, error counts, offline recoveries, prefetch hit rate. Service role only.';

-- PostgREST exposes every public view to anon by default; this one is for the
-- admin dashboard, read through the service client.
revoke all on public.reader_performance_daily from public, anon, authenticated;
