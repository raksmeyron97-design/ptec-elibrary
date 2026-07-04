-- 0025_fix_ai_usage_fk.sql
-- Drop the FK constraint on ai_usage.user_id so the global circuit-breaker
-- sentinel UUID (00000000-0000-0000-0000-000000000000) can be stored without
-- needing a matching auth.users row. The table is service-role-only via RLS.
alter table public.ai_usage
  drop constraint if exists ai_usage_user_id_fkey;
