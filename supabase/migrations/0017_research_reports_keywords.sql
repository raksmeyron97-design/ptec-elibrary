-- Add keywords to research_reports for tag-based search
ALTER TABLE public.research_reports
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_research_reports_keywords
  ON public.research_reports USING GIN (keywords);
