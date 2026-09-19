-- ============================================================================
-- PTEC E-Library: Seed Script for Team Members & Committee
-- Based on the Department of Educational Research and Library Board
-- (ដេប៉ាតឺម៉ង់ស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ)
--
-- This script is idempotent and safe to re-run in Supabase SQL Editor.
-- ============================================================================

DO $$
DECLARE
  -- Team Section IDs
  v_sec_general_id    uuid;
  v_sec_research_id   uuid;
  v_sec_catalog_id    uuid;
  v_sec_reader_id     uuid;

  -- Committee Section IDs
  v_comm_lead_id      uuid;
  v_comm_lecturers_id uuid;
  v_comm_librarians_id uuid;

  -- Temporary member ID holder
  v_member_id         uuid;
BEGIN

  -- ──────────────────────────────────────────────────────────────────────────
  -- 1. Ensure Team Sections exist (Staff Directory grouping)
  -- ──────────────────────────────────────────────────────────────────────────
  -- General Management / Leadership
  SELECT id INTO v_sec_general_id FROM public.team_sections WHERE name_en ILIKE '%General Management%' OR name_km ILIKE '%គ្រប់គ្រងទូទៅ%' LIMIT 1;
  IF v_sec_general_id IS NULL THEN
    INSERT INTO public.team_sections (name_km, name_en, description_km, description_en, display_order, is_active)
    VALUES ('គ្រប់គ្រងទូទៅ', 'General Management', 'ក្រុមដឹកនាំ និងគ្រប់គ្រងបណ្ណាល័យ', 'Library leadership and overall management', 1, true)
    RETURNING id INTO v_sec_general_id;
  END IF;

  -- Research Support / Lecturers
  SELECT id INTO v_sec_research_id FROM public.team_sections WHERE name_en ILIKE '%Research%' OR name_km ILIKE '%ស្រាវជ្រាវ%' LIMIT 1;
  IF v_sec_research_id IS NULL THEN
    INSERT INTO public.team_sections (name_km, name_en, description_km, description_en, display_order, is_active)
    VALUES ('ការស្រាវជ្រាវវិទ្យា', 'Research Support', 'គាំទ្រការស្រាវជ្រាវ និងការអភិវឌ្ឍគរុកោសល្យ', 'Supporting PTEC research and educational development', 2, true)
    RETURNING id INTO v_sec_research_id;
  END IF;

  -- Cataloging & Processing
  SELECT id INTO v_sec_catalog_id FROM public.team_sections WHERE name_en ILIKE '%Catalog%' OR name_km ILIKE '%ចាត់ថ្នាក់%' LIMIT 1;
  IF v_sec_catalog_id IS NULL THEN
    INSERT INTO public.team_sections (name_km, name_en, description_km, description_en, display_order, is_active)
    VALUES ('ការចាត់ថ្នាក់ & ភ្ជាប់', 'Cataloging & Processing', 'ចំណាត់ថ្នាក់ DDC ការចុះបញ្ជី និងការរៀបចំឯកសារ', 'DDC classification, registration and document processing', 3, true)
    RETURNING id INTO v_sec_catalog_id;
  END IF;

  -- Reader Services
  SELECT id INTO v_sec_reader_id FROM public.team_sections WHERE name_en ILIKE '%Reader%' OR name_km ILIKE '%ផ្តល់សេវា%' LIMIT 1;
  IF v_sec_reader_id IS NULL THEN
    INSERT INTO public.team_sections (name_km, name_en, description_km, description_en, display_order, is_active)
    VALUES ('ការផ្តល់សេវា', 'Reader Services', 'ខ្ចី-សង ជំនួយការស្រាវជ្រាវ និងការបម្រើអ្នកអាន', 'Circulation, research assistance and patron services', 4, true)
    RETURNING id INTO v_sec_reader_id;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 2. Ensure Committee Sections exist (Governance grouping at /admin/team/committee/sections)
  -- ──────────────────────────────────────────────────────────────────────────
  -- Leadership section (uses 'leadership' layout variant)
  SELECT id INTO v_comm_lead_id FROM public.committee_sections WHERE name_en ILIKE '%Leadership%' OR name_km ILIKE '%ថ្នាក់ដឹកនាំ%' LIMIT 1;
  IF v_comm_lead_id IS NULL THEN
    INSERT INTO public.committee_sections (name_km, name_en, description_km, description_en, display_order, layout_variant, is_active)
    VALUES (
      'ថ្នាក់ដឹកនាំគណៈកម្មការ',
      'Committee Leadership',
      'គណៈគ្រប់គ្រងទទួលបន្ទុកគោលនយោបាយ និងការអភិវឌ្ឍបណ្ណាល័យ',
      'Executive leadership responsible for library policy and development.',
      1,
      'leadership',
      true
    )
    RETURNING id INTO v_comm_lead_id;
  ELSE
    UPDATE public.committee_sections
       SET layout_variant = 'leadership',
           name_km = 'ថ្នាក់ដឹកនាំគណៈកម្មការ',
           name_en = 'Committee Leadership',
           description_km = 'គណៈគ្រប់គ្រងទទួលបន្ទុកគោលនយោបាយ និងការអភិវឌ្ឍបណ្ណាល័យ',
           description_en = 'Executive leadership responsible for library policy and development.'
     WHERE id = v_comm_lead_id;
  END IF;

  -- Lecturers & Research Advisors section
  SELECT id INTO v_comm_lecturers_id FROM public.committee_sections WHERE name_en ILIKE '%Lecturer%' OR name_km ILIKE '%គ្រូឧទ្ទេស%' LIMIT 1;
  IF v_comm_lecturers_id IS NULL THEN
    INSERT INTO public.committee_sections (name_km, name_en, description_km, description_en, display_order, layout_variant, is_active)
    VALUES (
      'គ្រូឧទ្ទេស និងទីប្រឹក្សាស្រាវជ្រាវ',
      'Lecturers & Research Advisors',
      'គ្រូឧទ្ទេសដេប៉ាតឺម៉ង់ស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ',
      'Department lecturers and educational research advisors.',
      2,
      'grid',
      true
    )
    RETURNING id INTO v_comm_lecturers_id;
  END IF;

  -- Library Officers & Librarians section
  SELECT id INTO v_comm_librarians_id FROM public.committee_sections WHERE name_en ILIKE '%Librarian%' OR name_en ILIKE '%Officer%' OR name_km ILIKE '%បណ្ណារក្ស%' LIMIT 1;
  IF v_comm_librarians_id IS NULL THEN
    INSERT INTO public.committee_sections (name_km, name_en, description_km, description_en, display_order, layout_variant, is_active)
    VALUES (
      'មន្ត្រី និងបណ្ណារក្ស',
      'Library Officers & Librarians',
      'មន្ត្រី និងបណ្ណារក្សទទួលបន្ទុកប្រតិបត្តិការបណ្ណាល័យ',
      'Library officers and staff running day-to-day services.',
      3,
      'grid',
      true
    )
    RETURNING id INTO v_comm_librarians_id;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 3. Upsert Team Members & Assign Committee Seats
  -- ──────────────────────────────────────────────────────────────────────────

  -- --------------------------------------------------------------------------
  -- 1. Mrs. THOLTHOEUN CHANRAEKSMEY (Head / Chair)
  -- --------------------------------------------------------------------------
  SELECT id INTO v_member_id FROM public.team_members
   WHERE slug = 'tholthoeun-chanraeksmey'
      OR name_en ILIKE '%THOLTHOEUN%'
      OR name_km ILIKE '%ថុលធឿន%'
   LIMIT 1;

  IF v_member_id IS NULL THEN
    INSERT INTO public.team_members (
      slug, name_km, name_en, position_km, position_en, section_id,
      education, display_order, is_published
    ) VALUES (
      'tholthoeun-chanraeksmey',
      'លោកស្រី ថុលធឿន ចាន់រស្មី',
      'Mrs. THOLTHOEUN CHANRAEKSMEY',
      'ប្រធានដេប៉ាតឺម៉ង់',
      'Head of Department',
      v_sec_general_id,
      'បរិ. ជាន់ខ្ពស់វិទ្យាសាស្ត្រអប់រំ (M.Ed. in Higher Education)',
      1,
      true
    ) RETURNING id INTO v_member_id;
  ELSE
    UPDATE public.team_members SET
      slug = 'tholthoeun-chanraeksmey',
      name_km = 'លោកស្រី ថុលធឿន ចាន់រស្មី',
      name_en = 'Mrs. THOLTHOEUN CHANRAEKSMEY',
      position_km = 'ប្រធានដេប៉ាតឺម៉ង់',
      position_en = 'Head of Department',
      section_id = coalesce(section_id, v_sec_general_id),
      education = 'បរិ. ជាន់ខ្ពស់វិទ្យាសាស្ត្រអប់រំ (M.Ed. in Higher Education)',
      display_order = 1,
      is_published = true
    WHERE id = v_member_id;
  END IF;

  INSERT INTO public.committee_members (
    team_member_id, committee_section_id, role_km, role_en,
    responsibility_km, responsibility_en, display_order, is_published
  ) VALUES (
    v_member_id, v_comm_lead_id, 'ប្រធាន', 'Chair',
    'ដឹកនាំរួម និងគ្រប់គ្រងគោលនយោបាយបណ្ណាល័យ', 'Overall leadership and library policy oversight',
    1, true
  ) ON CONFLICT (team_member_id) DO UPDATE SET
    committee_section_id = EXCLUDED.committee_section_id,
    role_km = EXCLUDED.role_km,
    role_en = EXCLUDED.role_en,
    responsibility_km = EXCLUDED.responsibility_km,
    responsibility_en = EXCLUDED.responsibility_en,
    display_order = EXCLUDED.display_order,
    is_published = EXCLUDED.is_published;

  -- --------------------------------------------------------------------------
  -- 2. Dr. LEK CHUMNOR (Deputy Head / Vice Chair)
  -- --------------------------------------------------------------------------
  SELECT id INTO v_member_id FROM public.team_members
   WHERE slug = 'lek-chumnor'
      OR name_en ILIKE '%LEK CHUMNOR%'
      OR name_km ILIKE '%ឡឹក ជំនោរ%'
   LIMIT 1;

  IF v_member_id IS NULL THEN
    INSERT INTO public.team_members (
      slug, name_km, name_en, position_km, position_en, section_id,
      education, display_order, is_published
    ) VALUES (
      'lek-chumnor',
      'បណ្ឌិត ឡឹក ជំនោរ',
      'Dr. LEK CHUMNOR',
      'អនុប្រធានដេប៉ាតឺម៉ង់',
      'Deputy Head of Department',
      v_sec_general_id,
      'បណ្ឌិត គ្រប់គ្រងអប់រំ (D.Ed. in Educational Administration)',
      2,
      true
    ) RETURNING id INTO v_member_id;
  ELSE
    UPDATE public.team_members SET
      slug = 'lek-chumnor',
      name_km = 'បណ្ឌិត ឡឹក ជំនោរ',
      name_en = 'Dr. LEK CHUMNOR',
      position_km = 'អនុប្រធានដេប៉ាតឺម៉ង់',
      position_en = 'Deputy Head of Department',
      section_id = coalesce(section_id, v_sec_general_id),
      education = 'បណ្ឌិត គ្រប់គ្រងអប់រំ (D.Ed. in Educational Administration)',
      display_order = 2,
      is_published = true
    WHERE id = v_member_id;
  END IF;

  INSERT INTO public.committee_members (
    team_member_id, committee_section_id, role_km, role_en,
    responsibility_km, responsibility_en, display_order, is_published
  ) VALUES (
    v_member_id, v_comm_lead_id, 'អនុប្រធាន', 'Vice Chair',
    'ជួយដឹកនាំការងារគ្រប់គ្រងទូទៅ និងការស្រាវជ្រាវ', 'Executive management and educational research supervision',
    2, true
  ) ON CONFLICT (team_member_id) DO UPDATE SET
    committee_section_id = EXCLUDED.committee_section_id,
    role_km = EXCLUDED.role_km,
    role_en = EXCLUDED.role_en,
    responsibility_km = EXCLUDED.responsibility_km,
    responsibility_en = EXCLUDED.responsibility_en,
    display_order = EXCLUDED.display_order,
    is_published = EXCLUDED.is_published;

  -- --------------------------------------------------------------------------
  -- 3. Mr. VONG SAVOEUN (Lecturer)
  -- --------------------------------------------------------------------------
  SELECT id INTO v_member_id FROM public.team_members
   WHERE slug = 'vong-savoeun'
      OR name_en ILIKE '%VONG SAVOEUN%'
      OR name_km ILIKE '%វង្ស សាវឿន%'
   LIMIT 1;

  IF v_member_id IS NULL THEN
    INSERT INTO public.team_members (
      slug, name_km, name_en, position_km, position_en, section_id,
      education, display_order, is_published
    ) VALUES (
      'vong-savoeun',
      'លោក វង្ស សាវឿន',
      'Mr. VONG SAVOEUN',
      'គ្រូឧទ្ទេស',
      'Lecturer',
      v_sec_research_id,
      'បរិ. ខ្ពស់ វិទ្យាសាស្ត្រអប់រំ (MA. in Educational Science)',
      3,
      true
    ) RETURNING id INTO v_member_id;
  ELSE
    UPDATE public.team_members SET
      slug = 'vong-savoeun',
      name_km = 'លោក វង្ស សាវឿន',
      name_en = 'Mr. VONG SAVOEUN',
      position_km = 'គ្រូឧទ្ទេស',
      position_en = 'Lecturer',
      section_id = coalesce(section_id, v_sec_research_id),
      education = 'បរិ. ខ្ពស់ វិទ្យាសាស្ត្រអប់រំ (MA. in Educational Science)',
      display_order = 3,
      is_published = true
    WHERE id = v_member_id;
  END IF;

  INSERT INTO public.committee_members (
    team_member_id, committee_section_id, role_km, role_en,
    responsibility_km, responsibility_en, display_order, is_published
  ) VALUES (
    v_member_id, v_comm_lecturers_id, 'សមាជិក', 'Member / Lecturer',
    'គាំទ្រការស្រាវជ្រាវវិទ្យាសាស្ត្រអប់រំ', 'Educational science research and curriculum resources',
    1, true
  ) ON CONFLICT (team_member_id) DO UPDATE SET
    committee_section_id = EXCLUDED.committee_section_id,
    role_km = EXCLUDED.role_km,
    role_en = EXCLUDED.role_en,
    responsibility_km = EXCLUDED.responsibility_km,
    responsibility_en = EXCLUDED.responsibility_en,
    display_order = EXCLUDED.display_order,
    is_published = EXCLUDED.is_published;

  -- --------------------------------------------------------------------------
  -- 4. Mr. LENG SOCHEAT (Lecturer)
  -- --------------------------------------------------------------------------
  SELECT id INTO v_member_id FROM public.team_members
   WHERE slug = 'leng-socheat'
      OR name_en ILIKE '%LENG SOCHEAT%'
      OR name_km ILIKE '%ឡេង សុជាតិ%'
   LIMIT 1;

  IF v_member_id IS NULL THEN
    INSERT INTO public.team_members (
      slug, name_km, name_en, position_km, position_en, section_id,
      education, display_order, is_published
    ) VALUES (
      'leng-socheat',
      'លោក ឡេង សុជាតិ',
      'Mr. LENG SOCHEAT',
      'គ្រូឧទ្ទេស',
      'Lecturer',
      v_sec_research_id,
      'បរិ. ខ្ពស់ គ្រប់គ្រងអប់រំ (MA. in Educational Management)',
      4,
      true
    ) RETURNING id INTO v_member_id;
  ELSE
    UPDATE public.team_members SET
      slug = 'leng-socheat',
      name_km = 'លោក ឡេង សុជាតិ',
      name_en = 'Mr. LENG SOCHEAT',
      position_km = 'គ្រូឧទ្ទេស',
      position_en = 'Lecturer',
      section_id = coalesce(section_id, v_sec_research_id),
      education = 'បរិ. ខ្ពស់ គ្រប់គ្រងអប់រំ (MA. in Educational Management)',
      display_order = 4,
      is_published = true
    WHERE id = v_member_id;
  END IF;

  INSERT INTO public.committee_members (
    team_member_id, committee_section_id, role_km, role_en,
    responsibility_km, responsibility_en, display_order, is_published
  ) VALUES (
    v_member_id, v_comm_lecturers_id, 'សមាជិក', 'Member / Lecturer',
    'គាំទ្រការស្រាវជ្រាវគ្រប់គ្រងអប់រំ', 'Educational management and administrative research',
    2, true
  ) ON CONFLICT (team_member_id) DO UPDATE SET
    committee_section_id = EXCLUDED.committee_section_id,
    role_km = EXCLUDED.role_km,
    role_en = EXCLUDED.role_en,
    responsibility_km = EXCLUDED.responsibility_km,
    responsibility_en = EXCLUDED.responsibility_en,
    display_order = EXCLUDED.display_order,
    is_published = EXCLUDED.is_published;

  -- --------------------------------------------------------------------------
  -- 5. Mr. SET SEKKHAPIRATH (Lecturer)
  -- --------------------------------------------------------------------------
  SELECT id INTO v_member_id FROM public.team_members
   WHERE slug = 'set-sekkhapirath'
      OR name_en ILIKE '%SEKKHAPIRATH%'
      OR name_km ILIKE '%សិក្ខាភិរ័ត្ន%'
   LIMIT 1;

  IF v_member_id IS NULL THEN
    INSERT INTO public.team_members (
      slug, name_km, name_en, position_km, position_en, section_id,
      education, display_order, is_published
    ) VALUES (
      'set-sekkhapirath',
      'លោក សិត សិក្ខាភិរ័ត្ន',
      'Mr. SET SEKKHAPIRATH',
      'គ្រូឧទ្ទេស',
      'Lecturer',
      v_sec_research_id,
      'បរិ. ខ្ពស់ វិធីសាស្ត្របង្រៀនភាសាអង់គ្លេស (MA. in Teaching English)',
      5,
      true
    ) RETURNING id INTO v_member_id;
  ELSE
    UPDATE public.team_members SET
      slug = 'set-sekkhapirath',
      name_km = 'លោក សិត សិក្ខាភិរ័ត្ន',
      name_en = 'Mr. SET SEKKHAPIRATH',
      position_km = 'គ្រូឧទ្ទេស',
      position_en = 'Lecturer',
      section_id = coalesce(section_id, v_sec_research_id),
      education = 'បរិ. ខ្ពស់ វិធីសាស្ត្របង្រៀនភាសាអង់គ្លេស (MA. in Teaching English)',
      display_order = 5,
      is_published = true
    WHERE id = v_member_id;
  END IF;

  INSERT INTO public.committee_members (
    team_member_id, committee_section_id, role_km, role_en,
    responsibility_km, responsibility_en, display_order, is_published
  ) VALUES (
    v_member_id, v_comm_lecturers_id, 'សមាជិក', 'Member / Lecturer',
    'គាំទ្រការបង្រៀន និងធនធានភាសាអង់គ្លេស', 'English teaching pedagogy and language learning resources',
    3, true
  ) ON CONFLICT (team_member_id) DO UPDATE SET
    committee_section_id = EXCLUDED.committee_section_id,
    role_km = EXCLUDED.role_km,
    role_en = EXCLUDED.role_en,
    responsibility_km = EXCLUDED.responsibility_km,
    responsibility_en = EXCLUDED.responsibility_en,
    display_order = EXCLUDED.display_order,
    is_published = EXCLUDED.is_published;

  -- --------------------------------------------------------------------------
  -- 6. Dr. NHOR SANHUI (Lecturer)
  -- --------------------------------------------------------------------------
  SELECT id INTO v_member_id FROM public.team_members
   WHERE slug = 'nhor-sanhui'
      OR name_en ILIKE '%NHOR SANHUI%'
      OR name_km ILIKE '%ញ៉ សាញ់ហ៊ុយ%'
   LIMIT 1;

  IF v_member_id IS NULL THEN
    INSERT INTO public.team_members (
      slug, name_km, name_en, position_km, position_en, section_id,
      education, display_order, is_published
    ) VALUES (
      'nhor-sanhui',
      'បណ្ឌិត ញ៉ សាញ់ហ៊ុយ',
      'Dr. NHOR SANHUI',
      'គ្រូឧទ្ទេស',
      'Lecturer',
      v_sec_research_id,
      'បណ្ឌិត អប់រំ (D.Ed. in Education)',
      6,
      true
    ) RETURNING id INTO v_member_id;
  ELSE
    UPDATE public.team_members SET
      slug = 'nhor-sanhui',
      name_km = 'បណ្ឌិត ញ៉ សាញ់ហ៊ុយ',
      name_en = 'Dr. NHOR SANHUI',
      position_km = 'គ្រូឧទ្ទេស',
      position_en = 'Lecturer',
      section_id = coalesce(section_id, v_sec_research_id),
      education = 'បណ្ឌិត អប់រំ (D.Ed. in Education)',
      display_order = 6,
      is_published = true
    WHERE id = v_member_id;
  END IF;

  INSERT INTO public.committee_members (
    team_member_id, committee_section_id, role_km, role_en,
    responsibility_km, responsibility_en, display_order, is_published
  ) VALUES (
    v_member_id, v_comm_lecturers_id, 'សមាជិក', 'Member / Lecturer',
    'គាំទ្រការស្រាវជ្រាវ និងការអប់រំ', 'Pedagogical research and educational innovation',
    4, true
  ) ON CONFLICT (team_member_id) DO UPDATE SET
    committee_section_id = EXCLUDED.committee_section_id,
    role_km = EXCLUDED.role_km,
    role_en = EXCLUDED.role_en,
    responsibility_km = EXCLUDED.responsibility_km,
    responsibility_en = EXCLUDED.responsibility_en,
    display_order = EXCLUDED.display_order,
    is_published = EXCLUDED.is_published;

  -- --------------------------------------------------------------------------
  -- 7. Mr. SOK THOEURN (Lecturer)
  -- --------------------------------------------------------------------------
  SELECT id INTO v_member_id FROM public.team_members
   WHERE slug = 'sok-thoeurn'
      OR name_en ILIKE '%SOK THOEURN%'
      OR name_km ILIKE '%សុខ ធឿន%'
   LIMIT 1;

  IF v_member_id IS NULL THEN
    INSERT INTO public.team_members (
      slug, name_km, name_en, position_km, position_en, section_id,
      education, display_order, is_published
    ) VALUES (
      'sok-thoeurn',
      'លោក សុខ ធឿន',
      'Mr. SOK THOEURN',
      'គ្រូឧទ្ទេស',
      'Lecturer',
      v_sec_research_id,
      'បរិ. ខ្ពស់ ប្រឹក្សាគរុកោសល្យ (M.Ed in Mentoring)',
      7,
      true
    ) RETURNING id INTO v_member_id;
  ELSE
    UPDATE public.team_members SET
      slug = 'sok-thoeurn',
      name_km = 'លោក សុខ ធឿន',
      name_en = 'Mr. SOK THOEURN',
      position_km = 'គ្រូឧទ្ទេស',
      position_en = 'Lecturer',
      section_id = coalesce(section_id, v_sec_research_id),
      education = 'បរិ. ខ្ពស់ ប្រឹក្សាគរុកោសល្យ (M.Ed in Mentoring)',
      display_order = 7,
      is_published = true
    WHERE id = v_member_id;
  END IF;

  INSERT INTO public.committee_members (
    team_member_id, committee_section_id, role_km, role_en,
    responsibility_km, responsibility_en, display_order, is_published
  ) VALUES (
    v_member_id, v_comm_lecturers_id, 'សមាជិក', 'Member / Lecturer',
    'ការប្រឹក្សាគរុកោសល្យ និងធនធានបង្រៀន', 'Teacher mentoring and pedagogical advising',
    5, true
  ) ON CONFLICT (team_member_id) DO UPDATE SET
    committee_section_id = EXCLUDED.committee_section_id,
    role_km = EXCLUDED.role_km,
    role_en = EXCLUDED.role_en,
    responsibility_km = EXCLUDED.responsibility_km,
    responsibility_en = EXCLUDED.responsibility_en,
    display_order = EXCLUDED.display_order,
    is_published = EXCLUDED.is_published;

  -- --------------------------------------------------------------------------
  -- 8. Mrs. PHENG AMPOR (Librarian)
  -- --------------------------------------------------------------------------
  SELECT id INTO v_member_id FROM public.team_members
   WHERE slug = 'pheng-ampor'
      OR name_en ILIKE '%PHENG AMPOR%'
      OR name_km ILIKE '%ផេង អំពរ%'
      OR name_km ILIKE '%ផេង អាំពរ%'
   LIMIT 1;

  IF v_member_id IS NULL THEN
    INSERT INTO public.team_members (
      slug, name_km, name_en, position_km, position_en, section_id,
      education, display_order, is_published
    ) VALUES (
      'pheng-ampor',
      'លោកស្រី ផេង អំពរ',
      'Mrs. PHENG AMPOR',
      'បណ្ណារក្ស',
      'Librarian',
      v_sec_catalog_id,
      'មធ្យមសិក្សាទុតិយភូមិ (Lower Secondary Education)',
      8,
      true
    ) RETURNING id INTO v_member_id;
  ELSE
    UPDATE public.team_members SET
      slug = 'pheng-ampor',
      name_km = 'លោកស្រី ផេង អំពរ',
      name_en = 'Mrs. PHENG AMPOR',
      position_km = 'បណ្ណារក្ស',
      position_en = 'Librarian',
      section_id = coalesce(section_id, v_sec_catalog_id),
      education = 'មធ្យមសិក្សាទុតិយភូមិ (Lower Secondary Education)',
      display_order = 8,
      is_published = true
    WHERE id = v_member_id;
  END IF;

  INSERT INTO public.committee_members (
    team_member_id, committee_section_id, role_km, role_en,
    responsibility_km, responsibility_en, display_order, is_published
  ) VALUES (
    v_member_id, v_comm_librarians_id, 'បណ្ណារក្ស', 'Librarian',
    'ការរៀបចំឯកសារ និងសេវាបណ្ណាល័យ', 'Document management and library desk services',
    1, true
  ) ON CONFLICT (team_member_id) DO UPDATE SET
    committee_section_id = EXCLUDED.committee_section_id,
    role_km = EXCLUDED.role_km,
    role_en = EXCLUDED.role_en,
    responsibility_km = EXCLUDED.responsibility_km,
    responsibility_en = EXCLUDED.responsibility_en,
    display_order = EXCLUDED.display_order,
    is_published = EXCLUDED.is_published;

  -- --------------------------------------------------------------------------
  -- 9. Mrs. LAM SOKLANG (Librarian)
  -- --------------------------------------------------------------------------
  SELECT id INTO v_member_id FROM public.team_members
   WHERE slug = 'lam-soklang'
      OR name_en ILIKE '%LAM SOKLANG%'
      OR name_km ILIKE '%ឡាំ សុខឡាង%'
   LIMIT 1;

  IF v_member_id IS NULL THEN
    INSERT INTO public.team_members (
      slug, name_km, name_en, position_km, position_en, section_id,
      education, display_order, is_published
    ) VALUES (
      'lam-soklang',
      'លោកស្រី ឡាំ សុខឡាង',
      'Mrs. LAM SOKLANG',
      'បណ្ណារក្ស',
      'Librarian',
      v_sec_reader_id,
      'បរិ. ចិត្តវិទ្យា (BA. in Psychology)',
      9,
      true
    ) RETURNING id INTO v_member_id;
  ELSE
    UPDATE public.team_members SET
      slug = 'lam-soklang',
      name_km = 'លោកស្រី ឡាំ សុខឡាង',
      name_en = 'Mrs. LAM SOKLANG',
      position_km = 'បណ្ណារក្ស',
      position_en = 'Librarian',
      section_id = coalesce(section_id, v_sec_reader_id),
      education = 'បរិ. ចិត្តវិទ្យា (BA. in Psychology)',
      display_order = 9,
      is_published = true
    WHERE id = v_member_id;
  END IF;

  INSERT INTO public.committee_members (
    team_member_id, committee_section_id, role_km, role_en,
    responsibility_km, responsibility_en, display_order, is_published
  ) VALUES (
    v_member_id, v_comm_librarians_id, 'បណ្ណារក្ស', 'Librarian',
    'សេវាកម្មអ្នកអាន និងបន្ទប់អាន', 'Reader services, circulation and reading room operations',
    2, true
  ) ON CONFLICT (team_member_id) DO UPDATE SET
    committee_section_id = EXCLUDED.committee_section_id,
    role_km = EXCLUDED.role_km,
    role_en = EXCLUDED.role_en,
    responsibility_km = EXCLUDED.responsibility_km,
    responsibility_en = EXCLUDED.responsibility_en,
    display_order = EXCLUDED.display_order,
    is_published = EXCLUDED.is_published;

  -- --------------------------------------------------------------------------
  -- 10. Mrs. SEK SOMSOKNEANG (Librarian)
  -- --------------------------------------------------------------------------
  SELECT id INTO v_member_id FROM public.team_members
   WHERE slug = 'sek-somsokneang'
      OR name_en ILIKE '%SOMSOKNEANG%'
      OR name_km ILIKE '%សំសុខនាង%'
   LIMIT 1;

  IF v_member_id IS NULL THEN
    INSERT INTO public.team_members (
      slug, name_km, name_en, position_km, position_en, section_id,
      education, display_order, is_published
    ) VALUES (
      'sek-somsokneang',
      'លោកស្រី សេក សំសុខនាង',
      'Mrs. SEK SOMSOKNEANG',
      'បណ្ណារក្ស',
      'Librarian',
      v_sec_catalog_id,
      'បរិ. ភូមិវិទ្យា (BA. in Geography)',
      10,
      true
    ) RETURNING id INTO v_member_id;
  ELSE
    UPDATE public.team_members SET
      slug = 'sek-somsokneang',
      name_km = 'លោកស្រី សេក សំសុខនាង',
      name_en = 'Mrs. SEK SOMSOKNEANG',
      position_km = 'បណ្ណារក្ស',
      position_en = 'Librarian',
      section_id = coalesce(section_id, v_sec_catalog_id),
      education = 'បរិ. ភូមិវិទ្យា (BA. in Geography)',
      display_order = 10,
      is_published = true
    WHERE id = v_member_id;
  END IF;

  INSERT INTO public.committee_members (
    team_member_id, committee_section_id, role_km, role_en,
    responsibility_km, responsibility_en, display_order, is_published
  ) VALUES (
    v_member_id, v_comm_librarians_id, 'បណ្ណារក្ស', 'Librarian',
    'ចំណាត់ថ្នាក់ឯកសារ និងបញ្ជីសារពើភណ្ឌ', 'Cataloging, classification and inventory control',
    3, true
  ) ON CONFLICT (team_member_id) DO UPDATE SET
    committee_section_id = EXCLUDED.committee_section_id,
    role_km = EXCLUDED.role_km,
    role_en = EXCLUDED.role_en,
    responsibility_km = EXCLUDED.responsibility_km,
    responsibility_en = EXCLUDED.responsibility_en,
    display_order = EXCLUDED.display_order,
    is_published = EXCLUDED.is_published;

  -- --------------------------------------------------------------------------
  -- 11. Mrs. NOUM VIRADETTE (Librarian)
  -- --------------------------------------------------------------------------
  SELECT id INTO v_member_id FROM public.team_members
   WHERE slug = 'noum-viradette'
      OR name_en ILIKE '%VIRADETTE%'
      OR name_km ILIKE '%វីរ៉ាដេត%'
   LIMIT 1;

  IF v_member_id IS NULL THEN
    INSERT INTO public.team_members (
      slug, name_km, name_en, position_km, position_en, section_id,
      education, display_order, is_published
    ) VALUES (
      'noum-viradette',
      'លោកស្រី ឌុម វីរ៉ាដេត',
      'Mrs. NOUM VIRADETTE',
      'បណ្ណារក្ស',
      'Librarian',
      v_sec_reader_id,
      'បរិ. ភាសាបារាំង (BA. in French Language)',
      11,
      true
    ) RETURNING id INTO v_member_id;
  ELSE
    UPDATE public.team_members SET
      slug = 'noum-viradette',
      name_km = 'លោកស្រី ឌុម វីរ៉ាដេត',
      name_en = 'Mrs. NOUM VIRADETTE',
      position_km = 'បណ្ណារក្ស',
      position_en = 'Librarian',
      section_id = coalesce(section_id, v_sec_reader_id),
      education = 'បរិ. ភាសាបារាំង (BA. in French Language)',
      display_order = 11,
      is_published = true
    WHERE id = v_member_id;
  END IF;

  INSERT INTO public.committee_members (
    team_member_id, committee_section_id, role_km, role_en,
    responsibility_km, responsibility_en, display_order, is_published
  ) VALUES (
    v_member_id, v_comm_librarians_id, 'បណ្ណារក្ស', 'Librarian',
    'សេវាកម្មអ្នកអាន និងធនធានភាសាបារាំង', 'Patron assistance and French collection maintenance',
    4, true
  ) ON CONFLICT (team_member_id) DO UPDATE SET
    committee_section_id = EXCLUDED.committee_section_id,
    role_km = EXCLUDED.role_km,
    role_en = EXCLUDED.role_en,
    responsibility_km = EXCLUDED.responsibility_km,
    responsibility_en = EXCLUDED.responsibility_en,
    display_order = EXCLUDED.display_order,
    is_published = EXCLUDED.is_published;

  -- --------------------------------------------------------------------------
  -- 12. Mr. MOM CHANNA (Librarian)
  -- --------------------------------------------------------------------------
  SELECT id INTO v_member_id FROM public.team_members
   WHERE slug = 'mom-channa'
      OR name_en ILIKE '%MOM CHANNA%'
      OR name_km ILIKE '%មុំ ចាន់ណា%'
   LIMIT 1;

  IF v_member_id IS NULL THEN
    INSERT INTO public.team_members (
      slug, name_km, name_en, position_km, position_en, section_id,
      education, display_order, is_published
    ) VALUES (
      'mom-channa',
      'លោក មុំ ចាន់ណា',
      'Mr. MOM CHANNA',
      'បណ្ណារក្ស',
      'Librarian',
      v_sec_catalog_id,
      'បរិ. គណិតវិទ្យា (BS. in Mathematics)',
      12,
      true
    ) RETURNING id INTO v_member_id;
  ELSE
    UPDATE public.team_members SET
      slug = 'mom-channa',
      name_km = 'លោក មុំ ចាន់ណា',
      name_en = 'Mr. MOM CHANNA',
      position_km = 'បណ្ណារក្ស',
      position_en = 'Librarian',
      section_id = coalesce(section_id, v_sec_catalog_id),
      education = 'បរិ. គណិតវិទ្យា (BS. in Mathematics)',
      display_order = 12,
      is_published = true
    WHERE id = v_member_id;
  END IF;

  INSERT INTO public.committee_members (
    team_member_id, committee_section_id, role_km, role_en,
    responsibility_km, responsibility_en, display_order, is_published
  ) VALUES (
    v_member_id, v_comm_librarians_id, 'បណ្ណារក្ស', 'Librarian',
    'ចំណាត់ថ្នាក់ DDC និងការគ្រប់គ្រងឯកសារ', 'DDC classification, registration and collection indexing',
    5, true
  ) ON CONFLICT (team_member_id) DO UPDATE SET
    committee_section_id = EXCLUDED.committee_section_id,
    role_km = EXCLUDED.role_km,
    role_en = EXCLUDED.role_en,
    responsibility_km = EXCLUDED.responsibility_km,
    responsibility_en = EXCLUDED.responsibility_en,
    display_order = EXCLUDED.display_order,
    is_published = EXCLUDED.is_published;

END $$;
