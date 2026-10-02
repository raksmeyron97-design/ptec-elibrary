-- 0166_journal_profile.sql
--
-- What a reader needs to judge a journal the library INDEXES (decision
-- 2026-10-02: PTEC Library is an index of journals, never their publisher),
-- and the order of an issue's table of contents. Additive only.
-- docs/JOURNALS-REDESIGN.md.
--
--   journals.title_km_source   'official' | 'library_translation'. The Khmer
--                              title of a foreign journal is the library's own
--                              translation and must never be presented as the
--                              publisher's metadata. NULL = not stated, which
--                              the page treats as a translation (the safe
--                              reading: a claim we cannot back is not made).
--   journals.access_model      'open' | 'hybrid' | 'subscription'
--   journals.default_license   licence id, e.g. 'CC-BY-4.0' (open journals)
--   journals.peer_review       'double_blind' | 'single_blind' | 'open' | 'editorial'
--   journals.indexed_in        text[] from a fixed vocabulary (lib/journals/vocab.ts)
--   journals.start_year        first year of publication
--   journals.subjects          text[] (Crossref subject names)
--   journals.issn_l            linking ISSN (ISSN Portal)
--   journals.author_guidelines_url, editorial_board_url
--                              links OUT to the publisher's own pages — an
--                              index does not copy a publisher's policies
--   journals.metadata_source   where the record's facts were last confirmed:
--                              'manual' | 'crossref' | 'issn_portal' (provenance
--                              only; never shown as a claim)
--   publications.issue_position
--                              the librarian's table-of-contents order inside
--                              an issue. NULL = not set; the printed order
--                              (first page, article number, date) then applies.
--
-- Every new column is NULLable or defaults to an empty array: unknown is not
-- false, and the public page hides a block whose fact is unknown.
--
-- No ORDER BY on created_at anywhere (hosted drift: docs, memory 0125/0128).
--
-- ROLLBACK (manual):
--   drop function if exists public.set_issue_article_order(uuid, uuid[]);
--   alter table public.publications drop column if exists issue_position;
--   alter table public.journals drop column if exists title_km_source, ...;
--   then recreate publications_with_stats as in 0148 §6.

-- ── 1. journals: the reader-facing profile ───────────────────────────────────
alter table public.journals
  add column if not exists title_km_source       text,
  add column if not exists access_model          text,
  add column if not exists default_license       text,
  add column if not exists peer_review           text,
  add column if not exists indexed_in            text[] not null default '{}',
  add column if not exists start_year            integer,
  add column if not exists subjects              text[] not null default '{}',
  add column if not exists issn_l                text,
  add column if not exists author_guidelines_url text,
  add column if not exists editorial_board_url   text,
  add column if not exists metadata_source       text;

alter table public.journals drop constraint if exists journals_title_km_source_check;
alter table public.journals add constraint journals_title_km_source_check
  check (title_km_source is null or title_km_source in ('official', 'library_translation'));

alter table public.journals drop constraint if exists journals_access_model_check;
alter table public.journals add constraint journals_access_model_check
  check (access_model is null or access_model in ('open', 'hybrid', 'subscription'));

alter table public.journals drop constraint if exists journals_peer_review_check;
alter table public.journals add constraint journals_peer_review_check
  check (peer_review is null or peer_review in ('double_blind', 'single_blind', 'open', 'editorial'));

alter table public.journals drop constraint if exists journals_start_year_check;
alter table public.journals add constraint journals_start_year_check
  check (start_year is null or start_year between 1600 and 2100);

alter table public.journals drop constraint if exists journals_metadata_source_check;
alter table public.journals add constraint journals_metadata_source_check
  check (metadata_source is null or metadata_source in ('manual', 'crossref', 'issn_portal'));

comment on column public.journals.title_km_source is
  'official = the publisher''s own Khmer title; library_translation (or NULL) = PTEC''s translation, labelled as such on the page.';
comment on column public.journals.indexed_in is
  'Abstracting & indexing services, ids from lib/journals/vocab.ts INDEX_SERVICES.';

-- No grant change: 0148 grants SELECT on the whole table to anon under RLS
-- ("Public can view published journals"), so new columns follow the row.

-- ── 2. publications.issue_position ───────────────────────────────────────────
alter table public.publications
  add column if not exists issue_position integer;

alter table public.publications drop constraint if exists publications_issue_position_check;
alter table public.publications add constraint publications_issue_position_check
  check (issue_position is null or issue_position > 0);

-- A reorder is curation, not a metadata edit: keep it out of content_versions,
-- exactly as 0149 did for featured_position. Body identical to 0149's except
-- for the one added name.
create or replace function public.capture_content_version()
returns trigger
language plpgsql
as $$
declare
  volatile_cols constant text[] := array[
    'view_count', 'download_count', 'rating', 'embedding', 'updated_at',
    'updated_by', 'last_health_check',
    'featured_at', 'featured_by', 'featured_position',
    'issue_position'
  ];
  old_cmp jsonb := to_jsonb(old) - volatile_cols;
  new_cmp jsonb := to_jsonb(new) - volatile_cols;
begin
  if old_cmp = new_cmp then
    return new;
  end if;

  insert into public.content_versions
    (table_name, record_id, snapshot, changed_by, status_from, status_to)
  values (
    tg_table_name,
    old.id,
    to_jsonb(old) - 'embedding',
    nullif(to_jsonb(new) ->> 'updated_by', '')::uuid,
    to_jsonb(old) ->> 'status',
    to_jsonb(new) ->> 'status'
  );
  return new;
end;
$$;

-- ── 3. set_issue_article_order: one atomic renumber ──────────────────────────
-- The order must name EXACTLY the articles currently in the issue (any
-- publish state — a librarian orders the whole table of contents, drafts
-- included). Anything else means the page the librarian was looking at is
-- stale: refuse with 40001 and change nothing. Same contract as
-- set_featured_book_order (0149). No unique index on issue_position, so no
-- park-then-place step is needed.
create or replace function public.set_issue_article_order(p_issue uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  in_issue integer;
  named    integer;
  supplied integer := coalesce(array_length(p_ids, 1), 0);
begin
  select count(*) into in_issue from public.publications where issue_id = p_issue;
  select count(distinct p.id) into named
    from public.publications p
   where p.issue_id = p_issue
     and p.id = any (p_ids);

  if in_issue <> supplied or named <> supplied then
    raise exception 'issue_set_changed' using errcode = '40001';
  end if;

  update public.publications p
     set issue_position = o.pos
    from unnest(p_ids) with ordinality as o(id, pos)
   where p.id = o.id
     and p.issue_id = p_issue;

  return supplied;
end;
$$;

revoke all on function public.set_issue_article_order(uuid, uuid[]) from public, anon, authenticated;

-- ── 4. publications_with_stats: pick up issue_position ───────────────────────
-- `select p.*` is frozen at CREATE time (0114 / 0125 / 0148). Body is 0148's,
-- byte-for-byte.
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
