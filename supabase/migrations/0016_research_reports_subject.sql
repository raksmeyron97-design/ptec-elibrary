-- Migration 0016: Add subject column to research_reports
-- Nullable — only populated when faculty = lower_secondary. Existing rows are unaffected.

ALTER TABLE public.research_reports
  ADD COLUMN IF NOT EXISTS subject text;

COMMENT ON COLUMN public.research_reports.subject IS 'Subject code (e.g. math, physics). Populated only when faculty = lower_secondary. NULL for other faculties and programs.';
