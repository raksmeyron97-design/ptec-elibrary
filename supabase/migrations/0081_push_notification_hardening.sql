-- 0081_push_notification_hardening.sql
-- Harden Web Push subscriptions for authenticated, idempotent delivery.

alter table public.push_subscriptions
  add column if not exists enabled boolean not null default true,
  add column if not exists platform text,
  add column if not exists browser text,
  add column if not exists user_agent text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_failure_at timestamptz,
  add column if not exists failure_count integer not null default 0;

update public.push_subscriptions
set enabled = true,
    updated_at = coalesce(updated_at, created_at, now())
where enabled is null
   or updated_at is null;

alter table public.push_subscriptions
  add constraint push_subscriptions_failure_count_nonnegative
  check (failure_count >= 0) not valid;

alter table public.push_subscriptions
  validate constraint push_subscriptions_failure_count_nonnegative;

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions(user_id);

create index if not exists idx_push_subscriptions_enabled
  on public.push_subscriptions(enabled);

create index if not exists idx_push_subscriptions_user_enabled
  on public.push_subscriptions(user_id, enabled);

drop policy if exists "users_own_subscriptions" on public.push_subscriptions;
drop policy if exists "service_role_read_all" on public.push_subscriptions;

create policy "users_select_own_push_subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "users_insert_own_push_subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "users_update_own_push_subscriptions"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users_delete_own_push_subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;
