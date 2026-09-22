-- 0153_duplicate_dismissals.sql
--
-- "These are not duplicates." The one verdict /admin/books/duplicates could not
-- record.
--
-- The queue is derived, not stored: every page load re-runs detection over the
-- whole published collection, so a group the librarian has already judged comes
-- back identical on the next load, and on every load after that, forever. Until
-- now the ONLY way to make a group leave the queue was to archive one of its
-- records — which means the page rewarded retiring a book over deciding that it
-- should not be retired. Measured against production on 2026-09-22: 73 groups,
-- and a large share of them are separate grade-level volumes of one textbook
-- series whose titles arrived truncated, i.e. records that must NOT be retired
-- and that no reviewer could ever clear. A queue that cannot reach zero stops
-- being read, and the real duplicates inside it stop being found.
--
-- WHY A FINGERPRINT AND NOT A PAIR OF IDS. A dismissal is a statement about the
-- exact set of records the reviewer was shown. Storing it as pairs would drag in
-- union-find transitivity: dismissing (A,B) while A~C and B~C still leaves A and
-- B in one cluster through C, so the dismissal appears to do nothing. Storing it
-- as the group's own `key` is worse — that key is the union-find ROOT, which is
-- an implementation detail that moves when an unrelated record joins. The stable
-- thing is the MEMBERSHIP: sha256 over the group's book ids, sorted. Add a
-- record to the group and the fingerprint changes, so the group resurfaces —
-- which is correct, because it is now a different question.
--
-- (Same reasoning as the security module's incident fingerprints: deduplicate on
-- the stable description of the thing, never on a volatile identifier.)
--
-- WHY `book_ids` IS AN ARRAY WITH NO FOREIGN KEY. A group has N members, so the
-- reference cannot be a column, and Postgres has no FK from an array element.
-- Nothing depends on referential integrity here: a dismissal whose books have
-- been deleted simply never matches a fingerprint again. It is inert, never
-- wrong — it cannot hide a live group, because a live group's fingerprint is
-- computed from the books that still exist. The array is kept so the restore
-- list can name what was dismissed without re-deriving it.
--
-- Dismissal is REVERSIBLE by design and audited on both edges
-- (book.duplicate_group_dismissed / .restored in admin_actions).
--
-- Rollback:
--   drop table if exists public.duplicate_dismissals;
-- Nothing is destroyed that this migration did not create.

create table if not exists public.duplicate_dismissals (
  -- sha256 hex of the group's sorted book ids, joined by ':'. Computed in
  -- TypeScript by duplicateGroupFingerprint() (lib/admin/duplicate-dismissal.ts)
  -- so the detector and this table cannot develop two ideas of "the same group".
  fingerprint   text primary key,
  book_ids      uuid[] not null,
  -- Free text, optional: why this is not a duplicate. Shown on the restore list
  -- so a later reviewer inherits the reasoning rather than re-deriving it.
  note          text,
  dismissed_by  uuid references public.profiles(id) on delete set null,
  dismissed_at  timestamptz not null default now(),

  constraint duplicate_dismissals_book_ids_len check (array_length(book_ids, 1) >= 2),
  constraint duplicate_dismissals_note_len check (note is null or char_length(note) <= 500)
);

-- The restore list is "most recently dismissed first", and it is the only query
-- that does not go through the primary key.
create index if not exists duplicate_dismissals_dismissed_at_idx
  on public.duplicate_dismissals (dismissed_at desc);

comment on table public.duplicate_dismissals is
  'Duplicate groups a librarian has judged NOT to be duplicates, keyed by a hash of the group''s exact membership. Reversible; read and written only by the service role.';

-- Read exclusively through the service client from /admin/books/duplicates,
-- which is already gated on books:write by the admin access registry. PostgREST
-- exposes every public-schema table by default, so this both enables RLS (with
-- no policy, denying everything) and revokes the API roles outright.
alter table public.duplicate_dismissals enable row level security;

revoke all on public.duplicate_dismissals from public, anon, authenticated;
grant all on public.duplicate_dismissals to service_role;
