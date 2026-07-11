-- 0085_publication_authoring_workspace.sql
--
-- Additive persistence primitives for the publication authoring workspace:
--   * a content-only revision counter for optimistic concurrency;
--   * per-user recovery drafts that never touch the public publication row;
--   * one transactional RPC for publication metadata, authorships, and files.
--
-- Existing publication rows, legacy reference JSON, publication status, and
-- public read policies are not rewritten by this migration.

-- ── Content revision ──────────────────────────────────────────────────────────

alter table public.publications
  add column if not exists content_revision bigint not null default 1;

comment on column public.publications.content_revision is
  'Optimistic-concurrency token for administrator-authored content. Incremented by save_publication_atomic; unlike updated_at it is not changed by views, downloads, or embedding refreshes.';

-- ── Autosave recovery drafts ─────────────────────────────────────────────────
-- Drafts are deliberately separate from publications. Debounced autosave must
-- never expose half-written content by updating an already-published row.

create table if not exists public.publication_drafts (
  id              uuid        primary key default gen_random_uuid(),
  publication_id  uuid        references public.publications(id) on delete cascade,
  draft_key       text,
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  payload         jsonb       not null default '{}'::jsonb,
  base_revision   bigint      not null default 0 check (base_revision >= 0),
  client_sequence bigint      not null default 0 check (client_sequence >= 0),
  updated_at      timestamptz not null default now(),
  constraint publication_drafts_exactly_one_target check (
    (publication_id is not null and draft_key is null)
    or (publication_id is null and draft_key is not null)
  ),
  constraint publication_drafts_key_length check (
    draft_key is null or length(draft_key) between 8 and 128
  ),
  constraint publication_drafts_payload_object check (
    jsonb_typeof(payload) = 'object'
  )
);

comment on table public.publication_drafts is
  'Private per-administrator recovery snapshots. Existing publications use publication_id; not-yet-created publications use a per-tab draft_key.';
comment on column public.publication_drafts.base_revision is
  'Content revision from which this draft was authored; zero denotes a new publication.';
comment on column public.publication_drafts.client_sequence is
  'Monotonic client save sequence. Conditional writes prevent a late response from overwriting a newer draft snapshot.';

create unique index if not exists idx_publication_drafts_user_publication
  on public.publication_drafts (user_id, publication_id)
  where publication_id is not null;

create unique index if not exists idx_publication_drafts_user_key
  on public.publication_drafts (user_id, draft_key)
  where draft_key is not null;

create or replace function public.publication_drafts_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_publication_drafts_updated_at on public.publication_drafts;
create trigger trg_publication_drafts_updated_at
  before update on public.publication_drafts
  for each row execute function public.publication_drafts_set_updated_at();

alter table public.publication_drafts enable row level security;

drop policy if exists "Admins can manage publication drafts" on public.publication_drafts;
create policy "Admins can manage publication drafts"
  on public.publication_drafts
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Server Actions use the service role after requirePermission('publications',
-- ...). Browser clients may at most read rows allowed by the admin RLS policy;
-- they cannot create, alter, or delete recovery snapshots directly.
revoke insert, update, delete on table public.publication_drafts
  from public, anon, authenticated;
grant select on table public.publication_drafts to authenticated;
grant all on table public.publication_drafts to service_role;

-- ── Atomic publication save ──────────────────────────────────────────────────
-- This RPC accepts a complete editable publication snapshot. Server-owned
-- fields are rejected, not ignored. In particular, publication status can only
-- be changed by the dedicated publish workflow.

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
      pdf_url, "references", created_by, content_revision
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

comment on function public.save_publication_atomic(jsonb, jsonb, jsonb, uuid, bigint, uuid) is
  'Creates or revision-safely updates a publication and atomically replaces authorships/files. Rejects all server-owned fields, including is_published. Call only after server-side authorization and content validation.';

revoke all on function public.save_publication_atomic(jsonb, jsonb, jsonb, uuid, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.save_publication_atomic(jsonb, jsonb, jsonb, uuid, bigint, uuid)
  to service_role;

