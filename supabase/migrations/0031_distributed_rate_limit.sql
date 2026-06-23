-- 0031_distributed_rate_limit.sql
-- Generic sliding-window rate limit table backed by Postgres.
-- Replaces the in-memory store in lib/rate-limit.ts so state persists
-- across serverless cold starts and multiple instances.

create table if not exists public.rate_limit (
  key        text        primary key,
  history    bigint[]    not null default '{}',
  updated_at timestamptz not null default now()
);

-- Service-role only; never exposed to anon/authenticated directly.
revoke all on table public.rate_limit from public, anon, authenticated;

-- RPC: atomically check + record a request using a sliding window.
-- Returns true when the request is allowed, false when limit exceeded.
create or replace function public.check_rate_limit(
  p_key       text,
  p_limit     int,
  p_window_ms bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now    bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_cutoff bigint := v_now - p_window_ms;
  v_history bigint[];
begin
  -- Upsert the row, pruning stale timestamps on the fly
  insert into public.rate_limit(key, history, updated_at)
  values (p_key, array[v_now], now())
  on conflict (key) do update
    set history    = array_append(
                       array(
                         select unnest(rate_limit.history)
                         where  unnest > v_cutoff
                       ),
                       v_now
                     ),
        updated_at = now()
  returning history into v_history;

  return array_length(v_history, 1) <= p_limit;
end;
$$;

-- Only the service role may call this function.
revoke all on function public.check_rate_limit(text, int, bigint) from public, anon, authenticated;

-- Periodically clean up rows that have been idle for 24 h to prevent table bloat.
create or replace function public.cleanup_rate_limit()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limit where updated_at < now() - interval '24 hours';
$$;

revoke all on function public.cleanup_rate_limit() from public, anon, authenticated;
