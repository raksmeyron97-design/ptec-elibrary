  -- Pending migrations 0053, 0054, 0055, 0058 — IDEMPOTENT version.
  -- Safe to run repeatedly: previous partial applications are skipped.
  -- (0055's tables/policies partially exist on this DB; the earlier bundle
  --  aborted on a duplicate policy and rolled back — this one guards them.)
  -- Paste into the Supabase dashboard SQL editor and Run once.

  BEGIN;


  -- ── 0053_publications_search.sql ──

  -- 0053_publications_search.sql
  -- Union publications into the unified semantic search (match_library from 0029).
  -- Adds a fourth source branch: 'publication', ref = slug, category = journal
  -- name (falling back to 'Publication'). Only published, embedded rows match.
  -- CREATE OR REPLACE keeps the existing grants from 0029.

  create or replace function public.match_library(
    query_embedding vector(768),
    match_count int default 6,
    min_similarity float default 0.25
  )
  returns table (
    source     text,
    ref        text,   -- slug for books/catalog/publications, id for research
    title      text,
    author     text,
    category   text,
    cover_url  text,
    similarity float
  )
  language sql
  stable
  set search_path = public, extensions
  as $$
    (
      select
        'book'::text,
        b.slug,
        b.title,
        coalesce(a.name, 'Unknown'),
        coalesce(c.name, b.department, 'E-Book'),
        b.cover_url,
        1 - (b.embedding <=> query_embedding) as similarity
      from public.books b
      left join public.authors a    on a.id = b.author_id
      left join public.categories c on c.id = b.category_id
      where b.is_published
        and b.embedding is not null
        and 1 - (b.embedding <=> query_embedding) > min_similarity
      order by b.embedding <=> query_embedding
      limit match_count
    )
    union all
    (
      select
        'research'::text,
        r.id::text,
        r.title,
        coalesce(r.author_names, 'Unknown'),
        'Research Report'::text,
        r.cover_url,
        1 - (r.embedding <=> query_embedding) as similarity
      from public.research_reports r
      where r.is_published
        and r.embedding is not null
        and 1 - (r.embedding <=> query_embedding) > min_similarity
      order by r.embedding <=> query_embedding
      limit match_count
    )
    union all
    (
      select
        'catalog'::text,
        cb.slug,
        cb.title,
        coalesce(cb.author, 'Unknown'),
        coalesce(cb.category, 'Physical Book'),
        cb.cover_url,
        1 - (cb.embedding <=> query_embedding) as similarity
      from public.catalog_books cb
      where cb.is_active
        and cb.embedding is not null
        and 1 - (cb.embedding <=> query_embedding) > min_similarity
      order by cb.embedding <=> query_embedding
      limit match_count
    )
    union all
    (
      select
        'publication'::text,
        p.slug,
        p.title,
        coalesce(
          (
            select string_agg(pa.full_name, ', ' order by pas.author_order)
            from public.publication_authorships pas
            join public.publication_authors pa on pa.id = pas.author_id
            where pas.publication_id = p.id
          ),
          'Unknown'
        ),
        coalesce(p.journal_name, 'Publication'),
        p.cover_url,
        1 - (p.embedding <=> query_embedding) as similarity
      from public.publications p
      where p.is_published
        and p.embedding is not null
        and 1 - (p.embedding <=> query_embedding) > min_similarity
      order by p.embedding <=> query_embedding
      limit match_count
    )
    order by similarity desc
    limit match_count;
  $$;


  -- ── 0054_publication_subscriptions.sql ──

  -- 0054_publication_subscriptions.sql
  -- Let users subscribe to new publications (journal articles).
  -- Extends the content_subscriptions filter_type CHECK (from 0048) with a
  -- 'publications' content-type-level channel (filter_value is 'all').
  -- Publishing an article for the first time pushes a web notification to
  -- these subscribers (togglePublicationPublishStatus → broadcastPush).

  ALTER TABLE public.content_subscriptions
    DROP CONSTRAINT IF EXISTS content_subscriptions_filter_type_check;

  ALTER TABLE public.content_subscriptions
    ADD CONSTRAINT content_subscriptions_filter_type_check
    CHECK (filter_type IN ('department', 'category', 'publications'));


  -- ── 0055_programs_faculties_to_db.sql (policies guarded) ──

  -- ═══════════════════════════════════════════════════════════════════════════════
  -- Migration: Move Programs & Faculties from hardcoded config to database tables
  -- ═══════════════════════════════════════════════════════════════════════════════

  -- ── 1. Create research_programs table ────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public.research_programs (
    id             uuid        NOT NULL DEFAULT gen_random_uuid(),
    code           text        NOT NULL,
    name_en        text        NOT NULL,
    name_km        text        NOT NULL,
    duration_years integer     NOT NULL DEFAULT 4,
    has_faculty    boolean     NOT NULL DEFAULT false,
    sort_order     integer     NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT research_programs_pkey PRIMARY KEY (id),
    CONSTRAINT research_programs_code_unique UNIQUE (code)
  );

  -- ── 2. Create research_faculties table ───────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public.research_faculties (
    id             uuid        NOT NULL DEFAULT gen_random_uuid(),
    program_code   text        NOT NULL REFERENCES public.research_programs(code) ON DELETE CASCADE,
    code           text        NOT NULL,
    name_en        text        NOT NULL,
    name_km        text        NOT NULL,
    has_subject    boolean     NOT NULL DEFAULT false,
    sort_order     integer     NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT research_faculties_pkey PRIMARY KEY (id),
    CONSTRAINT research_faculties_unique UNIQUE (program_code, code)
  );

  -- ── 3. Enable RLS ───────────────────────────────────────────────────────────
  ALTER TABLE public.research_programs  ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.research_faculties ENABLE ROW LEVEL SECURITY;

  -- Programs RLS
  DROP POLICY IF EXISTS "Research programs viewable by everyone" ON public.research_programs;
  CREATE POLICY "Research programs viewable by everyone"
    ON public.research_programs FOR SELECT USING (true);
  DROP POLICY IF EXISTS "Admins can insert research programs" ON public.research_programs;
  CREATE POLICY "Admins can insert research programs"
    ON public.research_programs FOR INSERT WITH CHECK (public.is_admin());
  DROP POLICY IF EXISTS "Admins can update research programs" ON public.research_programs;
  CREATE POLICY "Admins can update research programs"
    ON public.research_programs FOR UPDATE USING (public.is_admin());
  DROP POLICY IF EXISTS "Admins can delete research programs" ON public.research_programs;
  CREATE POLICY "Admins can delete research programs"
    ON public.research_programs FOR DELETE USING (public.is_admin());

  -- Faculties RLS
  DROP POLICY IF EXISTS "Research faculties viewable by everyone" ON public.research_faculties;
  CREATE POLICY "Research faculties viewable by everyone"
    ON public.research_faculties FOR SELECT USING (true);
  DROP POLICY IF EXISTS "Admins can insert research faculties" ON public.research_faculties;
  CREATE POLICY "Admins can insert research faculties"
    ON public.research_faculties FOR INSERT WITH CHECK (public.is_admin());
  DROP POLICY IF EXISTS "Admins can update research faculties" ON public.research_faculties;
  CREATE POLICY "Admins can update research faculties"
    ON public.research_faculties FOR UPDATE USING (public.is_admin());
  DROP POLICY IF EXISTS "Admins can delete research faculties" ON public.research_faculties;
  CREATE POLICY "Admins can delete research faculties"
    ON public.research_faculties FOR DELETE USING (public.is_admin());

  -- ── 4. Seed existing program data ───────────────────────────────────────────
  INSERT INTO public.research_programs (code, name_en, name_km, duration_years, has_faculty, sort_order)
  VALUES
    ('b_ed_12_4',      'Bachelor of Education (12+4)',  'បរិញ្ញាបត្រអប់រំ (១២+៤)',                 4, true,  1),
    ('bachelor_plus_1', 'Bachelor + 1',                  'បរិញ្ញាបត្រ +១',                           1, false, 2),
    ('master_degree',   'Master''s Degree',              'បរិញ្ញាបត្រជាន់ខ្ពស់ (អនុបណ្ឌិត)',        2, true,  3)
  ON CONFLICT (code) DO NOTHING;

  -- ── 5. Seed existing faculty data ───────────────────────────────────────────
  INSERT INTO public.research_faculties (program_code, code, name_en, name_km, has_subject, sort_order)
  VALUES
    -- b_ed_12_4 faculties
    ('b_ed_12_4', 'primary',           'Primary Education',           'បឋមសិក្សា',              false, 1),
    ('b_ed_12_4', 'lower_secondary',   'Lower Secondary Education',   'មធ្យមសិក្សាបឋមភូមិ',    true,  2),
    ('b_ed_12_4', 'early_childhood',   'Early Childhood Education',   'អប់រំកុមារតូច',          false, 3),
    ('b_ed_12_4', 'school_management', 'School Management',           'ការគ្រប់គ្រងសាលារៀន',   false, 4),
    -- master_degree faculties
    ('master_degree', 'education_management', 'Educational Management and Leadership', 'ការគ្រប់គ្រង និងភាពជាអ្នកដឹកនាំការអប់រំ', false, 1)
  ON CONFLICT (program_code, code) DO NOTHING;

  -- ── 6. Remove CHECK constraints on program codes ────────────────────────────
  -- research_reports.program — drop the hardcoded CHECK
  DO $$
  BEGIN
    -- The CHECK constraint was defined inline, so its name is auto-generated.
    -- Find and drop it.
    PERFORM 1
    FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'research_reports'
      AND column_name = 'program';

    -- Drop all check constraints on the program column
    EXECUTE COALESCE((
      SELECT string_agg('ALTER TABLE public.research_reports DROP CONSTRAINT IF EXISTS ' || quote_ident(conname) || ';', E'\n')
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
      WHERE c.conrelid = 'public.research_reports'::regclass
        AND c.contype = 'c'
        AND a.attname = 'program'
    ), 'SELECT 1');
  END $$;

  -- research_cohorts.program_code — drop the hardcoded CHECK
  DO $$
  BEGIN
    EXECUTE COALESCE((
      SELECT string_agg('ALTER TABLE public.research_cohorts DROP CONSTRAINT IF EXISTS ' || quote_ident(conname) || ';', E'\n')
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
      WHERE c.conrelid = 'public.research_cohorts'::regclass
        AND c.contype = 'c'
        AND a.attname = 'program_code'
    ), 'SELECT 1');
  END $$;

  -- ── 7. Add indexes ──────────────────────────────────────────────────────────
  CREATE INDEX IF NOT EXISTS idx_research_faculties_program_code
    ON public.research_faculties (program_code);


  -- ── 0058_search_queries_log.sql (guards added) ──

  -- 0058: Search query log — powers "Popular searches" on /search
  --
  -- Logged fire-and-forget from /api/search/native for each distinct query
  -- (see route: only logged once per query, not on every tab/page change).
  -- No RLS needed: never read/written with the user's session, only via the
  -- service-role client from server code.

  CREATE TABLE IF NOT EXISTS public.search_queries (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    term            text        NOT NULL,
    normalized_term text        GENERATED ALWAYS AS (lower(trim(term))) STORED,
    searched_at     timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS search_queries_normalized_term_idx
    ON public.search_queries (normalized_term, searched_at DESC);


  COMMIT;
