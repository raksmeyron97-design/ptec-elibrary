-- 0167_publication_source_url.sql
--
-- Citation-only journal articles (owner decision 2026-10-02: PTEC Library
-- INDEXES articles, it does not publish them; an article without a PDF links
-- out to the publisher). A DOI is the usual link, but many regional journals —
-- ThaiJO's among them — publish without one, so the record needs the article's
-- own page at the publisher. docs/JOURNALS-REDESIGN.md.
--
--   publications.source_url   the article's page at its publisher (https only)
--
-- save_publication_atomic is recreated from 0125 VERBATIM except for the one
-- column (its column list is explicit, so a new column it does not name is a
-- column no admin save can write). `create or replace` keeps the grants.
-- On update the column is written only when the payload names it, so any
-- caller that predates 0167 cannot erase a stored URL.
--
-- publications_with_stats is recreated so `p.*` includes the column (0148 §6).
--
-- ROLLBACK (manual): re-run 0125's save_publication_atomic, recreate
-- publications_with_stats as in 0166 §4, then
--   alter table public.publications drop column if exists source_url;

alter table public.publications
  add column if not exists source_url text;

alter table public.publications drop constraint if exists publications_source_url_check;
alter table public.publications add constraint publications_source_url_check
  check (source_url is null or source_url ~* '^https?://[^\s/$.?#][^\s]*$');

comment on column public.publications.source_url is
  'The article''s own page at its publisher. A citation-only record (no PDF) links here or to its DOI.';

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
      pdf_url, source_url, "references", allow_download, download_disabled_reason,
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
      nullif(btrim(p_publication ->> 'source_url'), ''),
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
        -- Only when the payload carries it: a caller that does not know the
        -- 0167 column must not erase it.
        source_url = case when p_publication ? 'source_url'
          then nullif(btrim(p_publication ->> 'source_url'), '')
          else source_url end,
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

-- publications_with_stats: pick up source_url (body identical to 0166 §4).
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
