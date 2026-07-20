-- 0099_post_events.sql
--
-- Event support for the News & Events hub (public /posts).
--
-- Posts already carry a `category` of 'Event' (lib/admin/posts-shared.ts), but
-- an event was indistinguishable from a normal article: no date, location,
-- format, registration, or cancellation state. These additive columns let an
-- Event-category post describe *when* and *where* it happens so the public page
-- can show upcoming/ongoing/ended status and a safe registration action.
--
-- Design notes:
--   * Only the *override* states (cancelled / postponed) are stored. The
--     lifecycle states upcoming / ongoing / ended are DERIVED from the dates in
--     one place (lib/posts/event-status.ts) and never persisted — a stored
--     "upcoming" would silently go stale.
--   * Timestamps are timestamptz (UTC on the wire); the app formats them in
--     Asia/Phnom_Penh for display. Never store a formatted date string.
--   * All columns are nullable with no default, so every existing post is
--     untouched and non-event posts simply leave them null. No backfill.
--
-- Safe to apply at any time; additive only, no RLS change (the posts policy
-- from 0073 still governs row visibility).

alter table public.posts
  add column if not exists event_start_at            timestamptz,
  add column if not exists event_end_at              timestamptz,
  add column if not exists event_location            text,
  add column if not exists event_format              text
    check (event_format is null or event_format in ('in_person', 'online', 'hybrid')),
  add column if not exists event_registration_url    text,
  add column if not exists event_registration_deadline timestamptz,
  add column if not exists event_status_override     text
    check (event_status_override is null or event_status_override in ('cancelled', 'postponed'));

-- Sorting/filtering "upcoming events" hits event_start_at; index only the rows
-- that actually have a date (events), keeping the index small.
create index if not exists idx_posts_event_start_at
  on public.posts (event_start_at)
  where event_start_at is not null;
