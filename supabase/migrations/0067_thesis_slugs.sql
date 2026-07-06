-- 0067_thesis_slugs.sql
-- SEO slugs for theses: /theses/[uuid] → /theses/[slug].
--
-- Backfills a URL-safe slug from the title for every existing row, then keeps
-- new rows covered with a BEFORE INSERT trigger (so admin UI, CSV import, and
-- any direct insert all get a slug without app-code changes).
--
-- Rules:
--   * ASCII slugify: lowercase, non [a-z0-9] runs → "-", trimmed.
--   * Khmer-only / symbol-only titles slugify to "" — those fall back to
--     "thesis-<first 8 chars of the uuid>" so the URL is stable and unique.
--   * Collisions are disambiguated with the same 8-char uuid suffix
--     (deterministic — safe to re-run, no counters, no race conditions).
--   * Slugs are generated once and never rewritten on title updates:
--     published URLs must stay stable.

-- ── Column ───────────────────────────────────────────────────────────────────
alter table public.research_reports
  add column if not exists slug text;

-- ── Slugify helper ───────────────────────────────────────────────────────────
create or replace function public.slugify(value text)
returns text
language sql
immutable
strict
as $$
  select btrim(
    regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'),
    '-'
  );
$$;

-- ── Backfill existing rows ───────────────────────────────────────────────────
-- Pass 1: plain slug from title (empty → uuid fallback).
update public.research_reports
set slug = coalesce(nullif(public.slugify(title), ''), 'thesis-' || left(id::text, 8))
where slug is null or slug = '';

-- Pass 2: de-duplicate — every row after the first (by created_at, id) with the
-- same slug gets the uuid suffix.
with ranked as (
  select id,
         row_number() over (partition by slug order by created_at, id) as rn
  from public.research_reports
)
update public.research_reports r
set slug = r.slug || '-' || left(r.id::text, 8)
from ranked
where ranked.id = r.id and ranked.rn > 1;

-- ── Uniqueness ───────────────────────────────────────────────────────────────
alter table public.research_reports
  alter column slug set not null;

create unique index if not exists research_reports_slug_key
  on public.research_reports (slug);

-- ── Auto-slug trigger for new rows ───────────────────────────────────────────
create or replace function public.research_reports_set_slug()
returns trigger
language plpgsql
as $$
declare
  base_slug text;
begin
  if new.slug is null or new.slug = '' then
    base_slug := coalesce(nullif(public.slugify(new.title), ''), 'thesis-' || left(new.id::text, 8));
    if exists (select 1 from public.research_reports where slug = base_slug and id <> new.id) then
      base_slug := base_slug || '-' || left(new.id::text, 8);
    end if;
    new.slug := base_slug;
  end if;
  return new;
end;
$$;

drop trigger if exists research_reports_set_slug on public.research_reports;
create trigger research_reports_set_slug
  before insert on public.research_reports
  for each row
  execute function public.research_reports_set_slug();
