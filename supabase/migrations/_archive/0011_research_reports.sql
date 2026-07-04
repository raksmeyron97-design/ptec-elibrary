-- Migration 0011: Add Research Reports Table

CREATE TABLE public.research_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  abstract text NOT NULL,
  department_id uuid REFERENCES public.departments(id),
  cohort text,
  academic_year text,
  author_names text,
  advisor_name text,
  cover_url text,
  file_url text,
  file_size_kb integer,
  is_published boolean DEFAULT false,
  view_count integer DEFAULT 0,
  download_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.research_reports ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public can view published research reports" ON public.research_reports 
  FOR SELECT USING (is_published = true);

CREATE POLICY "Admins can manage research reports" ON public.research_reports 
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- RPCs for incrementing counts (optional if we reuse increment logic or create specific ones)
CREATE OR REPLACE FUNCTION increment_research_view_count(row_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE research_reports SET view_count = view_count + 1 WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_research_download_count(row_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE research_reports SET download_count = download_count + 1 WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;
