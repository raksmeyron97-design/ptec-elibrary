-- E2E / local-dev seed fixtures (applied by `supabase db reset` and the CI
-- e2e job's local stack — NEVER runs against the hosted database; hosted
-- data is managed through the admin panel).
--
-- Keep this minimal: just enough published content for the public pages the
-- Playwright suite visits (/home shelves, /books, book detail, /theses,
-- /search SSR) to render real markup instead of empty states. Fixed UUIDs so
-- tests may reference them.

insert into public.categories (id, name, slug) values
  ('11111111-1111-4111-8111-111111111101', 'Education', 'education'),
  ('11111111-1111-4111-8111-111111111102', 'Pedagogy', 'pedagogy')
on conflict (id) do nothing;

insert into public.authors (id, name) values
  ('22222222-2222-4222-8222-222222222201', 'Sok Dara'),
  ('22222222-2222-4222-8222-222222222202', 'Chan Sophea')
on conflict (id) do nothing;

insert into public.books
  (id, title, slug, description, author_id, category_id, language, published_at, is_published, pages, cover_color)
values
  ('33333333-3333-4333-8333-333333333301', 'Foundations of Education', 'foundations-of-education',
   'An introduction to educational theory for teacher trainees.',
   '22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101',
   'English', '2023-06-01', true, 120, '#1d4ed8'),
  ('33333333-3333-4333-8333-333333333302', 'Classroom Management Basics', 'classroom-management-basics',
   'Practical classroom management strategies for new teachers.',
   '22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111101',
   'English', '2022-09-15', true, 96, '#047857'),
  ('33333333-3333-4333-8333-333333333303', 'វិធីសាស្ត្របង្រៀនភាសាខ្មែរ', 'khmer-teaching-methods',
   'វិធីសាស្ត្របង្រៀនសម្រាប់គ្រូបង្រៀនភាសាខ្មែរ។',
   '22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111102',
   'Khmer', '2023-01-20', true, 150, '#b45309'),
  ('33333333-3333-4333-8333-333333333304', 'Assessment for Learning', 'assessment-for-learning',
   'Formative assessment techniques in primary education.',
   '22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111102',
   'English', '2024-03-10', true, 88, '#7c3aed')
on conflict (id) do nothing;

insert into public.research_reports
  (id, title, abstract, keywords, is_published, slug)
values
  ('44444444-4444-4444-8444-444444444401', 'Reading Fluency in Grade 3 Classrooms',
   'A study of reading fluency interventions across three provincial primary schools.',
   '{reading,fluency,primary}', true, 'reading-fluency-grade-3'),
  ('44444444-4444-4444-8444-444444444402', 'Teacher Motivation and Retention',
   'Survey-based analysis of motivation factors among first-year teachers.',
   '{motivation,retention,teachers}', true, 'teacher-motivation-retention')
on conflict (id) do nothing;
