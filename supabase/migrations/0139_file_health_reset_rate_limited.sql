-- 0139_file_health_reset_rate_limited.sql
-- One-off data repair for the file-health sweep's rate-limit false alarm.
--
-- scripts/check-file-health.ts probed ~540 storage URLs anonymously; Zima
-- meters anonymous /files reads at 300/min per IP, so every probe after the
-- ~300th got HTTP 429 and the script — which treated any non-2xx as broken —
-- wrote ~100 rows as status 'broken' with http_status 429. The dashboard then
-- reported them as "PDF broken" / "Cover image broken".
--
-- A 429 is a statement about the caller's quota, not about the file. The
-- script now sends x-api-key to Zima (3000/min bucket), retries 429 with
-- backoff, and records an exhausted retry as 'unknown', never 'broken'
-- (lib/file-health/check.ts). This migration clears the rows the old
-- behaviour left behind. Per the operator's instruction they are reset to
-- 'ok' — the same host answered 200 for every other row of the same sweep —
-- and the next scheduled sweep (Sundays, .github/workflows/check-file-health.yml)
-- re-measures every one of them and overwrites this value with a real answer.
--
-- http_status is kept so the episode stays queryable:
--   select count(*) from public.file_health where http_status = 429;
--
-- Idempotent: a second run matches nothing.

update public.file_health
   set status = 'ok'
 where status = 'broken'
   and http_status = 429;
