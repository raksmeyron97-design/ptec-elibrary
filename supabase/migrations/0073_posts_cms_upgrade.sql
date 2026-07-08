-- 0073_posts_cms_upgrade.sql
-- Admin Posts CMS rebuild (Phase 1): real publishing states, scheduling,
-- visibility, SEO fields, and per-image alt-text/hero metadata.
--
-- Same load-bearing pattern as 0061_review_status.sql: `status` becomes the
-- source of truth and a BEFORE trigger keeps the existing `is_published`
-- boolean in sync, so every existing query, the RLS policies below (only
-- lightly extended), and app code that still reads/writes `is_published`
-- keep working untouched. Do NOT convert `is_published` to a generated
-- column — see the note in 0061 (it would cascade-drop dependent policies).

alter table public.posts
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'published', 'scheduled', 'archived')),
  add column if not exists scheduled_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'unlisted', 'admin_only')),
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists og_image text,
  -- Per-image alt-text/hero flag, keyed by URL: { "<url>": { "alt": "...", "isHero": true } }.
  -- Display order still comes from the existing cover_urls array.
  add column if not exists cover_meta jsonb not null default '{}';

update public.posts
  set status = case when is_published then 'published' else 'draft' end
  where status = 'draft' and is_published = true;

update public.posts
  set published_at = created_at
  where is_published = true and published_at is null;

create or replace function public.posts_sync_publish_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_published, false) and new.status = 'draft' then
      new.status := 'published';
    end if;
    new.is_published := (new.status = 'published');
    if new.status = 'published' and new.published_at is null then
      new.published_at := now();
    end if;
    if new.status = 'archived' and new.archived_at is null then
      new.archived_at := now();
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    new.is_published := (new.status = 'published');
    if new.status = 'published' and new.published_at is null then
      new.published_at := now();
    end if;
    if new.status = 'archived' then
      new.archived_at := now();
    elsif old.status = 'archived' then
      new.archived_at := null;
    end if;
  elsif new.is_published is distinct from old.is_published then
    -- Legacy path: something wrote is_published directly (e.g. an old
    -- togglePublish call). Derive status from it so the two never drift.
    new.status := case when new.is_published then 'published' else 'draft' end;
    if new.is_published and new.published_at is null then
      new.published_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists posts_sync_publish_status on public.posts;
create trigger posts_sync_publish_status
  before insert or update on public.posts
  for each row execute function public.posts_sync_publish_status();

create index if not exists idx_posts_status on public.posts (status);
create index if not exists idx_posts_scheduled_at on public.posts (scheduled_at)
  where status = 'scheduled';

-- RLS: keep "published only" for the public, and additionally hide
-- admin_only posts even if published. `unlisted` posts stay readable here
-- (direct-link access) — they're excluded from the public /posts index at
-- the application query level instead, since RLS can't distinguish a
-- listing query from a single-row detail query.
drop policy if exists "Public can view published posts" on public.posts;
create policy "Public can view published posts" on public.posts
  for select using (is_published = true and visibility <> 'admin_only');
