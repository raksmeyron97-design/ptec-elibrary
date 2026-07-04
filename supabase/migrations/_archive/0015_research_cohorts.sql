-- Migration 0015: DB-backed cohort and academic year lookup tables for research reports
-- research_reports.cohort and .academic_year remain text (no FK change) — these tables
-- supply the dropdown options only, mirroring how departments / categories work for books.

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE public.research_cohorts (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  program_code text        NOT NULL CHECK (program_code IN ('b_ed_12_4', 'bachelor_plus_1')),
  number       integer     NOT NULL,
  label        text,          -- optional display override; falls back to number if null
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_cohorts_pkey   PRIMARY KEY (id),
  CONSTRAINT research_cohorts_unique UNIQUE (program_code, number)
);

CREATE TABLE public.research_academic_years (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  cohort_id  uuid        NOT NULL REFERENCES public.research_cohorts(id) ON DELETE CASCADE,
  label      text        NOT NULL,  -- e.g. "2022-2023"
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_academic_years_pkey   PRIMARY KEY (id),
  CONSTRAINT research_academic_years_unique UNIQUE (cohort_id, label)
);

-- ── RLS (mirrors departments table policies) ──────────────────────────────────

ALTER TABLE public.research_cohorts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_academic_years ENABLE ROW LEVEL SECURITY;

-- Public read (same as departments — open educational data)
CREATE POLICY "Research cohorts viewable by everyone" ON public.research_cohorts
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert research cohorts" ON public.research_cohorts
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update research cohorts" ON public.research_cohorts
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "Admins can delete research cohorts" ON public.research_cohorts
  FOR DELETE USING (public.is_admin());

CREATE POLICY "Research academic years viewable by everyone" ON public.research_academic_years
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert research academic years" ON public.research_academic_years
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update research academic years" ON public.research_academic_years
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "Admins can delete research academic years" ON public.research_academic_years
  FOR DELETE USING (public.is_admin());

-- ── Seed data (sourced from lib/research/programs.ts at migration time) ───────
-- ⚠️ Confirm these values with the institution registrar before running in production.

WITH cohort_inserts AS (
  INSERT INTO public.research_cohorts (program_code, number, sort_order)
  VALUES
    ('b_ed_12_4',      1, 1),
    ('b_ed_12_4',      2, 2),
    ('b_ed_12_4',      3, 3),
    ('b_ed_12_4',      4, 4),
    ('b_ed_12_4',      5, 5),
    ('b_ed_12_4',      6, 6),
    ('bachelor_plus_1', 1, 1),
    ('bachelor_plus_1', 2, 2)
  ON CONFLICT (program_code, number) DO NOTHING
  RETURNING id, program_code, number
)
INSERT INTO public.research_academic_years (cohort_id, label, sort_order)
SELECT ci.id, ay.label, ay.sort_order
FROM cohort_inserts ci
JOIN (VALUES
  ('b_ed_12_4',      1, '2020-2021', 1),
  ('b_ed_12_4',      2, '2021-2022', 1),
  ('b_ed_12_4',      3, '2022-2023', 1),
  ('b_ed_12_4',      4, '2023-2024', 1),
  ('b_ed_12_4',      5, '2024-2025', 1),
  ('b_ed_12_4',      6, '2025-2026', 1),  -- ⚠️ TODO: confirm cohort 6 year with registrar
  ('bachelor_plus_1', 1, '2023-2024', 1),
  ('bachelor_plus_1', 2, '2024-2025', 1)
) AS ay(prog, num, label, sort_order)
  ON ci.program_code = ay.prog AND ci.number = ay.num::integer
ON CONFLICT (cohort_id, label) DO NOTHING;
