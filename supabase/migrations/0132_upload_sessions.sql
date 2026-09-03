-- 0132_upload_sessions.sql
--
-- Durable state for chunked admin uploads.
--
-- WHY THIS TABLE EXISTS
--
-- The chunked upload route staged parts under `os.tmpdir()/ptec-upload-chunks`
-- and kept NO record of the session anywhere else. Everything the protocol
-- needed to answer was therefore a question about a directory listing:
--
--   * "which chunks do you already have?"      → only answerable by failing
--   * "has this upload already been finalized?" → unanswerable, so every retry
--                                                 re-ran hashing, malware
--                                                 lookup and a second upload to
--                                                 storage
--   * "whose upload is this?"                   → unanswerable, so any staff
--                                                 account could finalize any
--                                                 other account's staged bytes
--   * "did the file reach storage but never reach a books row?" → unanswerable,
--                                                 which is exactly the state
--                                                 operators reported: a PDF in
--                                                 Zima that no admin screen
--                                                 shows.
--
-- `/tmp` is a tmpfs in the production container (docker-compose.yml mounts one
-- there because the root filesystem is read-only), so it is RAM that is erased
-- by every restart and every deploy. A session that spans several minutes and
-- twenty requests had its only record in the most volatile store on the box.
--
-- WHAT IS STORED HERE AND WHAT IS NOT
--
-- This row is the session's IDENTITY, OWNERSHIP, STATE and RESULT. It is not
-- the bytes, and it deliberately does not mirror which chunk files exist:
-- the staging directory is the single source of truth for that (see
-- lib/uploads/staging.ts), and a second copy in Postgres could only ever
-- disagree with it. `GET /api/admin/upload/chunk` answers "which chunks are
-- missing" by reading the directory, under this row's authorization.
--
-- STATE MACHINE (lib/uploads/state.ts owns the transition table)
--
--   CREATED → UPLOADING → FINALIZING → STORED → SAVING_DB → COMPLETED
--                  ↘          ↘           ↘         ↘
--                   └──────── FAILED / CANCELLED ────┘
--   STORED / SAVING_DB, aged out with no resource → ORPHANED
--
-- STORED is the state that matters operationally: the bytes are in Zima and no
-- database row references them yet. A session that sits in STORED past its
-- expiry is precisely the orphan class that used to be invisible.
--
-- ACCESS
--
-- Service-role only, like site_settings (0098) and book_import_runs (0129).
-- Every reader and writer is server code that has already passed
-- requireStaff() + requirePermission(<destination>, "write"), and PostgREST
-- must never expose upload state — which carries destination paths and storage
-- URLs for unpublished material — to anon or authenticated.

create table if not exists public.upload_sessions (
  -- Client-generated, server-validated (UPLOAD_ID_RE in lib/uploads/state.ts).
  -- Text rather than uuid so the id shape stays the route's contract, not the
  -- database's, and a malformed one is refused with a message.
  id                 text primary key,
  owner_id           uuid not null references auth.users(id) on delete cascade,

  state              text not null default 'CREATED'
                     check (state in ('CREATED','UPLOADING','FINALIZING','STORED',
                                      'SAVING_DB','COMPLETED','FAILED','CANCELLED','ORPHANED')),

  -- Destination, fixed at creation. A later chunk that names a different key is
  -- refused rather than followed: the key decides the permission resource, so
  -- letting it move mid-session would let a books-scoped session finish as a
  -- publications one.
  storage_key        text not null,
  folder             text not null,
  file_name          text not null,
  content_type       text,

  declared_size      bigint  not null,
  chunk_size         integer not null,
  total_chunks       integer not null,

  -- Result of finalization. Set exactly once, when FINALIZING → STORED.
  stored_url         text,
  stored_bytes       bigint,
  content_hash       text,

  -- Commit target. Set when SAVING_DB → COMPLETED, so "this upload became that
  -- book" is a fact on the row rather than an inference from a URL.
  resource_type      text check (resource_type in ('book','thesis','publication','path','post')),
  resource_id        uuid,

  -- Sub-phase inside FINALIZING, for the progress panel only.
  --
  -- The state machine deliberately does not model "hashing" and "storing" as
  -- separate states — nothing branches on the difference, and every extra state
  -- is another edge the CAS has to allow. But the operator watching a 90-second
  -- finalize on a 95 MB book badly needs to know which of the two is happening,
  -- because one is local work and the other is a network transfer that can
  -- stall. So it is one advisory column, written best-effort and never read by
  -- any decision.
  progress_phase     text,

  -- Diagnostics. `error_code` is the closed enum from lib/uploads/state.ts, so
  -- failures can be counted per class without parsing English.
  error_code         text,
  error_message      text,
  finalize_attempts  integer not null default 0,
  -- Which process staged the bytes. On a single-container deployment this is
  -- constant; it is recorded so that a request arriving at an instance that
  -- does NOT hold the staging directory can say so instead of reporting the
  -- chunks as missing.
  instance_id        text,

  created_at         timestamptz not null default timezone('utc'::text, now()),
  updated_at         timestamptz not null default timezone('utc'::text, now()),
  finalized_at       timestamptz,
  completed_at       timestamptz,
  -- After this, an unfinished session is reclaimable by the reconciler.
  expires_at         timestamptz not null
                     default timezone('utc'::text, now()) + interval '24 hours'
);

comment on table public.upload_sessions is
  'One row per chunked admin upload: identity, owner, destination, state machine position and result. Not the bytes — those stage on disk (lib/uploads/staging.ts). Service-role only.';
comment on column public.upload_sessions.state is
  'CREATED→UPLOADING→FINALIZING→STORED→SAVING_DB→COMPLETED, plus FAILED/CANCELLED/ORPHANED. Transitions are enforced in lib/uploads/state.ts and applied as compare-and-set updates, so two concurrent finalize requests cannot both proceed.';
comment on column public.upload_sessions.stored_url is
  'Set once, at FINALIZING→STORED. Its presence with no resource_id is the definition of a storage orphan.';
comment on column public.upload_sessions.instance_id is
  'Process that holds this session''s staged chunks. A mismatch means the bytes are not reachable from the instance handling the request — reported as CHUNK_STORAGE_UNAVAILABLE, never as "chunk missing".';

-- The reconciler's only scan: unfinished sessions past their expiry.
create index if not exists upload_sessions_state_expiry_idx
  on public.upload_sessions (state, expires_at);

-- "What is this operator currently uploading?" for the admin surface.
create index if not exists upload_sessions_owner_recent_idx
  on public.upload_sessions (owner_id, updated_at desc);

-- Orphan reconciliation walks stored_url back to book_files.file_url.
create index if not exists upload_sessions_stored_url_idx
  on public.upload_sessions (stored_url)
  where stored_url is not null;

-- A finished upload must be findable by what it produced, so a retried save
-- can be answered with the existing record instead of a second insert.
create index if not exists upload_sessions_resource_idx
  on public.upload_sessions (resource_type, resource_id)
  where resource_id is not null;

create or replace function public.upload_sessions_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists upload_sessions_touch_trg on public.upload_sessions;
create trigger upload_sessions_touch_trg
  before update on public.upload_sessions
  for each row execute function public.upload_sessions_touch();

-- RLS + REVOKE, per the rule in CLAUDE.md: PostgREST exposes every public-schema
-- table by default. Enabling RLS with no policy denies anon/authenticated
-- outright; the service role bypasses it, which is the only access this table
-- has by design.
alter table public.upload_sessions enable row level security;
revoke all on public.upload_sessions from public, anon, authenticated;
