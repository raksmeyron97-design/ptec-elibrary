-- Migration 0124: Reconcile hosted schema drift found during the 2026-08-28
-- pre-handover audit (scripts/migrations/check-schema-drift.mjs).
--
-- Two objects defined in the migration chain were absent from the hosted DB:
--
-- 1. public.contact_rate_limit (baseline, originally 0005/0019) — MISSING.
--    app/api/contact/route.ts checkLimit() selects from it; on a missing table
--    PostgREST errors, `data` is null, history falls back to [] and the
--    function returns { blocked: false } unconditionally. The contact form's
--    60s cooldown and hourly cap were therefore inert in production (Turnstile
--    was the only remaining anti-spam layer). recordSend()'s upsert also
--    silently no-opped, so nothing was ever recorded.
--
-- 2. public.categories.created_at (baseline) — MISSING. Currently unread by
--    app code, but restored so the chain and the hosted DB agree and future
--    `select("*")` reads do not diverge between local and hosted.
--
-- Both statements are idempotent: this migration is safe to re-run and applies
-- cleanly to a fresh stack built from the squashed baseline (where the objects
-- already exist, making each branch a no-op).

-- ── 1. contact_rate_limit ─────────────────────────────────────────────────────
create table if not exists public.contact_rate_limit (
  ip         text primary key,
  history    bigint[] default '{}',
  created_at timestamptz default timezone('utc'::text, now())
);

-- Service-role only: RLS enabled with no policies, matching the baseline's
-- treatment of this table and contact_messages (0078). PostgREST exposes every
-- public-schema table by default, so this is the required guard.
alter table public.contact_rate_limit enable row level security;

revoke all on public.contact_rate_limit from public, anon, authenticated;

-- ── 2. categories.created_at ──────────────────────────────────────────────────
alter table public.categories
  add column if not exists created_at timestamptz default timezone('utc'::text, now());
