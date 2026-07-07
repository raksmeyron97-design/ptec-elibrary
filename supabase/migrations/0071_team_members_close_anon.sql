-- ══════════════════════════════════════════════════════════════════════════
--  Migration 0071 — Close direct anon access to team_members
--
--  ⚠ Apply ONLY AFTER the team-directory app update is deployed. The old
--  /about/team page read team_members_with_email with the anon key; dropping
--  this policy while the old code is live would blank the public team page.
--
--  The public page now reads team_members_public (migration 0070), which
--  already enforces publish state and the per-member privacy toggles.
--  Without this drop, anyone could still read internal phone numbers of
--  published members straight from PostgREST.
-- ══════════════════════════════════════════════════════════════════════════

drop policy if exists "team_members_public_read" on public.team_members;
