-- Migration 0009: Add Departments Table

-- 1. Create departments table
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 2. Add department_id to books
ALTER TABLE public.books ADD COLUMN department_id uuid REFERENCES public.departments(id);

-- 3. Migrate existing unique departments from books.department to departments table
INSERT INTO public.departments (name, slug)
SELECT DISTINCT department, 
  -- simple slugify for existing english department names, or generic fallback
  COALESCE(
    NULLIF(regexp_replace(lower(trim(department)), '[^a-z0-9]+', '-', 'g'), ''),
    'dept-' || (row_number() over ())
  )
FROM public.books 
WHERE department IS NOT NULL;

-- 4. Update books to use the new department_id
UPDATE public.books b
SET department_id = d.id
FROM public.departments d
WHERE b.department = d.name;

-- 5. Add RLS for departments
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Departments are viewable by everyone" ON public.departments 
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert departments" ON public.departments 
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update departments" ON public.departments 
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "Admins can delete departments" ON public.departments 
  FOR DELETE USING (public.is_admin());

-- 6. We keep the old books.department text column for a little while to ensure backward compatibility during deployment.
-- We will drop it in the next migration, or it can be dropped manually once confirmed working.
-- ALTER TABLE public.books DROP COLUMN department;
