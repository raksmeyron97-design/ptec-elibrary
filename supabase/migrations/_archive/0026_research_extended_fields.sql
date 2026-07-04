-- Migration 0026: Add extended fields for research redesign
-- keywords already added in 0017
-- department is handled via departments relation or faculty column

ALTER TABLE public.research_reports
  ADD COLUMN IF NOT EXISTS doi text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS "references" text;
