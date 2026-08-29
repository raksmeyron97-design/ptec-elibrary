-- ============================================================================
-- LOCAL / E2E SEED FIXTURES
--
-- Applied by `supabase db reset` and by the CI e2e job's local stack.
-- NEVER runs against the hosted database — hosted content is managed through
-- the admin panel. Every row uses a hardcoded UUID so tests and manual QA can
-- reference it, and every insert is idempotent.
--
-- Scope: enough rich, realistic content to exercise every admin CRUD form and
-- every public listing/detail page without hitting an empty state.
-- ============================================================================


-- ============================================================================
-- 1. Test Accounts (Password for all: Password123!)
-- ============================================================================

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin)
VALUES 
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'admin@ptec.local', crypt('Password123!', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'librarian@ptec.local', crypt('Password123!', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'staff@ptec.local', crypt('Password123!', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'student@ptec.local', crypt('Password123!', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false)
ON CONFLICT (id) DO NOTHING;

-- GoTrue scans these token columns into non-nullable Go strings. They have no
-- column default, so an INSERT that omits them leaves NULL and every login
-- fails with HTTP 500 "Database error querying schema" even though the
-- password hash is correct. Normalise them to empty strings.
UPDATE auth.users SET
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
WHERE email IN ('admin@ptec.local', 'librarian@ptec.local', 'staff@ptec.local', 'student@ptec.local');

-- GoTrue resolves password logins through auth.identities, so every seeded
-- account needs a matching email identity or sign-in returns "invalid
-- credentials" despite the password hash being correct.
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
FROM auth.users u
WHERE u.email IN ('admin@ptec.local', 'librarian@ptec.local', 'staff@ptec.local', 'student@ptec.local')
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ============================================================================
-- 2. Profiles and Roles mapping
-- ============================================================================
-- NOTE: profiles has `full_name` (there is no `display_name` column), and
-- `role` is text — the `::user_role` cast is kept for intent/validation: it
-- makes a typo'd role name fail loudly at seed time instead of silently
-- writing an unknown role.
-- The on_auth_user_created trigger already inserted these rows with the
-- default 'reader' role, so the UPDATE branch is the one that actually runs.

INSERT INTO public.profiles (id, email, full_name, role, is_super_admin)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@ptec.local',     'Super Admin',    'super_admin'::user_role::text, true),
  ('22222222-2222-2222-2222-222222222222', 'librarian@ptec.local', 'Head Librarian', 'librarian'::user_role::text,   false),
  ('33333333-3333-3333-3333-333333333333', 'staff@ptec.local',     'Content Staff',  'staff'::user_role::text,       false),
  ('44444444-4444-4444-4444-444444444444', 'student@ptec.local',   'Student Reader', 'reader'::user_role::text,      false)
ON CONFLICT (id) DO UPDATE SET
  role           = EXCLUDED.role,
  email          = EXCLUDED.email,
  full_name      = EXCLUDED.full_name,
  is_super_admin = EXCLUDED.is_super_admin;


-- ============================================================================
-- 3. Taxonomy — categories & departments
-- ============================================================================

INSERT INTO public.categories (id, name, slug) VALUES
  ('11111111-1111-4111-8111-111111111101', 'Education',        'education'),
  ('11111111-1111-4111-8111-111111111102', 'Pedagogy',         'pedagogy'),
  ('11111111-1111-4111-8111-111111111103', 'Khmer Literature', 'khmer-literature'),
  ('11111111-1111-4111-8111-111111111104', 'Mathematics',      'mathematics')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.departments (id, name, slug) VALUES
  ('11111111-1111-4111-8111-1111111111d1', 'Primary Education',         'primary-education'),
  ('11111111-1111-4111-8111-1111111111d2', 'Lower Secondary Education', 'lower-secondary-education'),
  ('11111111-1111-4111-8111-1111111111d3', 'Educational Research',      'educational-research')
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 4. Authors
-- ============================================================================

-- `slug` (migration 0125) is set explicitly rather than left to 0125's
-- backfill: that backfill runs when the migration is applied, which is BEFORE
-- this seed inserts anything, so a seeded author would otherwise have a NULL
-- slug and /authors/[slug] would fall back to its slow name-scan path.
--
-- These slugs deliberately MATCH the publication_authors rows in section 11.
-- That is the interesting case, not a coincidence: /authors/sok-dara has to
-- resolve one person across two different author tables and list their e-books
-- and their journal articles together.
INSERT INTO public.authors (id, name, slug, bio) VALUES
  ('22222222-2222-4222-8222-222222222201', 'Sok Dara', 'sok-dara',
   'Lecturer in educational foundations at PTEC with fifteen years of classroom experience across provincial primary schools.'),
  ('22222222-2222-4222-8222-222222222202', 'Chan Sophea', 'chan-sophea',
   'Teacher-trainer specialising in classroom management and formative assessment for first-year teacher candidates.'),
  ('22222222-2222-4222-8222-222222222203', 'ឡុង សុវណ្ណារ៉ា', 'ឡុង-សុវណ្ណារ៉ា',
   'អ្នកស្រាវជ្រាវផ្នែកវិធីសាស្ត្របង្រៀនភាសាខ្មែរ និងជាអ្នកនិពន្ធសៀវភៅសិក្សាជាច្រើនក្បាល។'),
  ('22222222-2222-4222-8222-222222222204', 'Pich Chanthou', 'pich-chanthou',
   'Mathematics educator focused on problem-based learning and low-resource teaching aids.')
ON CONFLICT (id) DO NOTHING;

-- Re-seeding without a reset hits ON CONFLICT DO NOTHING above, so rows created
-- by an earlier seed keep whatever slug they had (usually NULL). Fill those in.
UPDATE public.authors a SET slug = v.slug
FROM (VALUES
  ('22222222-2222-4222-8222-222222222201'::uuid, 'sok-dara'),
  ('22222222-2222-4222-8222-222222222202'::uuid, 'chan-sophea'),
  ('22222222-2222-4222-8222-222222222203'::uuid, 'ឡុង-សុវណ្ណារ៉ា'),
  ('22222222-2222-4222-8222-222222222204'::uuid, 'pich-chanthou')
) AS v(id, slug)
WHERE a.id = v.id AND a.slug IS DISTINCT FROM v.slug;


-- ============================================================================
-- 5. Digital books (6 — mixed Khmer/English, all published)
-- ============================================================================

INSERT INTO public.books
  (id, title, slug, description, author_id, category_id, department_id, isbn, language,
   published_at, is_published, status, pages, cover_color, tags, publisher)
VALUES
  ('33333333-3333-4333-8333-333333333301', 'Foundations of Education', 'foundations-of-education',
   'An introduction to educational theory for teacher trainees, covering the philosophical, psychological and social foundations that underpin classroom practice in Cambodia.',
   '22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101',
   '11111111-1111-4111-8111-1111111111d1', '978-9924-000-01-1', 'English',
   '2023-06-01', true, 'published', 120, '#1d4ed8', '{education,theory,foundations}', 'PTEC Press'),

  ('33333333-3333-4333-8333-333333333302', 'Classroom Management Basics', 'classroom-management-basics',
   'Practical classroom management strategies for new teachers: routines, seating, transitions and restorative responses to disruption in large classes.',
   '22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111101',
   '11111111-1111-4111-8111-1111111111d1', '978-9924-000-02-8', 'English',
   '2022-09-15', true, 'published', 96, '#047857', '{classroom,management,practice}', 'PTEC Press'),

  ('33333333-3333-4333-8333-333333333303', 'វិធីសាស្ត្របង្រៀនភាសាខ្មែរ', 'khmer-teaching-methods',
   'វិធីសាស្ត្របង្រៀនសម្រាប់គ្រូបង្រៀនភាសាខ្មែរ រួមទាំងការបង្រៀនអក្សរសាស្ត្រ វេយ្យាករណ៍ និងជំនាញអាន សរសេរ សម្រាប់សិស្សថ្នាក់បឋមសិក្សា។',
   '22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111102',
   '11111111-1111-4111-8111-1111111111d1', '978-9924-000-03-5', 'Khmer',
   '2023-01-20', true, 'published', 150, '#b45309', '{khmer,language,pedagogy}', 'PTEC Press'),

  ('33333333-3333-4333-8333-333333333304', 'Assessment for Learning', 'assessment-for-learning',
   'Formative assessment techniques in primary education, with worked examples of feedback, rubrics and low-stakes checks that fit a forty-minute lesson.',
   '22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111102',
   '11111111-1111-4111-8111-1111111111d2', '978-9924-000-04-2', 'English',
   '2024-03-10', true, 'published', 88, '#7c3aed', '{assessment,formative,feedback}', 'PTEC Press'),

  ('33333333-3333-4333-8333-333333333305', 'គណិតវិទ្យាសម្រាប់គ្រូបឋមសិក្សា', 'mathematics-for-primary-teachers',
   'សៀវភៅណែនាំអំពីការបង្រៀនគណិតវិទ្យានៅថ្នាក់បឋមសិក្សា ដោយផ្តោតលើការដោះស្រាយបញ្ហា និងសម្ភារៈបង្រៀនដែលងាយស្រួលរកបាន។',
   '22222222-2222-4222-8222-222222222204', '11111111-1111-4111-8111-111111111104',
   '11111111-1111-4111-8111-1111111111d2', '978-9924-000-05-9', 'Khmer',
   '2024-07-05', true, 'published', 210, '#be123c', '{mathematics,primary,problem-solving}', 'PTEC Press'),

  ('33333333-3333-4333-8333-333333333306', 'Inclusive Education in Practice', 'inclusive-education-in-practice',
   'A field guide to inclusive classrooms: identifying learning differences, adapting materials, and working with families and school directors to keep every child enrolled.',
   '22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111103',
   '11111111-1111-4111-8111-1111111111d3', '978-9924-000-06-6', 'English',
   '2025-02-18', true, 'published', 176, '#0f766e', '{inclusion,accessibility,practice}', 'PTEC Press')
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 6. Physical catalog (3 titles with shelf locations + barcoded copies)
-- ============================================================================

INSERT INTO public.catalog_books
  (id, title, slug, author, isbn, description, cover_color, year, language, category,
   department, shelf_location, accession_number, copies_total, copies_available, is_active, keywords, publisher)
VALUES
  ('55555555-5555-4555-8555-555555555501', 'Teaching Practice Handbook', 'teaching-practice-handbook',
   'Sok Dara', '978-9924-100-01-4',
   'The practicum handbook issued to every PTEC trainee before their school placement.',
   '#1e3a8a', 2021, 'English', 'Education', 'Primary Education',
   'Shelf A-1', 'PTEC-2021-0001', 5, 4, true, '{practicum,handbook,placement}', 'PTEC Press'),

  ('55555555-5555-4555-8555-555555555502', 'អក្សរសាស្ត្រខ្មែរសម័យទំនើប', 'modern-khmer-literature',
   'ឡុង សុវណ្ណារ៉ា', '978-9924-100-02-1',
   'ការសិក្សាអំពីអក្សរសាស្ត្រខ្មែរសម័យទំនើប ចាប់ពីសតវត្សរ៍ទី២០ រហូតដល់បច្ចុប្បន្ន។',
   '#7c2d12', 2019, 'Khmer', 'Khmer Literature', 'Lower Secondary Education',
   'Shelf B-3', 'PTEC-2019-0142', 3, 3, true, '{literature,khmer,modern}', 'Angkor Publishing'),

  ('55555555-5555-4555-8555-555555555503', 'Educational Statistics with Examples', 'educational-statistics-with-examples',
   'Pich Chanthou', '978-9924-100-03-8',
   'An applied statistics reference for education researchers, worked entirely with Cambodian school datasets.',
   '#365314', 2023, 'English', 'Mathematics', 'Educational Research',
   'Shelf C-2', 'PTEC-2023-0088', 4, 2, true, '{statistics,research,methods}', 'PTEC Press')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.catalog_copies
  (id, catalog_book_id, status, barcode, call_number, holding_library, shelf_location, notes)
VALUES
  ('55555555-5555-4555-8555-5555555c0101', '55555555-5555-4555-8555-555555555501', 'available', 'BC-000000101', '371.102 SOK', 'PTEC Main Library', 'Shelf A-1', 'Reference copy — library use only.'),
  ('55555555-5555-4555-8555-5555555c0102', '55555555-5555-4555-8555-555555555501', 'on_loan',   'BC-000000102', '371.102 SOK', 'PTEC Main Library', 'Shelf A-1', NULL),
  ('55555555-5555-4555-8555-5555555c0201', '55555555-5555-4555-8555-555555555502', 'available', 'BC-000000201', '895.932 LON', 'PTEC Main Library', 'Shelf B-3', NULL),
  ('55555555-5555-4555-8555-5555555c0301', '55555555-5555-4555-8555-555555555503', 'available', 'BC-000000301', '519.5 PIC',   'PTEC Main Library', 'Shelf C-2', NULL),
  ('55555555-5555-4555-8555-5555555c0302', '55555555-5555-4555-8555-555555555503', 'on_loan',   'BC-000000302', '519.5 PIC',   'PTEC Main Library', 'Shelf C-2', 'Due back at end of term.')
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 7. Theses / research reports (4, rich abstracts)
-- ============================================================================

INSERT INTO public.research_reports
  (id, title, slug, abstract, department_id, cohort, academic_year, author_names, advisor_name,
   program, faculty, subject, keywords, is_published, status, published_at)
VALUES
  ('44444444-4444-4444-8444-444444444401', 'Reading Fluency in Grade 3 Classrooms', 'reading-fluency-grade-3',
   'This study examines the effect of a twelve-week paired-reading intervention on oral reading fluency among 240 Grade 3 pupils across three provincial primary schools. Words-correct-per-minute were measured at baseline, midpoint and endline against a matched control group. Pupils in the intervention group gained an average of 18 words per minute compared with 7 in the control group, with the largest gains among pupils who began in the lowest quartile. The report concludes with a costed model for scaling the intervention using existing classroom time and no additional printed materials.',
   '11111111-1111-4111-8111-1111111111d1', 'Cohort 2023', '2023-2024', 'Sok Dara, Chan Sophea', 'Dr. Meas Sokhom',
   'b_ed_12_4', 'primary', NULL, '{reading,fluency,primary,intervention}', true, 'published', '2024-05-12'),

  ('44444444-4444-4444-8444-444444444402', 'Teacher Motivation and Retention', 'teacher-motivation-retention',
   'A mixed-methods analysis of the factors that shape motivation among first-year teachers posted to rural schools. Survey responses from 412 graduates were combined with 24 semi-structured interviews conducted over one academic year. Housing, distance from family and the predictability of salary payment outweighed salary level itself in every model tested. The study argues that retention policy framed purely as a pay question misreads the decision teachers actually make, and proposes three low-cost interventions at the district level.',
   '11111111-1111-4111-8111-1111111111d3', 'Cohort 2022', '2022-2023', 'Chan Sophea', 'Dr. Ly Vanna',
   'bachelor_plus_1', NULL, NULL, '{motivation,retention,teachers,rural}', true, 'published', '2023-11-30'),

  ('44444444-4444-4444-8444-444444444403', 'ការប្រើប្រាស់សម្ភារៈបង្រៀនក្នុងថ្នាក់គណិតវិទ្យា', 'teaching-aids-mathematics-classrooms',
   'ការស្រាវជ្រាវនេះពិនិត្យលើការប្រើប្រាស់សម្ភារៈបង្រៀនដែលផលិតក្នុងស្រុក នៅក្នុងថ្នាក់គណិតវិទ្យាថ្នាក់ទី៤ និងទី៥ នៅសាលាបឋមសិក្សាចំនួន១២។ លទ្ធផលបង្ហាញថា សិស្សដែលរៀនជាមួយសម្ភារៈជាក់ស្តែង មានពិន្ទុខ្ពស់ជាងក្នុងការដោះស្រាយបញ្ហាប្រភាគ។ របាយការណ៍នេះផ្តល់អនុសាសន៍អំពីការបណ្តុះបណ្តាលគ្រូ និងការផលិតសម្ភារៈក្នុងតម្លៃទាប។',
   '11111111-1111-4111-8111-1111111111d2', 'Cohort 2023', '2023-2024', 'Pich Chanthou, ឡុង សុវណ្ណារ៉ា', 'Dr. Meas Sokhom',
   'b_ed_12_4', 'lower_secondary', 'math', '{mathematics,teaching-aids,fractions}', true, 'published', '2024-08-21'),

  ('44444444-4444-4444-8444-444444444404', 'Digital Access and Study Habits Among Trainee Teachers', 'digital-access-study-habits',
   'This report maps how PTEC trainee teachers actually access study material, based on device logs volunteered by 180 students and a follow-up questionnaire. Ninety-one percent read exclusively on a shared or personal smartphone, and peak reading occurred between 20:00 and 22:30 on mobile data rather than campus wifi. Offline availability, not bandwidth, was the strongest predictor of whether a set reading was completed. The findings directly informed the offline-first design of the PTEC e-Library.',
   '11111111-1111-4111-8111-1111111111d3', 'Cohort 2024', '2024-2025', 'Sok Dara', 'Dr. Ly Vanna',
   'bachelor_plus_1', NULL, NULL, '{digital-access,mobile,offline,study-habits}', true, 'published', '2025-03-14')
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 8. Posts (2 published, 1 draft — exercises the CMS status form)
-- ============================================================================

INSERT INTO public.posts
  (id, title, slug, excerpt, content, category, tags, author_id, is_published, status, pinned, featured, publish_at)
VALUES
  ('66666666-6666-4666-8666-666666666601', 'New Semester Opening Hours', 'new-semester-opening-hours',
   'The library extends evening hours from Monday 2 September for the new semester.',
   E'## Extended hours\n\nFrom **Monday 2 September** the reading room stays open until **20:00** on weekdays.\n\n| Day | Hours |\n| --- | --- |\n| Monday–Friday | 07:30 – 20:00 |\n| Saturday | 08:00 – 16:00 |\n| Sunday | Closed |\n\nBorrowing and returns close thirty minutes before the reading room does.',
   'Announcement', '{hours,semester,library}', '22222222-2222-2222-2222-222222222222', true, 'published', true, false, now() - interval '6 days'),

  ('66666666-6666-4666-8666-666666666602', 'How to Download Books for Offline Reading', 'download-books-offline',
   'A short guide to saving library books to your phone so they stay readable without mobile data.',
   E'## Read without data\n\nEvery book detail page has a **Download** button. Once a book is downloaded it appears under *Offline books* and opens with no network connection at all.\n\n1. Open any book page\n2. Tap **Download**\n3. Find it later under **Offline books**\n\n> Downloads stay on your device until you remove them. Installing the library as an app keeps them available even when the browser cache is cleared.',
   'Guide', '{offline,pwa,how-to}', '33333333-3333-3333-3333-333333333333', true, 'published', false, true, now() - interval '2 days'),

  ('66666666-6666-4666-8666-666666666603', 'Draft: Annual Library Report 2026', 'annual-library-report-2026',
   'Work in progress — figures for the 2026 annual report are still being collected.',
   E'## Draft\n\nThis post is intentionally left in **draft** status so the admin CMS draft/publish workflow can be tested locally.\n\nSections still to write:\n\n- [x] Collection growth\n- [ ] Reader engagement\n- [ ] Budget summary',
   'Report', '{annual-report,draft}', '11111111-1111-1111-1111-111111111111', false, 'draft', false, false, NULL)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 9. Announcements (1 pinned, 1 normal)
-- ============================================================================

INSERT INTO public.announcements
  (id, internal_name, type, priority, title_en, title_km, summary_en, summary_km, body_en, body_km,
   cta_label_en, cta_url, channel_in_app, channel_banner, channel_push,
   audience_type, pinned, dismissible, status, published_at)
VALUES
  ('77777777-7777-4777-8777-777777777701', 'Semester opening 2026 — banner', 'general', 'important',
   'The library is open for the new semester',
   'បណ្ណាល័យបើកដំណើរការសម្រាប់ឆមាសថ្មី',
   'Extended evening hours and 120 newly catalogued titles are available from this week.',
   'ម៉ោងបើកបន្ថែមនៅពេលល្ងាច និងសៀវភៅថ្មីចំនួន១២០ក្បាល មានចាប់ពីសប្តាហ៍នេះ។',
   'The reading room now closes at 20:00 on weekdays. New arrivals are shelved in the front display case and are all borrowable.',
   'បន្ទប់អានឥឡូវនេះបិទនៅម៉ោង២០:០០ ថ្ងៃធ្វើការ។ សៀវភៅថ្មីត្រូវបានដាក់តាំងនៅមុខ ហើយអាចខ្ចីបាន។',
   'See opening hours', '/about/rules',
   true, true, false, 'all_active', true, true, 'active', now() - interval '3 days'),

  ('77777777-7777-4777-8777-777777777702', 'Catalogue maintenance window', 'maintenance', 'normal',
   'Short catalogue maintenance on Sunday morning',
   'ការថែទាំបញ្ជីសៀវភៅនៅព្រឹកថ្ងៃអាទិត្យ',
   'Search may be briefly unavailable between 06:00 and 07:00 on Sunday.',
   'ការស្វែងរកអាចមិនដំណើរការបណ្តោះអាសន្ន ចន្លោះម៉ោង០៦:០០ ដល់០៧:០០ ថ្ងៃអាទិត្យ។',
   'Downloaded books remain readable offline throughout the maintenance window.',
   'សៀវភៅដែលបានទាញយក នៅតែអាចអានបានក្នុងអំឡុងពេលថែទាំ។',
   NULL, NULL,
   true, false, false, 'all_active', false, true, 'active', now() - interval '1 day')
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 10. Team (sections + 3 members)
-- ============================================================================

INSERT INTO public.team_sections (id, name_en, name_km, description_en, description_km, display_order) VALUES
  ('88888888-8888-4888-8888-88888888a001', 'Library Leadership', 'ថ្នាក់ដឹកនាំបណ្ណាល័យ',
   'Directors and heads responsible for library strategy and services.',
   'នាយក និងប្រធានទទួលបន្ទុកយុទ្ធសាស្ត្រ និងសេវាកម្មបណ្ណាល័យ។', 1),
  ('88888888-8888-4888-8888-88888888a002', 'Library Staff', 'បុគ្គលិកបណ្ណាល័យ',
   'Cataloguing, circulation and reader services team.',
   'ក្រុមការងារចុះបញ្ជី ខ្ចី-សង និងសេវាកម្មអ្នកអាន។', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.team_members
  (id, user_id, section_id, name_en, name_km, position_en, position_km, education,
   years_experience, phone, bio_en, bio_km, display_order, is_published)
VALUES
  ('88888888-8888-4888-8888-888888888801', '22222222-2222-2222-2222-222222222222',
   '88888888-8888-4888-8888-88888888a001', 'Head Librarian', 'ប្រធានបណ្ណាល័យ',
   'Head Librarian', 'ប្រធានបណ្ណាល័យ', 'MA in Library and Information Science', '12 years', '+855 12 000 001',
   'Leads collection development and the digitisation programme, and has overseen the move of the PTEC catalogue to an open, searchable platform.',
   'ដឹកនាំការអភិវឌ្ឍបណ្តុំសៀវភៅ និងកម្មវិធីធ្វើឌីជីថល ព្រមទាំងបានដឹកនាំការផ្លាស់ប្តូរបញ្ជីសៀវភៅ PTEC ទៅជាប្រព័ន្ធបើកចំហ។', 1, true),

  ('88888888-8888-4888-8888-888888888802', '33333333-3333-3333-3333-333333333333',
   '88888888-8888-4888-8888-88888888a002', 'Content Staff', 'បុគ្គលិកមាតិកា',
   'Cataloguing Officer', 'មន្ត្រីចុះបញ្ជី', 'BA in Education', '5 years', '+855 12 000 002',
   'Responsible for metadata quality across the digital collection and for the weekly new-arrivals list.',
   'ទទួលបន្ទុកគុណភាពទិន្នន័យមេតានៃបណ្តុំឌីជីថល និងបញ្ជីសៀវភៅថ្មីប្រចាំសប្តាហ៍។', 2, true),

  ('88888888-8888-4888-8888-888888888803', NULL,
   '88888888-8888-4888-8888-88888888a002', 'Reader Services Assistant', 'ជំនួយការសេវាកម្មអ្នកអាន',
   'Reader Services Assistant', 'ជំនួយការសេវាកម្មអ្នកអាន', 'BA in Khmer Literature', '3 years', '+855 12 000 003',
   'Runs the reading-room desk, induction sessions for first-year trainees, and the inter-library request queue.',
   'ទទួលបន្ទុកតុបម្រើសេវានៅបន្ទប់អាន វគ្គណែនាំសម្រាប់និស្សិតឆ្នាំទី១ និងសំណើខ្ចីសៀវភៅរវាងបណ្ណាល័យ។', 3, true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 11. Publications — authors, affiliations, access states, figures
-- ============================================================================
--
-- WHAT THIS EXERCISES, and why each row is here:
--
--   * The three author profile levels the public page must handle without
--     rendering an empty section — complete, standard, and name-only.
--   * A person who exists in BOTH author tables, so /authors/sok-dara has to
--     merge e-books and journal articles into one works list.
--   * A near-duplicate author, so the admin table's duplicate badge and the
--     merge dialog have something real to act on.
--   * A hidden profile (is_published = false), which withholds the biography
--     and links while still listing the works and keeping every byline.
--   * All four download-access outcomes: allowed, refused by library policy
--     (with and without a custom message), refused for rights, and no file.
--
-- IMAGES point at files that really exist in public/. They are obviously
-- placeholders, but they render — a figure gallery seeded with dead URLs tests
-- nothing except the broken-image icon. Author photo_url is left NULL on
-- purpose: initials are what a fresh install shows, and that fallback is worth
-- seeing by default.
--
-- PDFs: pdf_url holds a bare storage key with no object behind it — the shape
-- a legacy record has, and the closest thing to real data a seed can offer
-- without a storage backend. That is deliberate, and it makes the response code
-- the whole test of the access gate:
--     403 = the gate REFUSED (policy or rights); storage was never touched
--     404 = the gate ALLOWED it and storage simply has no such object
-- so a 404 on `?download=1` means the permission check passed. Verified:
--     first-posting-graduates-longitudinal                    404  (allowed)
--     khmer-literacy-assessment-framework                     403  policy
--     teacher-wellbeing-provincial-survey                     403  policy
--     from-what-chemistry-can-do-to-what-chemists-should-do   403  rights
--     assessment-literacy-scoping-review                      404  no file


-- ── Institutions ────────────────────────────────────────────────────────────

INSERT INTO public.publication_affiliations (id, name, name_km, city, country) VALUES
  ('99999999-9999-4999-8999-99999999a001', 'Phnom Penh Teacher Education College',
   'មហាវិទ្យាល័យគរុកោសល្យភ្នំពេញ', 'Phnom Penh', 'Cambodia'),
  ('99999999-9999-4999-8999-99999999a002', 'Royal University of Phnom Penh',
   'សាកលវិទ្យាល័យភូមិន្ទភ្នំពេញ', 'Phnom Penh', 'Cambodia'),
  ('99999999-9999-4999-8999-99999999a003', 'University of Alicante',
   NULL, 'Alicante', 'Spain')
ON CONFLICT (id) DO NOTHING;


-- ── Author profiles ─────────────────────────────────────────────────────────

INSERT INTO public.publication_authors
  (id, full_name, full_name_km, slug, orcid, email, bio, bio_km,
   position_title, affiliation_name, website_url, google_scholar_url,
   research_gate_url, research_interests, is_published)
VALUES
  -- COMPLETE profile. Every optional field populated, so the hero, About,
  -- research interests, all four external links and the full statistics strip
  -- all render. Shares a slug with the book author of the same name.
  ('99999999-9999-4999-8999-999999990001', 'Sok Dara', 'សុខ តារា', 'sok-dara',
   '0000-0002-1825-0097', 'sok.dara@ptec.local',
   'Sok Dara is a lecturer in educational foundations at PTEC, where he has taught since 2011. His work concerns how teacher-preparation curricula translate into practice in low-resource provincial classrooms, and he leads the college''s longitudinal study of first-posting graduates.

Before joining PTEC he taught Grade 4 and 5 in Kampong Cham for nine years. He continues to teach one primary class each term, which he describes as the only reliable defence against writing research that no teacher can use.',
   'លោក សុខ តារា ជាសាស្ត្រាចារ្យផ្នែកមូលដ្ឋានគ្រឹះនៃការអប់រំនៅ វ.គ.ភ ចាប់តាំងពីឆ្នាំ២០១១។ ការស្រាវជ្រាវរបស់លោកផ្តោតលើការអនុវត្តកម្មវិធីបណ្តុះបណ្តាលគ្រូនៅតាមសាលាបឋមសិក្សាក្នុងខេត្ត។',
   'Lecturer in Educational Foundations', 'Phnom Penh Teacher Education College',
   'https://example.edu/~sokdara', 'https://scholar.google.com/citations?user=SEEDDARA',
   'https://www.researchgate.net/profile/Sok-Dara-seed',
   '{"Teacher education","Classroom practice","Educational policy"}', true),

  -- STANDARD profile: position, institution and a short biography, but no
  -- external identities. The link row must be absent entirely, not empty.
  ('99999999-9999-4999-8999-999999990002', 'Chan Sophea', 'ចាន់ សុភា', 'chan-sophea',
   NULL, NULL,
   'Chan Sophea trains first-year teacher candidates in classroom management and formative assessment, and coordinates PTEC''s school-placement programme.',
   NULL,
   'Teacher Trainer', 'Phnom Penh Teacher Education College',
   NULL, NULL, NULL, '{"Formative assessment","Classroom management"}', true),

  -- Khmer-primary name. Checks the Khmer slug survives the round trip and that
  -- the name renders in the Khmer font stack with lang="km".
  ('99999999-9999-4999-8999-999999990003', 'ឡុង សុវណ្ណារ៉ា', 'ឡុង សុវណ្ណារ៉ា', 'ឡុង-សុវណ្ណារ៉ា',
   NULL, NULL,
   NULL,
   'អ្នកស្រាវជ្រាវផ្នែកវិធីសាស្ត្របង្រៀនភាសាខ្មែរ ដែលផ្តោតលើការបង្រៀនអក្សរសាស្ត្រនៅថ្នាក់បឋមសិក្សា។',
   'Researcher', 'Royal University of Phnom Penh',
   NULL, NULL, NULL, '{}', true),

  -- No profile fields of its own, but the SAME SLUG as a book author who does
  -- have a biography — so this row exercises the cross-table fallback: the
  -- profile page renders a biography it did not itself supply, taken from the
  -- public.authors record for the same person. (The genuinely name-only case,
  -- where no biography exists in either table, is 'Sok  Dara' below.)
  ('99999999-9999-4999-8999-999999990004', 'Pich Chanthou', NULL, 'pich-chanthou',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}', true),

  -- Accented Latin name — the shape of the production URL
  -- /authors/javier-garc%C3%ADa-mart%C3%ADnez that the 0125 backfill must not
  -- break. The slug keeps its diacritic.
  ('99999999-9999-4999-8999-999999990005', 'Elena Rodríguez', NULL, 'elena-rodríguez',
   '0000-0001-5109-3700', NULL,
   'Elena Rodríguez works on chemistry education and the ethics of scientific practice, with a particular interest in how undergraduate curricula frame professional responsibility.',
   NULL,
   'Professor of Chemistry Education', 'University of Alicante',
   NULL, NULL, 'https://www.researchgate.net/profile/Elena-Rodriguez-seed',
   '{"Chemistry education","Research ethics","Sustainability"}', true),

  -- HIDDEN profile. The page must still show the name and the works, and the
  -- byline on every article must be unaffected — but the biography, position,
  -- institution and links are withheld.
  ('99999999-9999-4999-8999-999999990006', 'Meas Sokhom', NULL, 'meas-sokhom',
   NULL, NULL,
   'This biography must NOT appear on the public profile while is_published is false.',
   NULL,
   'Research Supervisor', 'Phnom Penh Teacher Education College',
   'https://example.edu/~meassokhom', NULL, NULL,
   '{"Research methods"}', false),

  -- NEAR-DUPLICATE of Sok Dara: same name, different whitespace, so
  -- duplicateKey() collapses them and the admin table flags both. Credited on
  -- its own publication, so merging it actually has to move something.
  --
  -- Doubles as the NAME-ONLY profile: its slug matches no book author, so
  -- nothing fills in a biography and the page must render a name and a works
  -- list with no About heading, no interests, no link row, no type-count tile,
  -- and no search box (one work is not worth a search box).
  ('99999999-9999-4999-8999-999999990007', 'Sok  Dara', NULL, 'sok-dara-2',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}', true)
ON CONFLICT (id) DO NOTHING;


-- ── Publications ────────────────────────────────────────────────────────────

INSERT INTO public.publications
  (id, slug, title, title_km, article_type, journal_name, volume, issue_no,
   page_start, page_end, doi, issn, publication_date, abstract, abstract_km,
   keywords, subjects, publisher, license, copyright, language,
   cover_url, pdf_url, "references", table_of_contents, learning_outcomes, faqs,
   allow_download, download_disabled_reason, fulltext_redistributable,
   is_published, published_at)
VALUES
  -- (1) FULLY DOWNLOADABLE. PTEC's own output under CC BY 4.0, so both the
  -- policy switch and the rights gate say yes. The flagship record: three
  -- authors with affiliation markers and a corresponding author, figures, a
  -- table of contents, learning outcomes, FAQs and references.
  ('99999999-9999-4999-8999-99999999b001', 'first-posting-graduates-longitudinal',
   'What Happens After Graduation: A Longitudinal Study of First-Posting Teachers',
   'អ្វីដែលកើតឡើងក្រោយបញ្ចប់ការសិក្សា៖ ការសិក្សាតាមដានគ្រូបង្រៀនឆ្នាំដំបូង',
   'article', 'Cambodian Journal of Teacher Education', '7', '2', '114', '139',
   '10.5281/zenodo.9000001', '2789-0001', '2025-06-18',
   'Teacher-preparation programmes are evaluated almost entirely on what happens before graduation. This study follows 412 PTEC graduates through their first two years of posting, combining termly survey waves with classroom observation in a stratified subsample of 60. Three findings hold across every model: the gap between trained practice and enacted practice opens within the first eleven weeks; it opens fastest where class size exceeds fifty; and it does not close on its own in year two. We argue that the decisive variable is not the quality of preparation but the presence of any structured support in the first term, and we cost a district-level mentoring model against the observed attrition it would need to prevent to pay for itself.',
   'កម្មវិធីបណ្តុះបណ្តាលគ្រូត្រូវបានវាយតម្លៃស្ទើរតែទាំងស្រុងលើអ្វីដែលកើតឡើងមុនពេលបញ្ចប់ការសិក្សា។ ការសិក្សានេះតាមដានបណ្ឌិតបញ្ចប់ការសិក្សាចំនួន ៤១២ នាក់ក្នុងរយៈពេលពីរឆ្នាំដំបូងនៃការតែងតាំង។',
   '{"teacher education","longitudinal study","induction","retention"}',
   '{"Education","Educational Research"}',
   'PTEC Press', 'CC BY 4.0', '© 2025 the authors', 'en',
   '/ptec-library-opt.jpg', 'publications/seed/first-posting-graduates.pdf',
   '[{"id":"ref-hattie-2009","text":"Hattie, J. (2009). Visible Learning: A Synthesis of Over 800 Meta-Analyses Relating to Achievement. Routledge."},
     {"id":"ref-ingersoll-2011","text":"Ingersoll, R. M., & Strong, M. (2011). The impact of induction and mentoring programs for beginning teachers. Review of Educational Research, 81(2), 201-233.","doi":"10.3102/0034654311403323"},
     {"id":"ref-moeys-2023","text":"Ministry of Education, Youth and Sport (2023). Teacher Policy Action Plan 2024-2030. Phnom Penh.","url":"https://www.moeys.gov.kh/"}]'::jsonb,
   '[{"title":"Introduction","page":"114"},
     {"title":"Method and sample","page":"118"},
     {"title":"Findings: the first eleven weeks","page":"122"},
     {"title":"A costed mentoring model","page":"131"},
     {"title":"Limitations and further work","page":"137"}]'::jsonb,
   '{"Describe how enacted classroom practice diverges from trained practice in a first posting","Identify the conditions under which that divergence accelerates","Evaluate a district mentoring model against its own cost"}',
   '[{"question":"Is the underlying survey data available?","answer":"Anonymised wave-level data is available from the corresponding author on request, under the same CC BY 4.0 terms as the article."},
     {"question":"Does this cover secondary teachers?","answer":"No. The sample is primary-posting graduates only. A secondary cohort is being followed separately and has not yet reached its second-year wave."}]'::jsonb,
   true, NULL, true, true, '2025-06-18'),

  -- (2) READ-ONLINE-ONLY, with the librarian's own explanation. Rights would
  -- allow it (PTEC, CC BY-NC); the LIBRARY has chosen not to hand out the file.
  -- The page must show the custom message, and ?download=1 must return 403.
  ('99999999-9999-4999-8999-99999999b002', 'khmer-literacy-assessment-framework',
   'A Common Assessment Framework for Early Khmer Literacy',
   'ក្របខណ្ឌវាយតម្លៃរួមសម្រាប់អក្ខរកម្មខ្មែរដំបូង',
   'article', 'Cambodian Journal of Teacher Education', '7', '1', '22', '48',
   NULL, '2789-0001', '2025-02-04',
   'Six provincial teacher-training centres currently assess early Khmer reading with six incompatible instruments, which makes provincial comparison impossible and national planning guesswork. This paper reports the development and first field trial of a common framework: a 40-item instrument covering letter knowledge, decoding, oral fluency and listening comprehension, trialled with 1,180 pupils in Grades 1 to 3. Inter-rater reliability reached 0.91 after a half-day training. The instrument itself is under review by the ministry and is not yet released for redistribution, which is why this record is available for reading but not for download.',
   NULL,
   '{"literacy","assessment","khmer","early grades"}',
   '{"Education","Khmer Literature"}',
   'PTEC Press', 'CC BY-NC 4.0', '© 2025 PTEC', 'en',
   NULL, 'publications/seed/khmer-literacy-framework.pdf',
   '[{"id":"ref-rti-2016","text":"RTI International (2016). Early Grade Reading Assessment (EGRA) Toolkit, Second Edition."}]'::jsonb,
   '[]'::jsonb, '{}', '[]'::jsonb,
   false,
   'The assessment instrument is under ministry review. This article is available for online reading until the review concludes.',
   true, true, '2025-02-04'),

  -- (3) CITATION-ONLY. Third-party publisher, all-rights-reserved licence and
  -- no redistribution override, so the RIGHTS gate refuses even though
  -- allow_download is true. Mirrors the ACS reference article: the landing
  -- page and DOI stay public, the full text does not.
  ('99999999-9999-4999-8999-99999999b003', 'from-what-chemistry-can-do-to-what-chemists-should-do',
   'From What Chemistry Can Do to What Chemists Should Do',
   NULL,
   'editorial', 'Journal of Chemical Education', '102', '11', '4661', '4665',
   '10.1021/acs.jchemed.5c01467', '0021-9584', '2025-11-11',
   'Chemistry education has long been organised around capability — what the discipline can make, measure and explain. This editorial argues that capability is no longer a sufficient organising principle for a curriculum, and that questions of responsibility belong in the first year rather than in an elective ethics module at the end. We set out four guiding principles and describe what each would change about an introductory sequence.',
   NULL,
   '{"responsible chemistry","chemistry education","sustainability","ethics"}',
   '{"Education"}',
   'American Chemical Society', '© 2025 American Chemical Society. All rights reserved.',
   '© 2025 American Chemical Society', 'en',
   '/og-default.png', 'publications/seed/jchemed-5c01467.pdf',
   '[]'::jsonb, '[]'::jsonb, '{}', '[]'::jsonb,
   true, NULL, false, true, '2025-11-11'),

  -- (4) READ-ONLINE-ONLY with NO custom message — the standard wording has to
  -- carry it. Also the only record credited to the near-duplicate author, so a
  -- merge has a byline to move.
  ('99999999-9999-4999-8999-99999999b004', 'teacher-wellbeing-provincial-survey',
   'Teacher Wellbeing in Provincial Schools: A Survey of 900 Practitioners',
   NULL,
   'review', 'Cambodian Journal of Teacher Education', '6', '3', '201', '224',
   NULL, '2789-0001', '2024-10-09',
   'A cross-sectional survey of 900 primary teachers across nine provinces, covering workload, housing, salary predictability and access to professional contact. Reported wellbeing correlates far more strongly with the predictability of salary payment than with its amount, and with distance from family than with distance from the provincial capital. The review situates these findings against the regional literature and identifies three measurement problems that make cross-country comparison unsafe.',
   NULL,
   '{"wellbeing","teachers","survey","rural education"}',
   '{"Educational Research"}',
   'PTEC Press', NULL, NULL, 'en',
   NULL, 'publications/seed/teacher-wellbeing-survey.pdf',
   '[]'::jsonb, '[]'::jsonb, '{}', '[]'::jsonb,
   false, NULL, false, true, '2024-10-09'),

  -- (5) NO FILE. A bibliographic record only. Neither reading nor downloading
  -- is offered, the Full text section must not render, and the access notice
  -- must say "no file attached" rather than implying a permission refusal.
  ('99999999-9999-4999-8999-99999999b005', 'assessment-literacy-scoping-review',
   'Assessment Literacy Among Pre-Service Teachers: A Scoping Review',
   NULL,
   'review', 'Southeast Asian Review of Education', '3', '1', '55', '78',
   '10.5281/zenodo.9000005', NULL, '2024-04-22',
   'A scoping review of 61 studies published between 2010 and 2023 on assessment literacy in pre-service teacher education across Southeast Asia. The review maps what is measured, finds that self-report dominates and that only nine studies observe assessment practice directly, and sets out the consequences of that imbalance for policy claims made on this evidence base.',
   NULL,
   '{"assessment literacy","scoping review","pre-service"}',
   '{"Education","Educational Research"}',
   'Southeast Asian Review of Education', 'CC BY 4.0', NULL, 'en',
   NULL, NULL,
   '[]'::jsonb, '[]'::jsonb, '{}', '[]'::jsonb,
   true, NULL, true, true, '2024-04-22'),

  -- (6) DRAFT. Invisible to the public site; gives the admin list and the
  -- publish gate an unpublished record to work with.
  ('99999999-9999-4999-8999-99999999b006', 'multigrade-teaching-working-paper',
   'Multigrade Teaching in Cambodia: A Working Paper',
   NULL,
   'account', 'Cambodian Journal of Teacher Education', NULL, NULL, NULL, NULL,
   NULL, NULL, NULL,
   'Draft working paper on multigrade classroom organisation in schools with fewer than four teachers. Not yet published — this record exists so the admin review-and-publish workflow has a draft to act on.',
   NULL,
   '{"multigrade","rural schools"}', '{"Education"}',
   'PTEC Press', NULL, NULL, 'en',
   NULL, NULL, '[]'::jsonb, '[]'::jsonb, '{}', '[]'::jsonb,
   true, NULL, false, false, NULL)
ON CONFLICT (id) DO NOTHING;


-- ── Authorships (order, corresponding author, affiliation markers) ──────────
-- author_order is what the byline and every citation format read, so the rows
-- are deliberately inserted out of order here: if ordering were being taken
-- from insertion order rather than the column, this seed would expose it.

INSERT INTO public.publication_authorships
  (publication_id, author_id, author_order, is_corresponding, affiliation_ids)
VALUES
  -- (1) Three authors, two institutions, one corresponding.
  ('99999999-9999-4999-8999-99999999b001', '99999999-9999-4999-8999-999999990002', 2, false,
   '{99999999-9999-4999-8999-99999999a001}'),
  ('99999999-9999-4999-8999-99999999b001', '99999999-9999-4999-8999-999999990001', 1, true,
   '{99999999-9999-4999-8999-99999999a001}'),
  ('99999999-9999-4999-8999-99999999b001', '99999999-9999-4999-8999-999999990006', 3, false,
   '{99999999-9999-4999-8999-99999999a002}'),

  -- (2) Khmer-named first author, plus a name-only co-author.
  ('99999999-9999-4999-8999-99999999b002', '99999999-9999-4999-8999-999999990003', 1, true,
   '{99999999-9999-4999-8999-99999999a002}'),
  ('99999999-9999-4999-8999-99999999b002', '99999999-9999-4999-8999-999999990004', 2, false, '{}'),

  -- (3) The foreign co-author, on the citation-only record.
  ('99999999-9999-4999-8999-99999999b003', '99999999-9999-4999-8999-999999990005', 1, true,
   '{99999999-9999-4999-8999-99999999a003}'),

  -- (4) Credited to the near-duplicate record, so merging it has work to do.
  ('99999999-9999-4999-8999-99999999b004', '99999999-9999-4999-8999-999999990007', 1, false, '{}'),
  ('99999999-9999-4999-8999-99999999b004', '99999999-9999-4999-8999-999999990002', 2, false,
   '{99999999-9999-4999-8999-99999999a001}'),

  -- (5) No file, but a real byline — the works list still has to show it.
  ('99999999-9999-4999-8999-99999999b005', '99999999-9999-4999-8999-999999990001', 1, false,
   '{99999999-9999-4999-8999-99999999a001}'),

  -- (6) Draft.
  ('99999999-9999-4999-8999-99999999b006', '99999999-9999-4999-8999-999999990001', 1, false, '{}')
ON CONFLICT (publication_id, author_id) DO NOTHING;


-- ── Supporting information files ────────────────────────────────────────────

INSERT INTO public.publication_files
  (id, publication_id, label, file_url, file_type, size_bytes, sort_order)
VALUES
  ('99999999-9999-4999-8999-99999999c001', '99999999-9999-4999-8999-99999999b001',
   'Survey instrument (all four waves)', 'publications/seed/si-01-survey-instrument.pdf', 'pdf', 184320, 0),
  ('99999999-9999-4999-8999-99999999c002', '99999999-9999-4999-8999-99999999b001',
   'Observation protocol and coding scheme', 'publications/seed/si-02-observation-protocol.pdf', 'pdf', 96256, 1)
ON CONFLICT (id) DO NOTHING;


-- ── Figures ─────────────────────────────────────────────────────────────────
-- caption and alt_text are populated SEPARATELY and say different things, which
-- is the distinction the admin form exists to preserve: the caption is the
-- printed line, the alt text is what a screen reader announces instead of the
-- image. Figure 3 deliberately has NO alt text, so the decorative-image branch
-- (alt="") is reachable in manual QA.

INSERT INTO public.publication_figures
  (id, publication_id, image_url, caption, caption_km, alt_text, credit, sort_order)
VALUES
  ('99999999-9999-4999-8999-99999999d001', '99999999-9999-4999-8999-99999999b001',
   '/ptec-library-opt.jpg',
   'Divergence between trained and enacted practice over the first two years of posting.',
   'គម្លាតរវាងការអនុវត្តដែលបានបណ្តុះបណ្តាល និងការអនុវត្តជាក់ស្តែងក្នុងរយៈពេលពីរឆ្នាំដំបូង។',
   'Line chart with two series separating steeply between weeks four and eleven, then running parallel.',
   'PTEC Longitudinal Study, 2025', 0),

  ('99999999-9999-4999-8999-99999999d002', '99999999-9999-4999-8999-99999999b001',
   '/og-default.png',
   'Observed divergence by class size, stratified subsample (n = 60).',
   NULL,
   'Grouped bar chart in three class-size bands; the widest bar is the over-fifty band.',
   'PTEC Longitudinal Study, 2025', 1),

  -- No alt_text: the image is marked decorative and the caption carries the
  -- meaning, rather than a screen reader hearing the same sentence twice.
  ('99999999-9999-4999-8999-99999999d003', '99999999-9999-4999-8999-99999999b001',
   '/sva.jpg',
   'Proposed district mentoring model, showing the three contact points in term one.',
   NULL, NULL, NULL, 2),

  ('99999999-9999-4999-8999-99999999d004', '99999999-9999-4999-8999-99999999b002',
   '/ptec-library-opt.jpg',
   'Inter-rater reliability by item block, before and after the half-day training.',
   NULL,
   'Dot plot of reliability coefficients rising from roughly 0.6 to above 0.9 in every block.',
   NULL, 0)
ON CONFLICT (id) DO NOTHING;


-- ── Fill any author slug an earlier seed left NULL ──────────────────────────
-- Same reason as section 4: ON CONFLICT DO NOTHING skips rows an earlier run
-- created, and a NULL slug pushes /authors/[slug] onto its scan fallback.

UPDATE public.publication_authors
   SET slug = public.author_slugify(coalesce(nullif(full_name, ''), full_name_km))
 WHERE slug IS NULL;
