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
CREATE POLICY "Research programs viewable by everyone"
  ON public.research_programs FOR SELECT USING (true);
CREATE POLICY "Admins can insert research programs"
  ON public.research_programs FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update research programs"
  ON public.research_programs FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete research programs"
  ON public.research_programs FOR DELETE USING (public.is_admin());

-- Faculties RLS
CREATE POLICY "Research faculties viewable by everyone"
  ON public.research_faculties FOR SELECT USING (true);
CREATE POLICY "Admins can insert research faculties"
  ON public.research_faculties FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update research faculties"
  ON public.research_faculties FOR UPDATE USING (public.is_admin());
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

  -- Drop all check constraints on the program column. COALESCE to a no-op:
  -- string_agg over zero rows is NULL, and EXECUTE NULL raises 22004 on
  -- databases where the constraint never existed or was already dropped.
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
