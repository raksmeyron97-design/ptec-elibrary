-- 0148_journals.sql
--
-- Gives the scholarly-article collection a Journal → Volume → Issue → Article
-- hierarchy, without renaming or rebuilding `publications`.
-- Full picture: docs/JOURNALS-ARCHITECTURE.md.
--
-- ADDITIVE and IDEMPOTENT: three new tables, three nullable FK columns on
-- `publications`, one trigger, one recreated view. No column is dropped, no
-- legacy value is rewritten except to strip surrounding whitespace from a
-- journal name that was successfully mapped. No `created_at` is ordered or
-- filtered on anywhere in this file (hosted chain drift; see MIGRATIONS.md).
--
-- ── The one rule that makes this safe with the existing code ────────────────
--
-- The legacy text columns (`journal_name`, `volume`, `issue_no`) are still
-- what every reader uses — SEO, Google Scholar tags, citations, OAI-PMH, AI
-- evidence — and what the admin workspace WRITES, through
-- `save_publication_atomic`, whose column list is explicit. So:
--
--   * the canonical FKs are RESOLVED FROM the text the workspace writes, by a
--     trigger, deterministically (exact match after trim / whitespace-collapse
--     / case-fold, or an alias an admin recorded) — the RPC is untouched;
--   * when a caller sets an FK directly, the text is MIRRORED FROM it, so the
--     two can never disagree about a mapped row;
--   * a journal is NEVER created by the trigger. Volumes and issues are, but
--     only inside a journal that already resolved — a volume number within a
--     known journal is an exact fact, while a journal NAME is exactly the
--     thing that varies. An unresolved name leaves the article unmapped, and
--     unmapped is reported (`journal_mapping_report`), never guessed.
--
-- ── What production held when this was written (2026-09-14) ─────────────────
--
-- `publications`: 0 rows. The backfill at the bottom is therefore a no-op
-- there; it exists for every other database (local stacks, restores) and is
-- deterministic regardless. docs/JOURNALS-PRE-MIGRATION-AUDIT.md.
--
-- Rollback: see the bottom of this file.

-- ── 1. Matching and slug helpers ─────────────────────────────────────────────

-- The ONE definition of "the same journal name". Deliberately weak: trim,
-- collapse internal whitespace, case-fold. No punctuation folding, no
-- abbreviation expansion, no similarity — "J. Chem. Educ." and "Journal of
-- Chemical Education" are two names until an admin records one as an alias of
-- the other. lib/journals/mapping.ts `journalMatchKey()` is the TypeScript twin
-- and lib/journals/mapping.test.ts pins that they apply the same three steps.
create or replace function public.journal_match_key(p_name text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g')), '');
$$;

-- The display form of a name: trimmed and whitespace-collapsed, case kept.
create or replace function public.journal_clean_name(p_name text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
$$;

-- A URL segment from free text: lower-case, runs of anything that is not a
-- letter, mark or digit become one hyphen. Used only to MINT a slug for a row
-- that has none (issue slugs, the backfill); an admin-entered slug is kept.
create or replace function public.journal_slugify(p_text text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(btrim(regexp_replace(lower(coalesce(p_text, '')), '[^[:alnum:]]+', '-', 'g'), '-'), '');
$$;

-- ── 2. journals ──────────────────────────────────────────────────────────────

create table if not exists public.journals (
  id                uuid        primary key default gen_random_uuid(),
  slug              text        not null unique,
  -- Short editorial code (e.g. "CJTE"). Optional; unique when present.
  code              text        unique,
  title             text        not null,
  title_km          text,
  short_title       text,
  description       text,
  description_km    text,
  publisher_name    text,
  publisher_name_km text,
  -- `issn` is the linking / primary ISSN a citation carries; `e_issn` and
  -- `print_issn` are the medium-specific ones when a journal has both.
  -- Validated in lib/seo/identifiers.ts before any of them reaches output.
  issn              text,
  e_issn            text,
  print_issn        text,
  language          text,
  country           text,
  frequency         text,
  logo_url          text,
  cover_url         text,
  aims_scope        text,
  aims_scope_km     text,
  website_url       text,
  contact_email     text,
  -- Other spellings of this journal's name that articles carry and that an
  -- admin has confirmed mean THIS journal. The deterministic mapping table:
  -- nothing is ever added here automatically.
  aliases           text[]      not null default '{}',
  is_published      boolean     not null default false,
  -- Whether the journal PAGE may be indexed. Independent of is_published:
  -- a public journal can still ask not to be indexed.
  is_indexable      boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint journals_title_present check (journal_clean_name(title) is not null),
  -- A slug is a single URL segment. `articles` is reserved because
  -- /journals/articles/<slug> is the article route.
  constraint journals_slug_shape check (
    slug = btrim(slug)
    and length(slug) between 1 and 120
    and slug !~ '[/?#%[:space:]]'
    and slug = lower(slug)
    and slug not in ('articles')
  )
);

comment on table public.journals is
  'Scholarly journals whose articles the library holds. Articles (publications) reference them through journal_id. See docs/JOURNALS-ARCHITECTURE.md.';
comment on column public.journals.aliases is
  'Admin-confirmed alternative spellings of the journal name. Matching is exact after trim/whitespace-collapse/case-fold (journal_match_key); nothing is added here automatically.';

-- No two journals may share a match key through their titles. (Aliases are
-- checked by the trigger below, which a unique index cannot express.)
create unique index if not exists journals_title_match_key_uniq
  on public.journals (public.journal_match_key(title));

create or replace function public.journals_keys_unique()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_keys  text[];
  v_clash text;
begin
  select coalesce(array_agg(distinct k), '{}')
    into v_keys
    from unnest(array_append(new.aliases, new.title)) as a(name)
    cross join lateral (select public.journal_match_key(a.name) as k) m
   where m.k is not null;

  select j.title into v_clash
    from public.journals j
   where j.id <> new.id
     and (
       public.journal_match_key(j.title) = any (v_keys)
       or exists (
         select 1 from unnest(j.aliases) x(alias)
          where public.journal_match_key(x.alias) = any (v_keys)
       )
     )
   limit 1;

  if v_clash is not null then
    raise exception 'journal name or alias collides with existing journal "%"', v_clash
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_journals_keys_unique on public.journals;
create trigger trg_journals_keys_unique
  before insert or update of title, aliases on public.journals
  for each row execute function public.journals_keys_unique();

drop trigger if exists trg_journals_updated_at on public.journals;
create trigger trg_journals_updated_at
  before update on public.journals
  for each row execute function public.set_updated_at();

-- ── 3. journal_volumes ───────────────────────────────────────────────────────

create table if not exists public.journal_volumes (
  id            uuid        primary key default gen_random_uuid(),
  journal_id    uuid        not null references public.journals (id) on delete cascade,
  -- Text, as the legacy `publications.volume` is: "7", "102", "3A". Ordered
  -- numerically where it is a number (volume_sort), textually otherwise.
  volume_number text        not null,
  volume_sort   numeric     generated always as (
                  case when volume_number ~ '^[0-9]{1,9}$' then volume_number::numeric end
                ) stored,
  label         text,
  year          integer     check (year between 1800 and 2200),
  start_date    date,
  end_date      date,
  cover_url     text,
  description   text,
  is_published  boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint journal_volumes_number_shape check (
    volume_number = btrim(volume_number) and volume_number <> ''
  ),
  constraint journal_volumes_dates check (end_date is null or start_date is null or end_date >= start_date),
  constraint journal_volumes_number_uniq unique (journal_id, volume_number),
  -- Target of the composite FKs that make a cross-journal volume impossible.
  constraint journal_volumes_id_journal_uniq unique (id, journal_id)
);

create index if not exists journal_volumes_journal_idx on public.journal_volumes (journal_id);

drop trigger if exists trg_journal_volumes_updated_at on public.journal_volumes;
create trigger trg_journal_volumes_updated_at
  before update on public.journal_volumes
  for each row execute function public.set_updated_at();

-- ── 4. journal_issues ────────────────────────────────────────────────────────

create table if not exists public.journal_issues (
  id               uuid        primary key default gen_random_uuid(),
  journal_id       uuid        not null references public.journals (id) on delete cascade,
  -- NULL for journals that number issues continuously with no volumes.
  volume_id        uuid,
  issue_number     text,
  issue_label      text,
  title            text,
  title_km         text,
  -- Unique within the journal; the URL is /journals/<journal>/issues/<slug>.
  slug             text        not null,
  published_date   date,
  cover_url        text,
  description      text,
  description_km   text,
  is_special_issue boolean     not null default false,
  is_published     boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- The volume must belong to the SAME journal. Composite, so no application
  -- code has to remember to check it.
  constraint journal_issues_volume_in_journal
    foreign key (volume_id, journal_id)
    references public.journal_volumes (id, journal_id) on delete cascade,
  constraint journal_issues_identified check (
    nullif(btrim(coalesce(issue_number, '')), '') is not null
    or nullif(btrim(coalesce(title, '')), '') is not null
  ),
  constraint journal_issues_number_shape check (
    issue_number is null or (issue_number = btrim(issue_number) and issue_number <> '')
  ),
  constraint journal_issues_slug_shape check (
    slug = btrim(slug) and length(slug) between 1 and 120 and slug !~ '[/?#%[:space:]]'
  ),
  constraint journal_issues_slug_uniq unique (journal_id, slug),
  constraint journal_issues_number_uniq unique nulls not distinct (journal_id, volume_id, issue_number),
  constraint journal_issues_id_journal_uniq unique (id, journal_id),
  constraint journal_issues_id_volume_uniq unique (id, volume_id)
);

create index if not exists journal_issues_journal_idx on public.journal_issues (journal_id);
create index if not exists journal_issues_volume_idx on public.journal_issues (volume_id);

drop trigger if exists trg_journal_issues_updated_at on public.journal_issues;
create trigger trg_journal_issues_updated_at
  before update on public.journal_issues
  for each row execute function public.set_updated_at();

-- The slug an issue gets when none is given: "vol-7-issue-2", "issue-3",
-- or the slugified title of an unnumbered special issue.
create or replace function public.journal_issue_default_slug(
  p_volume_number text,
  p_issue_number  text,
  p_title         text
)
returns text
language sql
immutable
as $$
  select coalesce(
    case
      when public.journal_slugify(p_issue_number) is not null and public.journal_slugify(p_volume_number) is not null
        then 'vol-' || public.journal_slugify(p_volume_number) || '-issue-' || public.journal_slugify(p_issue_number)
      when public.journal_slugify(p_issue_number) is not null
        then 'issue-' || public.journal_slugify(p_issue_number)
    end,
    public.journal_slugify(p_title),
    'issue-' || substr(md5(coalesce(p_volume_number, '') || '|' || coalesce(p_issue_number, '') || '|' || coalesce(p_title, '')), 1, 8)
  );
$$;

create or replace function public.journal_issues_fill_slug()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_volume text;
begin
  if new.slug is null or btrim(new.slug) = '' then
    select volume_number into v_volume from public.journal_volumes where id = new.volume_id;
    new.slug := public.journal_issue_default_slug(v_volume, new.issue_number, new.title);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_journal_issues_fill_slug on public.journal_issues;
create trigger trg_journal_issues_fill_slug
  before insert on public.journal_issues
  for each row execute function public.journal_issues_fill_slug();

-- ── 5. publications → journal / volume / issue ───────────────────────────────

alter table public.publications
  add column if not exists journal_id uuid,
  add column if not exists volume_id  uuid,
  add column if not exists issue_id   uuid;

comment on column public.publications.journal_id is
  'Canonical journal (0148). Resolved from journal_name by trigger; when set directly, journal_name is mirrored from it. See docs/JOURNALS-ARCHITECTURE.md.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'publications_journal_fk') then
    alter table public.publications
      add constraint publications_journal_fk
      foreign key (journal_id) references public.journals (id) on delete restrict;
  end if;
  -- Composite: a volume/issue from another journal cannot be attached.
  if not exists (select 1 from pg_constraint where conname = 'publications_volume_in_journal') then
    alter table public.publications
      add constraint publications_volume_in_journal
      foreign key (volume_id, journal_id) references public.journal_volumes (id, journal_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'publications_issue_in_journal') then
    alter table public.publications
      add constraint publications_issue_in_journal
      foreign key (issue_id, journal_id) references public.journal_issues (id, journal_id) on delete restrict;
  end if;
  -- …and an issue from another volume of the same journal cannot either.
  if not exists (select 1 from pg_constraint where conname = 'publications_issue_in_volume') then
    alter table public.publications
      add constraint publications_issue_in_volume
      foreign key (issue_id, volume_id) references public.journal_issues (id, volume_id) on delete restrict;
  end if;
  -- MATCH SIMPLE skips a composite FK whose journal_id is NULL, so say it.
  if not exists (select 1 from pg_constraint where conname = 'publications_journal_refs_need_journal') then
    alter table public.publications
      add constraint publications_journal_refs_need_journal
      check ((volume_id is null and issue_id is null) or journal_id is not null);
  end if;
end $$;

create index if not exists idx_publications_journal on public.publications (journal_id) where journal_id is not null;
create index if not exists idx_publications_volume  on public.publications (volume_id)  where volume_id is not null;
create index if not exists idx_publications_issue   on public.publications (issue_id)   where issue_id is not null;

-- Resolve a journal name to exactly one journal, or NULL. Two candidates is
-- NULL too — ambiguity is reported, never broken by a tie-breaker.
create or replace function public.journal_resolve_id(p_name text)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  with k as (select public.journal_match_key(p_name) as key),
  hits as (
    select distinct j.id
      from public.journals j, k
     where k.key is not null
       and (
         public.journal_match_key(j.title) = k.key
         or exists (select 1 from unnest(j.aliases) a(alias) where public.journal_match_key(a.alias) = k.key)
       )
  )
  select case when (select count(*) from hits) = 1 then (select id from hits) end;
$$;

-- Find-or-create the volume `p_volume` inside a known journal.
create or replace function public.journal_ensure_volume(p_journal_id uuid, p_volume text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_number text := nullif(btrim(coalesce(p_volume, '')), '');
  v_id     uuid;
begin
  if p_journal_id is null or v_number is null then
    return null;
  end if;
  insert into public.journal_volumes (journal_id, volume_number)
  values (p_journal_id, v_number)
  on conflict (journal_id, volume_number) do nothing;
  select id into v_id from public.journal_volumes
   where journal_id = p_journal_id and volume_number = v_number;
  return v_id;
end;
$$;

-- Find-or-create issue `p_issue` inside a known journal (and volume, if any).
create or replace function public.journal_ensure_issue(p_journal_id uuid, p_volume_id uuid, p_issue text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_number text := nullif(btrim(coalesce(p_issue, '')), '');
  v_volume text;
  v_slug   text;
  v_id     uuid;
begin
  if p_journal_id is null or v_number is null then
    return null;
  end if;
  select id into v_id from public.journal_issues
   where journal_id = p_journal_id
     and volume_id is not distinct from p_volume_id
     and issue_number = v_number;
  if v_id is not null then
    return v_id;
  end if;

  select volume_number into v_volume from public.journal_volumes where id = p_volume_id;
  v_slug := public.journal_issue_default_slug(v_volume, v_number, null);
  -- Two different numbers can slugify alike ("1/2" and "1-2"); the second one
  -- gets a short deterministic suffix rather than failing the article save.
  if exists (select 1 from public.journal_issues where journal_id = p_journal_id and slug = v_slug) then
    v_slug := v_slug || '-' || substr(md5(coalesce(v_volume, '') || '|' || v_number), 1, 6);
  end if;

  insert into public.journal_issues (journal_id, volume_id, issue_number, slug)
  values (p_journal_id, p_volume_id, v_number, v_slug)
  on conflict do nothing;
  select id into v_id from public.journal_issues
   where journal_id = p_journal_id
     and volume_id is not distinct from p_volume_id
     and issue_number = v_number;
  return v_id;
end;
$$;

revoke all on function public.journal_ensure_volume(uuid, text) from public, anon, authenticated;
revoke all on function public.journal_ensure_issue(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.publications_sync_journal_refs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fk_mode   boolean;
  v_text_mode boolean;
  v_journal   uuid;
  v_volume    uuid;
begin
  if tg_op = 'INSERT' then
    v_fk_mode   := new.journal_id is not null or new.volume_id is not null or new.issue_id is not null;
    v_text_mode := not v_fk_mode;
  else
    v_fk_mode := new.journal_id is distinct from old.journal_id
              or new.volume_id  is distinct from old.volume_id
              or new.issue_id   is distinct from old.issue_id;
    v_text_mode := not v_fk_mode and (
                   new.journal_name is distinct from old.journal_name
                or new.volume       is distinct from old.volume
                or new.issue_no     is distinct from old.issue_no);
  end if;

  if v_fk_mode then
    -- An explicit FK is authoritative. Fill missing parents from the most
    -- specific reference given; a CONTRADICTING parent is left in place so the
    -- composite foreign keys reject it rather than this trigger hiding it.
    if new.issue_id is not null then
      select journal_id, volume_id into v_journal, v_volume from public.journal_issues where id = new.issue_id;
      new.journal_id := coalesce(new.journal_id, v_journal);
      new.volume_id  := coalesce(new.volume_id, v_volume);
    end if;
    if new.volume_id is not null and new.journal_id is null then
      select journal_id into new.journal_id from public.journal_volumes where id = new.volume_id;
    end if;

    if new.journal_id is not null then
      -- Mirror the text every existing reader uses.
      select title into new.journal_name from public.journals where id = new.journal_id;
      if new.volume_id is not null then
        select volume_number into new.volume from public.journal_volumes where id = new.volume_id;
      elsif nullif(btrim(coalesce(new.volume, '')), '') is not null then
        new.volume_id := public.journal_ensure_volume(new.journal_id, new.volume);
      end if;
      if new.issue_id is not null then
        select issue_number into new.issue_no from public.journal_issues where id = new.issue_id;
      elsif nullif(btrim(coalesce(new.issue_no, '')), '') is not null then
        new.issue_id := public.journal_ensure_issue(new.journal_id, new.volume_id, new.issue_no);
      end if;
    end if;
    return new;
  end if;

  if v_text_mode then
    new.journal_id := public.journal_resolve_id(new.journal_name);
    new.volume_id  := null;
    new.issue_id   := null;
    if new.journal_id is not null then
      new.volume_id := public.journal_ensure_volume(new.journal_id, new.volume);
      new.issue_id  := public.journal_ensure_issue(new.journal_id, new.volume_id, new.issue_no);
      -- Once resolved, the row speaks the canonical spelling: an alias or a
      -- stray-whitespace variant becomes the journal's title, so a mapped row
      -- never shows (or cites) a name that differs from its journal's.
      select title into new.journal_name from public.journals where id = new.journal_id;
      if new.volume_id is not null then
        select volume_number into new.volume from public.journal_volumes where id = new.volume_id;
      end if;
      if new.issue_id is not null then
        select issue_number into new.issue_no from public.journal_issues where id = new.issue_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_publications_sync_journal_refs on public.publications;
create trigger trg_publications_sync_journal_refs
  before insert or update on public.publications
  for each row execute function public.publications_sync_journal_refs();

-- A renamed journal / renumbered volume or issue carries its articles' text
-- with it, so the mirror never goes stale. Each UPDATE below changes an FK
-- column's partner text only, which the sync trigger resolves straight back
-- to the same row (titles and aliases are key-unique, see §2).
create or replace function public.journals_propagate_names()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'journals' then
    update public.publications
       set journal_name = new.title
     where journal_id = new.id
       and journal_name is distinct from new.title;
  elsif tg_table_name = 'journal_volumes' then
    update public.publications
       set volume = new.volume_number
     where volume_id = new.id
       and volume is distinct from new.volume_number;
  elsif tg_table_name = 'journal_issues' then
    update public.publications
       set issue_no = new.issue_number
     where issue_id = new.id
       and issue_no is distinct from new.issue_number;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_journals_propagate_names on public.journals;
create trigger trg_journals_propagate_names
  after update of title on public.journals
  for each row execute function public.journals_propagate_names();

drop trigger if exists trg_journal_volumes_propagate_names on public.journal_volumes;
create trigger trg_journal_volumes_propagate_names
  after update of volume_number on public.journal_volumes
  for each row execute function public.journals_propagate_names();

drop trigger if exists trg_journal_issues_propagate_names on public.journal_issues;
create trigger trg_journal_issues_propagate_names
  after update of issue_number on public.journal_issues
  for each row execute function public.journals_propagate_names();

-- ── 6. publications_with_stats: pick up the new columns ──────────────────────
-- `select p.*` is frozen at CREATE time (the 0114 / 0125 lesson). Body is
-- 0125's, byte-for-byte.
drop view if exists public.publications_with_stats;

create view public.publications_with_stats
with (security_invoker = true)
as
select
  p.*,
  (
    select string_agg(pa.full_name, ', ' order by pas.author_order)
    from public.publication_authorships pas
    join public.publication_authors pa on pa.id = pas.author_id
    where pas.publication_id = p.id
  ) as author_names
from public.publications p;

grant select on public.publications_with_stats to anon, authenticated;

-- ── 7. Visibility ────────────────────────────────────────────────────────────
--
-- A journal is public when it is published. A volume or issue is public when
-- it is published AND its journal is. Whether an ISSUE PAGE exists is one step
-- stricter — it also needs at least one published article — and that rule
-- lives in journal_issues_public below, which is what the edge gate and the
-- page both read, so a published issue with nothing in it is a 404 rather than
-- an empty page ("no orphan issue").

alter table public.journals        enable row level security;
alter table public.journal_volumes enable row level security;
alter table public.journal_issues  enable row level security;

revoke all on table public.journals, public.journal_volumes, public.journal_issues
  from public, anon, authenticated;
grant select on table public.journals, public.journal_volumes, public.journal_issues
  to anon, authenticated;

drop policy if exists "Public can view published journals" on public.journals;
create policy "Public can view published journals"
  on public.journals for select
  using (is_published = true or public.is_admin());

drop policy if exists "Public can view volumes of published journals" on public.journal_volumes;
create policy "Public can view volumes of published journals"
  on public.journal_volumes for select
  using (
    (is_published = true
      and exists (select 1 from public.journals j where j.id = journal_id and j.is_published = true))
    or public.is_admin()
  );

drop policy if exists "Public can view issues of published journals" on public.journal_issues;
create policy "Public can view issues of published journals"
  on public.journal_issues for select
  using (
    (is_published = true
      and exists (select 1 from public.journals j where j.id = journal_id and j.is_published = true))
    or public.is_admin()
  );

-- Writes: Server Actions on the service-role client after
-- requirePermission('publications', 'write'). No write policy exists.

-- The edge soft-404 gate reads this (lib/resource-slug-gate.ts,
-- RESOURCE_GATES["journals/issues"]). Its one-table/one-slug shape cannot
-- express a slug that is unique only within a journal, so the view exposes
-- the pair as one string, `<journal slug>/<issue slug>` — the same move
-- author_profiles_public (0126) makes. `is_published` is constant true: the
-- WHERE clause is the visibility rule, and the column exists for the gate's
-- `=eq.true` filter to bind to.
drop view if exists public.journal_issues_public;
create view public.journal_issues_public
with (security_invoker = true)
as
select
  j.slug || '/' || i.slug as slug,
  true                     as is_published,
  i.id                     as issue_id,
  j.id                     as journal_id
from public.journal_issues i
join public.journals j on j.id = i.journal_id
where i.is_published = true
  and j.is_published = true
  and exists (
    select 1 from public.publications p
     where p.issue_id = i.id and p.is_published = true
  );

grant select on public.journal_issues_public to anon, authenticated;

-- ── 8. Mapping report ────────────────────────────────────────────────────────
-- One row per article with where it stands. Service-role only: it lists
-- unpublished articles. scripts/journals/mapping-report.ts and the admin
-- Journals page read it; lib/journals/mapping.ts documents each status.
drop view if exists public.journal_mapping_report;
create view public.journal_mapping_report
with (security_invoker = true)
as
select
  p.id,
  p.slug,
  p.is_published,
  p.journal_name,
  p.volume,
  p.issue_no,
  p.journal_id,
  p.volume_id,
  p.issue_id,
  case
    when p.journal_id is null and public.journal_match_key(p.journal_name) is null then 'no_journal'
    when p.journal_id is null and (
      select count(*) from public.journals j
       where public.journal_match_key(j.title) = public.journal_match_key(p.journal_name)
          or exists (select 1 from unnest(j.aliases) a(alias)
                      where public.journal_match_key(a.alias) = public.journal_match_key(p.journal_name))
    ) > 1 then 'ambiguous'
    when p.journal_id is null then 'unmapped'
    when (nullif(btrim(coalesce(p.volume, '')), '') is not null and p.volume_id is null)
      or (nullif(btrim(coalesce(p.issue_no, '')), '') is not null and p.issue_id is null) then 'partial'
    when p.journal_name is distinct from (select title from public.journals where id = p.journal_id) then 'invalid'
    else 'mapped'
  end as mapping_status
from public.publications p;

revoke all on public.journal_mapping_report from public, anon, authenticated;

-- ── 9. Backfill ──────────────────────────────────────────────────────────────
--
-- One journal per distinct match key, but ONLY where every article agrees on
-- the spelling after trim + whitespace-collapse. Two spellings that differ
-- only by case ("Journal of X" / "journal of x") are AMBIGUOUS: neither is
-- created, both articles stay unmapped and appear in journal_mapping_report,
-- and an admin decides which spelling is the title and records the other as
-- an alias. Nothing else is copied onto the journal — not the ISSN, not the
-- publisher — because the article rows are not an authoritative source for a
-- journal record (the seed's own CJTE ISSN fails its check digit). The journal
-- is published only if it has a published article.
--
-- Slug: journal_slugify(title); an empty slug (a name with no letters the
-- database's [[:alnum:]] recognises) or a taken one falls back to a
-- deterministic hash of the match key, so re-running mints the same slug.
do $$
declare
  v_created integer := 0;
  v_mapped  integer := 0;
begin
  with spellings as (
    select public.journal_match_key(journal_name) as key,
           public.journal_clean_name(journal_name) as name,
           bool_or(is_published) as any_published
      from public.publications
     where public.journal_match_key(journal_name) is not null
       and journal_id is null
     group by 1, 2
  ),
  keys as (
    select key, min(name) as name, count(*) as variants, bool_or(any_published) as any_published
      from spellings
     group by key
  ),
  candidates as (
    select k.*,
           coalesce(public.journal_slugify(k.name), 'journal-' || substr(md5(k.key), 1, 8)) as base_slug
      from keys k
     where k.variants = 1
       and public.journal_resolve_id(k.name) is null
       and not exists (select 1 from public.journals j where public.journal_match_key(j.title) = k.key)
  )
  insert into public.journals (slug, title, is_published)
  select case
           when base_slug = 'articles'
             or exists (select 1 from public.journals j where j.slug = c.base_slug)
             or (select count(*) from candidates c2 where c2.base_slug = c.base_slug) > 1
           then 'journal-' || substr(md5(c.key), 1, 8)
           else base_slug
         end,
         c.name,
         c.any_published
    from candidates c
  on conflict do nothing;
  get diagnostics v_created = row_count;

  -- Setting journal_id takes the trigger's FK path: parents are filled,
  -- volumes/issues are found or created from the legacy text, and the text is
  -- re-mirrored from the canonical row.
  update public.publications p
     set journal_id = public.journal_resolve_id(p.journal_name)
   where p.journal_id is null
     and public.journal_resolve_id(p.journal_name) is not null;
  get diagnostics v_mapped = row_count;

  raise notice '0148 backfill: % journal(s) created, % article(s) mapped', v_created, v_mapped;
end $$;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- drop view if exists public.journal_mapping_report;
-- drop view if exists public.journal_issues_public;
-- drop trigger if exists trg_publications_sync_journal_refs on public.publications;
-- drop function if exists public.publications_sync_journal_refs();
-- alter table public.publications
--   drop constraint if exists publications_journal_refs_need_journal,
--   drop constraint if exists publications_issue_in_volume,
--   drop constraint if exists publications_issue_in_journal,
--   drop constraint if exists publications_volume_in_journal,
--   drop constraint if exists publications_journal_fk,
--   drop column if exists issue_id,
--   drop column if exists volume_id,
--   drop column if exists journal_id;
-- (then recreate publications_with_stats exactly as 0125 did)
-- drop table if exists public.journal_issues, public.journal_volumes, public.journals;
-- drop function if exists public.journal_ensure_issue(uuid, uuid, text),
--   public.journal_ensure_volume(uuid, text), public.journal_resolve_id(text),
--   public.journals_propagate_names(), public.journals_keys_unique(),
--   public.journal_issues_fill_slug(), public.journal_issue_default_slug(text, text, text),
--   public.journal_slugify(text), public.journal_clean_name(text), public.journal_match_key(text);
-- The legacy text columns were never removed, so every reader keeps working.
