-- 0074_post_drafts.sql
-- Autosave storage for the Posts CMS (Phase 2). Deliberately a separate
-- table from `posts`, not a column on it: autosave must never write to the
-- live post row directly, or a half-typed sentence on a published post would
-- go live on the public site the instant the debounce fires. Drafts here are
-- only merged into the real row when the admin explicitly submits the form.

create table if not exists public.post_drafts (
  id uuid primary key default gen_random_uuid(),
  -- Existing post being edited. Null while drafting a brand-new post that
  -- hasn't been created yet.
  post_id uuid references public.posts(id) on delete cascade,
  -- Client-generated key (crypto.randomUUID(), persisted in sessionStorage)
  -- used to autosave a new post before it has a real id. Null once the post
  -- exists and post_id is used instead.
  draft_key text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  constraint post_drafts_has_target check (post_id is not null or draft_key is not null)
);

-- One draft per (user, post) and one per (user, draft_key) — upserts target
-- whichever the caller has (post_id once the post exists, draft_key before).
create unique index if not exists idx_post_drafts_user_post
  on public.post_drafts (user_id, post_id) where post_id is not null;
create unique index if not exists idx_post_drafts_user_key
  on public.post_drafts (user_id, draft_key) where draft_key is not null;

create or replace function public.post_drafts_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_post_drafts_updated_at on public.post_drafts;
create trigger trg_post_drafts_updated_at
  before update on public.post_drafts
  for each row execute function public.post_drafts_set_updated_at();

alter table public.post_drafts enable row level security;

-- All access goes through requirePermission("posts", ...)-guarded Server
-- Actions using the service-role client, same as the posts table itself —
-- RLS here is a defense-in-depth backstop, not the primary gate.
create policy "Admins can manage post drafts" on public.post_drafts
  for all using (public.is_admin());
