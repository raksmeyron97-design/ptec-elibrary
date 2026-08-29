-- 0125_author_profiles_and_access.sql
--
-- Three additive changes that together turn an author from "a string attached
-- to a publication" into a reusable academic identity, and turn download
-- permission from a UI affordance into a server-enforced record property.
--
--   1. public.publication_authors gains an academic profile: a stable slug,
--      position/affiliation, external scholarly profiles (website, Google
--      Scholar, ResearchGate — ORCID already existed), research interests and
--      a visibility flag.
--   2. public.authors (the BOOK author table, a different shape and a
--      different table — see 0052's note) gains only `slug`, so /authors/[slug]
--      can resolve a book author with an indexed lookup instead of scanning
--      every row and slugifying in JS.
--   3. public.publications gains `allow_download` + `download_disabled_reason`
--      so a librarian can publish a record as read-online-only, and
--      /api/publications/[slug]/file can REFUSE the byte stream rather than
--      relying on a hidden button.
--
-- Plus public.publication_figures — the normalized store for a publication's
-- visual content (figure image + caption + alt text + credit + order). One row
-- per figure, not a JSON blob, because figures are queried, reordered and
-- individually replaced.
--
-- SLUG BACKFILL FIDELITY
--
-- lib/slug.ts's unicodeSlug() is the authority: lowercase, every run of
-- non-(letter|mark|number) becomes "-", leading/trailing "-" trimmed, and the
-- result kept only if it contains a letter. The SQL below mirrors that with
-- [^[:alnum:]] (locale-aware in a UTF-8 database, so "García" keeps its í and
-- Khmer names keep their script) — which is what makes the pre-existing
-- production URL /authors/javier-garc%C3%ADa-mart%C3%ADnez keep resolving.
--
-- Postgres' character classes and JS's \p{...} are close but not identical, so
-- the backfill is best-effort and scripts/backfill-author-slugs.ts re-derives
-- every slug with the real slugify() afterwards. Nothing depends on the SQL
-- being exact: the read path falls back to name matching when a slug lookup
-- misses, so a divergence degrades to the old behaviour instead of a 404.
--
-- Rollback:
--   drop table public.publication_figures;
--   alter table public.publications
--     drop column allow_download, drop column download_disabled_reason;
--   alter table public.publication_authors
--     drop column slug, drop column position_title, drop column affiliation_name,
--     drop column website_url, drop column google_scholar_url,
--     drop column research_gate_url, drop column research_interests,
--     drop column is_published, drop column updated_at;
--   alter table public.authors drop column slug;
--   (then re-run 0114's publications_with_stats definition and 0085's
--    save_publication_atomic definition — both are replaced below)
-- No data is destroyed by the rollback that was not created by this migration.

-- ── 1. Shared slug helper ────────────────────────────────────────────────────
-- IMMUTABLE so it can be used in an index expression if ever needed; used here
-- only by the backfill and by the "slug is well formed" check.

create or replace function public.author_slugify(value text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^[:alnum:]]+', '-', 'g')),
    ''
  );
$$;

-- ── 2. publication_authors: the academic profile ─────────────────────────────

alter table public.publication_authors
  add column if not exists slug               text,
  add column if not exists position_title     text,
  add column if not exists affiliation_name   text,
  add column if not exists website_url        text,
  add column if not exists google_scholar_url text,
  add column if not exists research_gate_url  text,
  add column if not exists research_interests text[] not null default '{}',
  add column if not exists is_published       boolean not null default true,
  add column if not exists updated_at         timestamptz not null default now();

comment on column public.publication_authors.slug is
  'Stable public profile slug (/authors/<slug>). Backfilled from full_name with the same algorithm as lib/slug.ts unicodeSlug(), so pre-existing name-derived URLs keep resolving.';
comment on column public.publication_authors.is_published is
  'false hides the profile page and the author from author listings. The byline still renders — a publication''s authorship is a fact of the record, not a profile setting.';

-- Backfill: English name first, Khmer name as the fallback for a Khmer-only
-- author. Only rows that still have no slug are touched, so this is safe to
-- re-run and never rewrites a slug an admin has since chosen by hand.
update public.publication_authors
   set slug = public.author_slugify(coalesce(nullif(full_name, ''), full_name_km))
 where slug is null;

-- Two authors with the same name would collide, and CREATE UNIQUE INDEX below
-- would then fail the whole migration. Disambiguate deterministically (by
-- created_at, then id, so the same rows win on every replay): the earliest
-- record keeps the clean slug, later ones get -2, -3, … The loop re-runs
-- because a generated "john-smith-2" can itself collide with a real author
-- already slugged "john-smith-2"; it settles within a couple of passes and is
-- bounded so a pathological dataset cannot hang the migration.
do $$
declare
  touched integer;
  pass    integer := 0;
begin
  loop
    with ranked as (
      select id, slug,
             row_number() over (partition by slug order by created_at, id) as rn
        from public.publication_authors
       where slug is not null
    )
    update public.publication_authors a
       set slug = a.slug || '-' || ranked.rn
      from ranked
     where ranked.id = a.id
       and ranked.rn > 1;
    get diagnostics touched = row_count;
    pass := pass + 1;
    exit when touched = 0 or pass >= 10;
  end loop;
end $$;

create unique index if not exists publication_authors_slug_key
  on public.publication_authors (slug)
  where slug is not null;

-- updated_at maintenance, mirroring publications_set_updated_at from 0052.
create or replace function public.publication_authors_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_publication_authors_updated_at on public.publication_authors;
create trigger trg_publication_authors_updated_at
  before update on public.publication_authors
  for each row execute function public.publication_authors_set_updated_at();

-- ── 3. authors (book authors): slug only ─────────────────────────────────────
-- Deliberately NOT given the full profile shape. Duplicating nine columns
-- across two author tables is the "duplicate author record" problem in another
-- guise; the academic profile lives on publication_authors and /authors/[slug]
-- joins a book author to it by slug when both exist.

alter table public.authors
  add column if not exists slug text;

update public.authors
   set slug = public.author_slugify(name)
 where slug is null;

do $$
declare
  touched integer;
  pass    integer := 0;
begin
  loop
    with ranked as (
      select id, slug,
             row_number() over (partition by slug order by created_at, id) as rn
        from public.authors
       where slug is not null
    )
    update public.authors a
       set slug = a.slug || '-' || ranked.rn
      from ranked
     where ranked.id = a.id
       and ranked.rn > 1;
    get diagnostics touched = row_count;
    pass := pass + 1;
    exit when touched = 0 or pass >= 10;
  end loop;
end $$;

create unique index if not exists authors_slug_key
  on public.authors (slug)
  where slug is not null;

-- ── 4. publications: download permission ─────────────────────────────────────
--
-- Separate from fulltext_redistributable (0092), which answers a RIGHTS
-- question — "are we allowed to redistribute this third party's full text?".
-- allow_download answers a LIBRARY POLICY question — "do we choose to hand out
-- the file?". Both must say yes. Defaulting to true keeps every existing
-- record behaving exactly as it does today.

alter table public.publications
  add column if not exists allow_download           boolean not null default true,
  add column if not exists download_disabled_reason text;

comment on column public.publications.allow_download is
  'Library policy switch. false => /api/publications/[slug]/file?download=1 returns 403 and the reader is offered online reading only. Independent of fulltext_redistributable, which is the rights question; a download needs BOTH.';

-- publications_with_stats is `select p.*`, and Postgres freezes that column
-- list at CREATE time — so a new column on publications is invisible to the
-- view until it is recreated. Same reason 0114 exists.
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

-- ── 5. publication_figures ───────────────────────────────────────────────────

create table if not exists public.publication_figures (
  id             uuid        primary key default gen_random_uuid(),
  publication_id uuid        not null references public.publications (id) on delete cascade,
  image_url      text        not null,
  -- Caption is the printed "Figure 1. …" text; alt_text is what a screen
  -- reader announces. They are different jobs and neither substitutes for the
  -- other, so both are stored and the admin form asks for both.
  caption        text,
  caption_km     text,
  alt_text       text,
  credit         text,
  sort_order     integer     not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists publication_figures_publication_idx
  on public.publication_figures (publication_id, sort_order);

alter table public.publication_figures enable row level security;
revoke all on table public.publication_figures from public, anon, authenticated;
grant select on table public.publication_figures to anon, authenticated;

-- Visible exactly when the parent article is — mirrors publication_files.
drop policy if exists "Public can view figures of published publications" on public.publication_figures;
create policy "Public can view figures of published publications"
  on public.publication_figures for select
  using (
    exists (
      select 1 from public.publications
      where id = publication_id and is_published = true
    )
    or public.is_admin()
  );

-- Writes go through Server Actions on the service-role client after
-- requirePermission('publications', 'write'), so no write policy exists.

-- ── 6. save_publication_atomic: carry the download policy ────────────────────
--
-- The workspace save (app/actions/publication-workspace.ts) writes through this
-- security-definer RPC, whose column list is explicit — so a new column on
-- `publications` is invisible to it until the function is replaced. Without
-- this, the "Allow readers to download" switch in the publication editor would
-- appear to save and change nothing.
--
-- The body below is 0085's, byte-for-byte, with only the two new columns added.
-- Both are written defensively: an INSERT from a client that omits the key
-- takes the column default, and an UPDATE from such a client keeps whatever the
-- librarian already set rather than resetting it to "allowed". That matters
-- because the recovery-draft restore path replays a payload captured by an
-- older build of the form.
--
-- create-or-replace preserves the existing REVOKE/GRANT from 0085 (the
-- signature is unchanged), so the execute privilege stays service-role only.

create or replace function public.save_publication_atomic(
  p_publication       jsonb,
  p_authorships       jsonb default '[]'::jsonb,
  p_files             jsonb default '[]'::jsonb,
  p_publication_id    uuid default null,
  p_expected_revision bigint default null,
  p_actor_id          uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id                uuid;
  v_current_revision  bigint;
  v_revision          bigint;
  v_updated_at        timestamptz;
  v_slug              text;
  v_title             text;
  v_keywords          text[];
  v_subjects          text[];
  v_learning_outcomes text[];
  v_references        jsonb;
  v_table_of_contents jsonb;
  v_faqs              jsonb;
begin
  if p_publication is null or jsonb_typeof(p_publication) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'publication_payload_must_be_an_object';
  end if;

  if p_publication ?| array[
    'id', 'is_published', 'published_at', 'view_count', 'download_count',
    'embedding', 'created_by', 'created_at', 'updated_at', 'content_revision'
  ] then
    raise exception using
      errcode = '22023',
      message = 'publication_payload_contains_server_owned_fields';
  end if;

  if p_authorships is null or jsonb_typeof(p_authorships) <> 'array' then
    raise exception using errcode = '22023', message = 'authorships_must_be_an_array';
  end if;
  if p_files is null or jsonb_typeof(p_files) <> 'array' then
    raise exception using errcode = '22023', message = 'files_must_be_an_array';
  end if;
  if jsonb_array_length(p_authorships) > 100 then
    raise exception using errcode = '22023', message = 'too_many_publication_authorships';
  end if;
  if jsonb_array_length(p_files) > 100 then
    raise exception using errcode = '22023', message = 'too_many_publication_files';
  end if;

  if p_publication ? 'keywords'
     and jsonb_typeof(p_publication -> 'keywords') <> 'array' then
    raise exception using errcode = '22023', message = 'publication_keywords_must_be_an_array';
  end if;
  if p_publication ? 'subjects'
     and jsonb_typeof(p_publication -> 'subjects') <> 'array' then
    raise exception using errcode = '22023', message = 'publication_subjects_must_be_an_array';
  end if;
  if p_publication ? 'learning_outcomes'
     and jsonb_typeof(p_publication -> 'learning_outcomes') <> 'array' then
    raise exception using errcode = '22023', message = 'publication_learning_outcomes_must_be_an_array';
  end if;
  if p_publication ? 'references'
     and jsonb_typeof(p_publication -> 'references') <> 'array' then
    raise exception using errcode = '22023', message = 'publication_references_must_be_an_array';
  end if;
  if p_publication ? 'table_of_contents'
     and jsonb_typeof(p_publication -> 'table_of_contents') <> 'array' then
    raise exception using errcode = '22023', message = 'publication_table_of_contents_must_be_an_array';
  end if;
  if p_publication ? 'faqs'
     and jsonb_typeof(p_publication -> 'faqs') <> 'array' then
    raise exception using errcode = '22023', message = 'publication_faqs_must_be_an_array';
  end if;

  v_slug := btrim(coalesce(p_publication ->> 'slug', ''));
  v_title := btrim(coalesce(p_publication ->> 'title', ''));
  if v_slug = '' then
    raise exception using errcode = '23502', message = 'publication_slug_is_required';
  end if;
  if v_title = '' then
    raise exception using errcode = '23502', message = 'publication_title_is_required';
  end if;

  select coalesce(array_agg(value order by ordinal), '{}'::text[])
    into v_keywords
  from jsonb_array_elements_text(
    case when jsonb_typeof(p_publication -> 'keywords') = 'array'
      then p_publication -> 'keywords' else '[]'::jsonb end
  ) with ordinality as items(value, ordinal);

  select coalesce(array_agg(value order by ordinal), '{}'::text[])
    into v_subjects
  from jsonb_array_elements_text(
    case when jsonb_typeof(p_publication -> 'subjects') = 'array'
      then p_publication -> 'subjects' else '[]'::jsonb end
  ) with ordinality as items(value, ordinal);

  select coalesce(array_agg(value order by ordinal), '{}'::text[])
    into v_learning_outcomes
  from jsonb_array_elements_text(
    case when jsonb_typeof(p_publication -> 'learning_outcomes') = 'array'
      then p_publication -> 'learning_outcomes' else '[]'::jsonb end
  ) with ordinality as items(value, ordinal);

  v_references := case when jsonb_typeof(p_publication -> 'references') = 'array'
    then p_publication -> 'references' else '[]'::jsonb end;
  v_table_of_contents := case when jsonb_typeof(p_publication -> 'table_of_contents') = 'array'
    then p_publication -> 'table_of_contents' else '[]'::jsonb end;
  v_faqs := case when jsonb_typeof(p_publication -> 'faqs') = 'array'
    then p_publication -> 'faqs' else '[]'::jsonb end;

  if jsonb_array_length(v_references) > 250 then
    raise exception using errcode = '22023', message = 'too_many_publication_references';
  end if;

  -- Validate relationship object shapes before changing any row. Cast/FK/PK
  -- failures below also roll the entire function invocation back atomically.
  if exists (
    select 1
    from jsonb_array_elements(p_authorships) as rows(item)
    where jsonb_typeof(item) <> 'object'
       or nullif(btrim(item ->> 'author_id'), '') is null
       or (item ? 'affiliation_ids' and jsonb_typeof(item -> 'affiliation_ids') <> 'array')
  ) then
    raise exception using errcode = '22023', message = 'invalid_publication_authorship';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_files) as rows(item)
    where jsonb_typeof(item) <> 'object'
       or nullif(btrim(item ->> 'label'), '') is null
       or nullif(btrim(item ->> 'file_url'), '') is null
  ) then
    raise exception using errcode = '22023', message = 'invalid_publication_file';
  end if;

  if p_publication_id is null then
    if p_expected_revision is not null and p_expected_revision <> 0 then
      raise exception using errcode = '22023', message = 'new_publication_expected_revision_must_be_zero';
    end if;

    insert into public.publications (
      slug, title, title_km, article_type, journal_name, volume, issue_no,
      page_start, page_end, article_no, doi, publication_date, abstract,
      abstract_km, keywords, publisher, isbn, subjects, table_of_contents,
      learning_outcomes, faqs, license, copyright, language, cover_url,
      pdf_url, "references", allow_download, download_disabled_reason,
      created_by, content_revision
    ) values (
      v_slug,
      v_title,
      nullif(btrim(p_publication ->> 'title_km'), ''),
      coalesce(nullif(btrim(p_publication ->> 'article_type'), ''), 'article'),
      nullif(btrim(p_publication ->> 'journal_name'), ''),
      nullif(btrim(p_publication ->> 'volume'), ''),
      nullif(btrim(p_publication ->> 'issue_no'), ''),
      nullif(btrim(p_publication ->> 'page_start'), ''),
      nullif(btrim(p_publication ->> 'page_end'), ''),
      nullif(btrim(p_publication ->> 'article_no'), ''),
      nullif(btrim(p_publication ->> 'doi'), ''),
      nullif(p_publication ->> 'publication_date', '')::date,
      nullif(btrim(p_publication ->> 'abstract'), ''),
      nullif(btrim(p_publication ->> 'abstract_km'), ''),
      v_keywords,
      nullif(btrim(p_publication ->> 'publisher'), ''),
      nullif(btrim(p_publication ->> 'isbn'), ''),
      v_subjects,
      v_table_of_contents,
      v_learning_outcomes,
      v_faqs,
      nullif(btrim(p_publication ->> 'license'), ''),
      nullif(btrim(p_publication ->> 'copyright'), ''),
      coalesce(nullif(btrim(p_publication ->> 'language'), ''), 'en'),
      nullif(btrim(p_publication ->> 'cover_url'), ''),
      nullif(btrim(p_publication ->> 'pdf_url'), ''),
      v_references,
      -- Absent key => column default (true). A record saved by an older client
      -- must not have its download policy silently reset.
      coalesce((p_publication ->> 'allow_download')::boolean, true),
      nullif(btrim(p_publication ->> 'download_disabled_reason'), ''),
      p_actor_id,
      1
    )
    returning id, content_revision, updated_at
      into v_id, v_revision, v_updated_at;
  else
    if p_expected_revision is null or p_expected_revision < 1 then
      raise exception using errcode = '22023', message = 'expected_publication_revision_is_required';
    end if;

    select content_revision
      into v_current_revision
    from public.publications
    where id = p_publication_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'publication_not_found';
    end if;
    if v_current_revision <> p_expected_revision then
      raise exception using
        errcode = '40001',
        message = 'publication_revision_conflict',
        detail = format('expected=%s current=%s', p_expected_revision, v_current_revision);
    end if;

    update public.publications
    set slug = v_slug,
        title = v_title,
        title_km = nullif(btrim(p_publication ->> 'title_km'), ''),
        article_type = coalesce(nullif(btrim(p_publication ->> 'article_type'), ''), 'article'),
        journal_name = nullif(btrim(p_publication ->> 'journal_name'), ''),
        volume = nullif(btrim(p_publication ->> 'volume'), ''),
        issue_no = nullif(btrim(p_publication ->> 'issue_no'), ''),
        page_start = nullif(btrim(p_publication ->> 'page_start'), ''),
        page_end = nullif(btrim(p_publication ->> 'page_end'), ''),
        article_no = nullif(btrim(p_publication ->> 'article_no'), ''),
        doi = nullif(btrim(p_publication ->> 'doi'), ''),
        publication_date = nullif(p_publication ->> 'publication_date', '')::date,
        abstract = nullif(btrim(p_publication ->> 'abstract'), ''),
        abstract_km = nullif(btrim(p_publication ->> 'abstract_km'), ''),
        keywords = v_keywords,
        publisher = nullif(btrim(p_publication ->> 'publisher'), ''),
        isbn = nullif(btrim(p_publication ->> 'isbn'), ''),
        subjects = v_subjects,
        table_of_contents = v_table_of_contents,
        learning_outcomes = v_learning_outcomes,
        faqs = v_faqs,
        license = nullif(btrim(p_publication ->> 'license'), ''),
        copyright = nullif(btrim(p_publication ->> 'copyright'), ''),
        language = coalesce(nullif(btrim(p_publication ->> 'language'), ''), 'en'),
        cover_url = nullif(btrim(p_publication ->> 'cover_url'), ''),
        pdf_url = nullif(btrim(p_publication ->> 'pdf_url'), ''),
        -- coalesce to the CURRENT value, not to true: a client that does not
        -- send the key (an older build, or the recovery-draft path) must leave
        -- the librarian's setting exactly as it found it.
        allow_download = coalesce(
          (p_publication ->> 'allow_download')::boolean,
          publications.allow_download
        ),
        download_disabled_reason = case
          when p_publication ? 'download_disabled_reason'
            then nullif(btrim(p_publication ->> 'download_disabled_reason'), '')
          else publications.download_disabled_reason
        end,
        "references" = v_references,
        content_revision = v_current_revision + 1
    where id = p_publication_id
    returning id, content_revision, updated_at
      into v_id, v_revision, v_updated_at;
  end if;

  delete from public.publication_authorships where publication_id = v_id;
  insert into public.publication_authorships (
    publication_id, author_id, author_order, is_corresponding, affiliation_ids
  )
  select
    v_id,
    (item ->> 'author_id')::uuid,
    coalesce(nullif(item ->> 'author_order', '')::integer, ordinal::integer),
    coalesce(nullif(item ->> 'is_corresponding', '')::boolean, false),
    array(
      select affiliation_id::uuid
      from jsonb_array_elements_text(
        case when jsonb_typeof(item -> 'affiliation_ids') = 'array'
          then item -> 'affiliation_ids' else '[]'::jsonb end
      ) as affiliations(affiliation_id)
    )
  from jsonb_array_elements(p_authorships) with ordinality as rows(item, ordinal);

  delete from public.publication_files where publication_id = v_id;
  insert into public.publication_files (
    publication_id, label, file_url, file_type, size_bytes, sort_order
  )
  select
    v_id,
    btrim(item ->> 'label'),
    btrim(item ->> 'file_url'),
    nullif(btrim(item ->> 'file_type'), ''),
    nullif(item ->> 'size_bytes', '')::bigint,
    coalesce(nullif(item ->> 'sort_order', '')::integer, ordinal::integer - 1)
  from jsonb_array_elements(p_files) with ordinality as rows(item, ordinal);

  return jsonb_build_object(
    'id', v_id,
    'revision', v_revision,
    'updated_at', v_updated_at
  );
end;
$$;
