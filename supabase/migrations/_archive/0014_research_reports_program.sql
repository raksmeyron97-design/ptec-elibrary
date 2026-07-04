-- Migration 0014: Add program and faculty fields to research_reports
-- Additive & backward-compatible: new columns are nullable so existing rows continue to work.

ALTER TABLE public.research_reports
  ADD COLUMN IF NOT EXISTS program text
    CHECK (program IS NULL OR program IN ('b_ed_12_4', 'bachelor_plus_1')),
  ADD COLUMN IF NOT EXISTS faculty text;

COMMENT ON COLUMN public.research_reports.program IS 'Program code: b_ed_12_4 (Bachelor of Education 12+4) or bachelor_plus_1 (Bachelor+1). NULL for legacy rows.';
COMMENT ON COLUMN public.research_reports.faculty IS 'Faculty/major code (e.g. primary, lower_secondary). Only applicable when program = b_ed_12_4. NULL otherwise.';
