-- 0023_ai_usage.sql
-- Per-user daily AI usage quota for the library assistant.
-- "Day" is defined in Asia/Phnom_Penh (UTC+7) to match the user's local midnight reset.

-- ── Table ─────────────────────────────────────────────────────────────────────
-- user_id has no FK constraint because the global circuit-breaker uses a sentinel
-- UUID (00000000-0000-0000-0000-000000000000) that is not a real auth.users row.
-- Access is restricted to the service role via RLS + RPC — no direct writes are allowed.
create table if not exists public.ai_usage (
  user_id   uuid not null,
  used_on   date not null,
  count     int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, used_on)
);

alter table public.ai_usage enable row level security;

-- Users may read their own rows (widget can display "X/10 left").
-- All writes go through the service role via RPC only.
create policy "read own ai usage"
  on public.ai_usage for select
  using (auth.uid() = user_id);

-- ── Atomic increment-or-block RPC ─────────────────────────────────────────────
-- Returns: remaining quota AFTER this use (>= 0),
--       or -1 if already at/over the limit (does NOT increment).
-- Called server-side with the service role, so p_user_id is controlled by the
-- route — not by the caller. The function does NOT guard p_user_id = auth.uid()
-- because it is intentionally service-role-only (revoked from public below).
--
-- GLOBAL CIRCUIT BREAKER: call this function a second time with the sentinel UUID
--   '00000000-0000-0000-0000-000000000000' and p_limit = DAILY_GLOBAL_LIMIT (500).
--   The sentinel row tracks total requests across all users for the day.
create or replace function public.increment_ai_usage(p_user_id uuid, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  v_count int;
begin
  -- Ensure row exists for today (upsert-safe insert)
  insert into public.ai_usage (user_id, used_on, count)
  values (p_user_id, v_today, 0)
  on conflict (user_id, used_on) do nothing;

  -- Lock the row to prevent concurrent races
  select count into v_count
  from public.ai_usage
  where user_id = p_user_id and used_on = v_today
  for update;

  if v_count >= p_limit then
    return -1;
  end if;

  update public.ai_usage
  set count = count + 1, updated_at = now()
  where user_id = p_user_id and used_on = v_today;

  return p_limit - (v_count + 1);
end;
$$;

-- Revoke direct invocation from any role other than service_role / postgres
revoke all on function public.increment_ai_usage(uuid, int) from public;
revoke all on function public.increment_ai_usage(uuid, int) from authenticated;
revoke all on function public.increment_ai_usage(uuid, int) from anon;

-- ── Today's count helper RPC ──────────────────────────────────────────────────
-- Returns the user's used count for today (Phnom Penh date).
-- Authenticated users may call this for themselves; the route also uses it.
create or replace function public.get_ai_usage(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  v_count int := 0;
begin
  select count into v_count
  from public.ai_usage
  where user_id = p_user_id and used_on = v_today;
  return coalesce(v_count, 0);
end;
$$;

-- Allow authenticated users to call this for their own display
grant execute on function public.get_ai_usage(uuid) to authenticated;
