-- 0121_search_analytics_aggregates.sql
-- Push /admin/search-insights aggregation into the database.
--
-- Why: the admin action fetched raw rows with `.limit(5000)` and counted them
-- in Node. Past 5,000 searches in the selected window that is not merely slow
-- — "Total searches" reads exactly 5000 and every rate derived from it is
-- wrong, silently. The same page did it three times per load (window rows,
-- a second 180-day pull for the trend, and click rows), then a fourth time
-- for the zero-result report.
--
-- These functions return only aggregates. No raw search term leaves the
-- database except in the top-N / zero-result group lists, which the admin
-- page already displayed.
--
-- Security: service-role only, exactly like every table they read
-- (0084 for search_queries, 0080 for search_result_clicks, 0087 for the
-- governance tables). SECURITY DEFINER + a pinned search_path, then EXECUTE
-- revoked from public/anon/authenticated — the same posture as
-- purge_search_analytics() in 0087. The admin server actions call them
-- behind requireLibrarian().
--
-- search_result_clicks is optional in older environments (it arrived in
-- 0080), so every function that reads it degrades to zero rather than
-- failing the whole dashboard.
--
-- Rollback: drop the five functions and the one index. No table changes.

-- ── Index: every query on this page filters clicks by time ──────────────────
-- search_result_clicks has (normalized_term, clicked_at) and
-- (result_type, result_id, clicked_at), neither of which can serve a bare
-- `clicked_at >= $1` range scan — so the dashboard's click queries were
-- sequential scans. This mirrors search_queries_searched_at_idx (0090).
create index if not exists search_clicks_clicked_at_idx
  on public.search_result_clicks (clicked_at desc);

-- ── 1. Headline counts ──────────────────────────────────────────────────────
-- unknown_result_searches counts rows logged before 0064 added result_count.
-- They are reported separately so the caller can exclude them from the rate
-- denominators instead of silently reading NULL as "found results".
create or replace function public.search_analytics_summary(
  p_since timestamptz,
  p_until timestamptz
)
returns table (
  total_searches           bigint,
  zero_result_searches     bigint,
  unknown_result_searches  bigint,
  clicks                   bigint,
  km_searches              bigint,
  en_searches              bigint,
  other_searches           bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clicks bigint := 0;
begin
  begin
    select count(*) into v_clicks
      from public.search_result_clicks
     where clicked_at >= p_since and clicked_at < p_until;
  exception when undefined_table then
    v_clicks := 0;
  end;

  return query
  select
    count(*)::bigint,
    count(*) filter (where q.result_count = 0)::bigint,
    count(*) filter (where q.result_count is null)::bigint,
    v_clicks,
    count(*) filter (where coalesce(q.query_language,
      case when q.term ~ '[ក-៿]' then 'km' else 'en' end) = 'km')::bigint,
    count(*) filter (where coalesce(q.query_language,
      case when q.term ~ '[ក-៿]' then 'km' else 'en' end) = 'en')::bigint,
    count(*) filter (where coalesce(q.query_language,
      case when q.term ~ '[ក-៿]' then 'km' else 'en' end) not in ('km', 'en'))::bigint
  from public.search_queries q
  where q.searched_at >= p_since and q.searched_at < p_until;
end;
$$;

-- ── 2. Trend, bucketed server-side ──────────────────────────────────────────
-- One row per bucket, never one row per event: a 6-month chart is 6 rows
-- over the wire, not every search in half a year.
create or replace function public.search_analytics_trend(
  p_since       timestamptz,
  p_until       timestamptz,
  p_bucket_days integer default 1
)
returns table (
  bucket       date,
  searches     bigint,
  zero_results bigint,
  clicks       bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_step integer := greatest(1, coalesce(p_bucket_days, 1));
begin
  return query
  with buckets as (
    select generate_series(
      date_trunc('day', p_since),
      date_trunc('day', p_until),
      make_interval(days => v_step)
    ) as bucket_start
  ),
  searches_agg as (
    select
      date_trunc('day', p_since)
        + make_interval(days => (floor(extract(epoch from q.searched_at - date_trunc('day', p_since)) / 86400 / v_step) * v_step)::int) as bucket_start,
      count(*)::bigint as n,
      count(*) filter (where q.result_count = 0)::bigint as zero_n
    from public.search_queries q
    where q.searched_at >= p_since and q.searched_at < p_until
    group by 1
  ),
  clicks_agg as (
    select
      date_trunc('day', p_since)
        + make_interval(days => (floor(extract(epoch from c.clicked_at - date_trunc('day', p_since)) / 86400 / v_step) * v_step)::int) as bucket_start,
      count(*)::bigint as n
    from public.search_result_clicks c
    where c.clicked_at >= p_since and c.clicked_at < p_until
    group by 1
  )
  select
    b.bucket_start::date,
    coalesce(s.n, 0)::bigint,
    coalesce(s.zero_n, 0)::bigint,
    coalesce(k.n, 0)::bigint
  from buckets b
  left join searches_agg s on s.bucket_start = b.bucket_start
  left join clicks_agg  k on k.bucket_start = b.bucket_start
  order by b.bucket_start;
exception when undefined_table then
  -- No clicks table (pre-0080): still return the search side of the trend.
  return query
  with buckets as (
    select generate_series(
      date_trunc('day', p_since),
      date_trunc('day', p_until),
      make_interval(days => v_step)
    ) as bucket_start
  ),
  searches_agg as (
    select
      date_trunc('day', p_since)
        + make_interval(days => (floor(extract(epoch from q.searched_at - date_trunc('day', p_since)) / 86400 / v_step) * v_step)::int) as bucket_start,
      count(*)::bigint as n,
      count(*) filter (where q.result_count = 0)::bigint as zero_n
    from public.search_queries q
    where q.searched_at >= p_since and q.searched_at < p_until
    group by 1
  )
  select
    b.bucket_start::date,
    coalesce(s.n, 0)::bigint,
    coalesce(s.zero_n, 0)::bigint,
    0::bigint
  from buckets b
  left join searches_agg s on s.bucket_start = b.bucket_start
  order by b.bucket_start;
end;
$$;

-- ── 3. Top terms ────────────────────────────────────────────────────────────
-- p_only_zero picks the partial index from 0064
-- (normalized_term, searched_at desc) where result_count = 0.
-- mode() gives the raw spelling users typed most often for the group, so the
-- list reads like the search box rather than like the normalizer's output.
create or replace function public.search_analytics_top_terms(
  p_since     timestamptz,
  p_until     timestamptz,
  p_only_zero boolean default false,
  p_limit     integer default 10
)
returns table (
  normalized_term  text,
  term             text,
  searches         bigint,
  last_searched_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.normalized_term,
    mode() within group (order by q.term) as term,
    count(*)::bigint as searches,
    max(q.searched_at) as last_searched_at
  from public.search_queries q
  where q.searched_at >= p_since
    and q.searched_at < p_until
    and q.normalized_term <> ''
    and (not p_only_zero or q.result_count = 0)
    and (p_only_zero or coalesce(q.result_count, 1) > 0)
  group by q.normalized_term
  order by count(*) desc, max(q.searched_at) desc
  limit greatest(1, least(coalesce(p_limit, 10), 200));
$$;

-- ── 4. Most-clicked results ─────────────────────────────────────────────────
create or replace function public.search_analytics_clicked_results(
  p_since timestamptz,
  p_until timestamptz,
  p_limit integer default 10
)
returns table (
  result_url      text,
  result_type     text,
  result_title    text,
  clicks          bigint,
  last_clicked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    c.result_url,
    c.result_type,
    mode() within group (order by c.result_title) as result_title,
    count(*)::bigint,
    max(c.clicked_at)
  from public.search_result_clicks c
  where c.clicked_at >= p_since and c.clicked_at < p_until
  group by c.result_url, c.result_type
  order by count(*) desc, max(c.clicked_at) desc
  limit greatest(1, least(coalesce(p_limit, 10), 100));
exception when undefined_table then
  return;
end;
$$;

-- ── 5. Zero-result groups ───────────────────────────────────────────────────
-- Collapses raw zero-result rows to one row per normalized term. This is the
-- expensive step (potentially 100k rows → a few hundred groups) and it now
-- happens in the database; the small result set is then typo-grouped,
-- filtered and paginated in the action.
--
-- filtered_searches counts searches made with a resource-type or sort filter
-- active — a zero-result term that only fails *with* filters is a different
-- problem from one that fails outright.
create or replace function public.search_analytics_zero_result_groups(
  p_since timestamptz,
  p_until timestamptz,
  p_limit integer default 500
)
returns table (
  normalized_term   text,
  term              text,
  searches          bigint,
  filtered_searches bigint,
  last_searched_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.normalized_term,
    mode() within group (order by q.term) as term,
    count(*)::bigint,
    count(*) filter (
      where (q.resource_type is not null and q.resource_type <> 'all')
         or (q.sort is not null and q.sort <> 'relevance')
    )::bigint,
    max(q.searched_at)
  from public.search_queries q
  where q.searched_at >= p_since
    and q.searched_at < p_until
    and q.result_count = 0
    and q.normalized_term <> ''
  group by q.normalized_term
  order by count(*) desc, max(q.searched_at) desc
  limit greatest(1, least(coalesce(p_limit, 500), 2000));
$$;

revoke all on function public.search_analytics_summary(timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.search_analytics_trend(timestamptz, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.search_analytics_top_terms(timestamptz, timestamptz, boolean, integer)
  from public, anon, authenticated;
revoke all on function public.search_analytics_clicked_results(timestamptz, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.search_analytics_zero_result_groups(timestamptz, timestamptz, integer)
  from public, anon, authenticated;
