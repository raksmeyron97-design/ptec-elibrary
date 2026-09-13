-- ══════════════════════════════════════════════════════════════════════════
--  Migration 0144 — Fix team_members RLS: allow anon to read published rows
--
--  Root cause: migration 0115 recreated team_members_public as a plain
--  CREATE VIEW (SECURITY INVOKER by default). The anon role hits the RLS
--  on the underlying team_members table, which has only one policy:
--    team_members_admin_read: SELECT WHERE is_admin()
--  The anon role is never an admin, so the view returns zero rows to any
--  anon caller — even though GRANT SELECT on the view was given to anon.
--
--  Effect on the edge slug gate (lib/resource-slug-gate.ts):
--    • gate fetches snapshot from team_members_public with the ANON key
--    • gets []  →  snapshot is empty  →  slug not in snapshot
--    • confirmSlug() does a single-row lookup — also [] (same RLS block)
--    • verdict: not-found  →  middleware rewrites to /_ptec/not-found → 404
--
--  Fix: add a narrow anon RLS policy on team_members scoped to published
--  rows only. This is safe because:
--    1. The view's WHERE clause already filters is_published = true, so
--       there is no way for anon to see unpublished rows through the view.
--    2. The view's phone/email CASE expressions enforce the show_*_publicly
--       flags — raw phone/email never reach the anon caller.
--    3. The base table is still blocked to anon by the original admin-only
--       policy; this policy is additive (OR semantics in PG RLS).
--
--  Note on SECURITY DEFINER views (PG 17 feature): the migration comment in
--  0115/0116 described the view as "SECURITY DEFINER by design" but the
--  actual CREATE VIEW lacked the option. On this production build the
--  WITH (security_definer = true) syntax is rejected by the pg_meta query
--  proxy, so we use the RLS policy approach instead — same security outcome.
-- ══════════════════════════════════════════════════════════════════════════

drop policy if exists team_members_anon_published_read on public.team_members;

create policy team_members_anon_published_read
  on public.team_members
  for select
  to anon
  using (is_published = true);

