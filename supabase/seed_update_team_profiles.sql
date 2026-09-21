-- ══════════════════════════════════════════════════════════════════════════
--  seed_update_team_profiles.sql
--
--  Enriches the 12 existing public.team_members rows of the Department of
--  Educational Research and Library (នាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ)
--  with the profile information published on the college's own site.
--
--  Source of record : https://www.ptec.edu.kh/lecturer/<slug>/  (one URL per
--                     member, cited above each statement).
--  Fetched          : 2026-09-20
--
--  WHAT THIS TOUCHES
--    photo_url, photo_alt, education, short_bio_en/km, bio_en/km,
--    responsibilities_en/km, languages.
--
--  WHAT THIS DELIBERATELY DOES NOT TOUCH
--    name_en, name_km, slug, position_en, position_km, section_id,
--    display_order, is_published, phone, user_id. Those are set by
--    supabase/seed_committee_and_team.sql and by the admin panel; the slug in
--    particular is a public URL (/about/team/<slug>) and the middleware slug
--    gate 404s anything it does not recognise, so it is never rewritten here.
--
--  NOTES
--    * education is a TEXT column (see 0038_library_team.sql), never JSON.
--      Format: Khmer abbreviation, then the English degree in parentheses,
--      multiple degrees separated by ", ".
--    * A member is found BY SLUG. The name is a guarded fallback that only
--      fires when the slug resolves to nobody -- production holds a
--      'Mr. VONG SAVOEUN (copy)' row, and a bare ILIKE on the name enriched
--      it too. A name is not an identifier here.
--    * Two members are spelled differently in this database and on the
--      college site, so both spellings are matched:
--        - slug 'nhor-sanhui'     (site: NHOR Sanhei)
--        - slug 'sek-somsokneang' (site: SEK Samsokneang)
--    * Photos are the full-resolution WordPress originals advertised by each
--      page's og:image tag — NOT the -768xNNN thumbnails. www.ptec.edu.kh is
--      already allow-listed in next.config.ts images.remotePatterns.
--    * Every statement is an UPDATE. A member missing from this database is
--      NOT created here; run seed_committee_and_team.sql first.
--    * team_members is the WHOLE college directory, not just this department.
--      Production also holds rows added through the admin panel (e.g.
--      'ron-raksmey'), some already carrying ptec.edu.kh photos. So the
--      verification below asserts PER STATEMENT -- each UPDATE touched
--      exactly one row, and the twelve touched twelve different people --
--      rather than counting enriched rows table-wide, which would be a claim
--      about people this script does not manage.
--
--  Idempotent: re-running sets the same values.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Records which row each statement below actually updated. Without it the
-- only observable outcome of an UPDATE is "some number of rows", and a WHERE
-- clause that matched nobody, or matched a second member of the directory,
-- would commit silently.
DROP TABLE IF EXISTS pg_temp.team_profile_touched;
CREATE TEMP TABLE team_profile_touched (
  n    integer not null,
  id   uuid    not null,
  slug text
);

-- ──────────────────────────────────────────────────────────────────────────
-- #1. Mrs. THOLTHOEUN CHANRAEKSMEY — Head of Department
-- https://www.ptec.edu.kh/lecturer/chanraksmey-tholthoeun168/
-- ──────────────────────────────────────────────────────────────────────────
WITH upd AS (
  UPDATE public.team_members SET
    photo_url = 'https://www.ptec.edu.kh/wp-content/uploads/2026/05/THOLTHOEUN-Chanraksmey-1.jpg',
    photo_alt = 'Portrait of Mrs. THOLTHOEUN CHANRAEKSMEY, Head of the Department of Educational Research and Library at PTEC',
    education = 'បរិ.ជាន់ខ្ពស់ អប់រំ (M.Ed. in Education, Northeast Normal University, 2016), បរិ. អប់រំ (B.Ed. in Education, IFL–RUPP, 2012), កំពុងសិក្សាថ្នាក់បណ្ឌិត អប់រំ (PhD Candidate in Education, University of Auckland)',
    short_bio_en = 'Head of the Department of Educational Research and Library at PTEC and a PhD candidate in Education at the University of Auckland, New Zealand, under the Manaaki New Zealand Scholarship. She teaches Educational Research and supervises student-teacher research.',
    short_bio_km = 'ប្រធាននាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ នៃវិទ្យាស្ថានគរុកោសល្យភ្នំពេញ និងជានិស្សិតថ្នាក់បណ្ឌិតផ្នែកអប់រំ នៅសាកលវិទ្យាល័យអូកឡែន ប្រទេសនូវែលហ្សេឡង់ ក្រោមអាហារូបករណ៍ Manaaki New Zealand។ លោកស្រីបង្រៀនមុខវិជ្ជាស្រាវជ្រាវអប់រំ និងណែនាំការស្រាវជ្រាវរបស់និស្សិតគ្រូ។',
    bio_en = 'Assistant Professor CHANRAKSMEY THOLTHOEUN is Head of the Department of Educational Research and Library (DERL). Currently, she is a PhD candidate in Education at the University of Auckland (UoA), New Zealand, under the Manaaki New Zealand Scholarship (MNZS).

Prior to commencing her doctoral studies, she earned a Bachelor''s degree in Education from the Institute of Foreign Languages (IFL) at the Royal University of Phnom Penh (RUPP) in 2012, followed by a Specialist Certificate in Translation and Interpreting from IFL in 2013. She obtained her Master''s degree in Education from Northeast Normal University (NENU), China, in 2016 under the Chinese Government Scholarship (CSC) programme. In 2018, she earned a Specialist Certificate in Teaching English as an International Language from the Regional Language Centre (RELC), Singapore. In 2019, she received the Fulbright Scholarship award to participate in the Teaching Excellence and Achievement Programme at the University of Arkansas, USA. In 2022, she completed the Knowledge Co-Creation Programme on the Project for Establishing Foundations for Teacher Education Colleges (E-TEC) at Nara University of Education in Japan. In 2023, she completed a professional programme on Leading Schools in the Post-Pandemic Era at the National Institute of Education (NIE), Nanyang Technological University (NTU), Singapore.

Professionally, she has been working at Phnom Penh Teacher Education College (PTEC) since 2018. As Head of Department, her work involves strategic planning for the development of the department, promoting and supporting educational research, managing library resources and services, and providing access to academic materials that enhance teaching, learning, and professional development for student teachers, teacher educators, and researchers. She has been involved in a number of research projects, taught Educational Research (ER) to third-year student teachers, and supervised the research of fourth-year student teachers within a joint Collaborative Online International Learning (COIL) research project between PTEC, Cambodia, and Karel de Grote University (KdG), Belgium. She has also served on the editorial boards of the Cambodian Education Forum and the Cambodian Journal of Educational Research.

Her professional and research interests centre on teacher education, educational reform, and teacher development, with a particular focus on teacher professional learning, teaching practices, teacher professional development, and teacher-related policy analysis.',
    bio_km = 'លោកស្រី ថុលធឿន ចាន់រស្មី គឺជាប្រធាននាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ (DERL)។ បច្ចុប្បន្ន លោកស្រីកំពុងសិក្សាថ្នាក់បណ្ឌិតផ្នែកអប់រំ នៅសាកលវិទ្យាល័យអូកឡែន (UoA) ប្រទេសនូវែលហ្សេឡង់ ក្រោមអាហារូបករណ៍ Manaaki New Zealand (MNZS)។

មុនពេលចាប់ផ្ដើមការសិក្សាថ្នាក់បណ្ឌិត លោកស្រីបានបញ្ចប់បរិញ្ញាបត្រផ្នែកអប់រំ ពីវិទ្យាស្ថានភាសាបរទេស (IFL) នៃសាកលវិទ្យាល័យភូមិន្ទភ្នំពេញ (RUPP) ក្នុងឆ្នាំ២០១២ បន្ទាប់មកទទួលបានវិញ្ញាបនបត្រឯកទេសផ្នែកបកប្រែសរសេរ និងបកប្រែផ្ទាល់មាត់ ពី IFL ក្នុងឆ្នាំ២០១៣។ លោកស្រីបានបញ្ចប់បរិញ្ញាបត្រជាន់ខ្ពស់ផ្នែកអប់រំ ពីសាកលវិទ្យាល័យ Northeast Normal (NENU) ប្រទេសចិន ក្នុងឆ្នាំ២០១៦ ក្រោមកម្មវិធីអាហារូបករណ៍រដ្ឋាភិបាលចិន (CSC)។ ក្នុងឆ្នាំ២០១៨ លោកស្រីទទួលបានវិញ្ញាបនបត្រឯកទេសផ្នែកបង្រៀនភាសាអង់គ្លេសជាភាសាអន្តរជាតិ ពីមជ្ឈមណ្ឌលភាសាថ្នាក់តំបន់ (RELC) ប្រទេសសិង្ហបុរី។ ក្នុងឆ្នាំ២០១៩ លោកស្រីទទួលបានអាហារូបករណ៍ Fulbright ដើម្បីចូលរួមកម្មវិធី Teaching Excellence and Achievement នៅសាកលវិទ្យាល័យ Arkansas សហរដ្ឋអាមេរិក។ ក្នុងឆ្នាំ២០២២ លោកស្រីបានបញ្ចប់កម្មវិធី Knowledge Co-Creation ស្ដីពីគម្រោងកសាងមូលដ្ឋានគ្រឹះសម្រាប់វិទ្យាស្ថានគរុកោសល្យ (E-TEC) នៅសាកលវិទ្យាល័យគរុកោសល្យ Nara ប្រទេសជប៉ុន។ ហើយក្នុងឆ្នាំ២០២៣ លោកស្រីបានបញ្ចប់កម្មវិធីវិជ្ជាជីវៈស្ដីពីការដឹកនាំសាលារៀនក្នុងយុគក្រោយជំងឺរាតត្បាត នៅវិទ្យាស្ថានជាតិអប់រំ (NIE) សាកលវិទ្យាល័យបច្ចេកវិទ្យា Nanyang (NTU) ប្រទេសសិង្ហបុរី។

ក្នុងវិស័យវិជ្ជាជីវៈ លោកស្រីបានបម្រើការនៅវិទ្យាស្ថានគរុកោសល្យភ្នំពេញ (PTEC) តាំងពីឆ្នាំ២០១៨មក។ ក្នុងនាមជាប្រធាននាយកដ្ឋាន ការងាររបស់លោកស្រីរួមមាន ការរៀបចំផែនការយុទ្ធសាស្ត្រអភិវឌ្ឍន៍នាយកដ្ឋាន ការលើកកម្ពស់ និងគាំទ្រការស្រាវជ្រាវអប់រំ ការគ្រប់គ្រងធនធាន និងសេវាកម្មបណ្ណាល័យ ព្រមទាំងការផ្ដល់លទ្ធភាពទទួលបានឯកសារសិក្សា ដែលជួយពង្រឹងការបង្រៀន ការរៀន និងការអភិវឌ្ឍវិជ្ជាជីវៈសម្រាប់និស្សិតគ្រូ គ្រូឧទ្ទេស និងអ្នកស្រាវជ្រាវ។ លោកស្រីបានចូលរួមក្នុងគម្រោងស្រាវជ្រាវជាច្រើន បង្រៀនមុខវិជ្ជាស្រាវជ្រាវអប់រំ (ER) ដល់និស្សិតគ្រូឆ្នាំទី៣ និងណែនាំការស្រាវជ្រាវរបស់និស្សិតគ្រូឆ្នាំទី៤ ក្នុងគម្រោងស្រាវជ្រាវរួម COIL រវាង PTEC ប្រទេសកម្ពុជា និងសាកលវិទ្យាល័យ Karel de Grote (KdG) ប្រទេសបែលហ្ស៊ិក។ លោកស្រីក៏បានបម្រើការក្នុងក្រុមប្រឹក្សាវិចារណកថានៃ Cambodian Education Forum និង Cambodian Journal of Educational Research ផងដែរ។

ចំណាប់អារម្មណ៍វិជ្ជាជីវៈ និងការស្រាវជ្រាវរបស់លោកស្រីផ្ដោតលើការអប់រំគ្រូ កំណែទម្រង់អប់រំ និងការអភិវឌ្ឍគ្រូបង្រៀន ជាពិសេសការរៀនសូត្រវិជ្ជាជីវៈរបស់គ្រូ ការអនុវត្តការបង្រៀន ការអភិវឌ្ឍវិជ្ជាជីវៈគ្រូ និងការវិភាគគោលនយោបាយពាក់ព័ន្ធនឹងគ្រូបង្រៀន។',
    responsibilities_en = ARRAY[
      'Strategic planning for the development of the Department of Educational Research and Library',
      'Promoting and supporting educational research across the college',
      'Managing library resources and services, and access to academic materials'
    ]::text[],
    responsibilities_km = ARRAY[
      'រៀបចំផែនការយុទ្ធសាស្ត្រអភិវឌ្ឍន៍នាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ',
      'លើកកម្ពស់ និងគាំទ្រការស្រាវជ្រាវអប់រំនៅទូទាំងវិទ្យាស្ថាន',
      'គ្រប់គ្រងធនធាន និងសេវាកម្មបណ្ណាល័យ ព្រមទាំងលទ្ធភាពទទួលបានឯកសារសិក្សា'
    ]::text[],
    languages = ARRAY[
      'Khmer',
      'English'
    ]::text[]
  WHERE slug IN ('tholthoeun-chanraeksmey')
     OR (
          (name_en ILIKE '%THOLTHOEUN%')
          AND NOT EXISTS (
                SELECT 1 FROM public.team_members t2
                 WHERE t2.slug IN ('tholthoeun-chanraeksmey')
              )
        )
  RETURNING id, slug
)
INSERT INTO team_profile_touched (n, id, slug)
SELECT 1, id, slug FROM upd;

-- ──────────────────────────────────────────────────────────────────────────
-- #2. Dr. LEK CHUMNOR — Deputy Head of Department
-- https://www.ptec.edu.kh/lecturer/lek-chumnor-d-ed/
-- ──────────────────────────────────────────────────────────────────────────
WITH upd AS (
  UPDATE public.team_members SET
    photo_url = 'https://www.ptec.edu.kh/wp-content/uploads/2026/05/LEK-Chumnor.jpg',
    photo_alt = 'Portrait of Dr. LEK CHUMNOR, Deputy Head of the Department of Educational Research and Library at PTEC',
    education = 'បណ្ឌិត គ្រប់គ្រងអប់រំ (D.Ed. in Educational Administration, Sisaket Rajabhat University, 2020), បរិ.ជាន់ខ្ពស់ កម្មវិធីសិក្សា និងការបង្រៀន (M.Ed. in Curriculum and Instruction, 2013), បរិ. ភាសា និងអក្សរសាស្ត្រឡាវ (BA in Lao Language and Literature, National University of Laos, 2009)',
    short_bio_en = 'Deputy Head of the Department of Educational Research and Library, a member of the National Council for Khmer Language, and Vice-President of the Khmer Writers Association. He is an award-winning author, editor and typographer with more than 100 Khmer book projects to his name.',
    short_bio_km = 'អនុប្រធាននាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ សមាជិកក្រុមប្រឹក្សាជាតិភាសាខ្មែរ និងជាអនុប្រធានសមាគមអ្នកនិពន្ធខ្មែរ។ លោកជាអ្នកនិពន្ធ អ្នកកែសម្រួល និងអ្នកឯកទេសអក្សរសិល្ប៍ ដែលបានបញ្ចប់គម្រោងសៀវភៅខ្មែរជាង១០០គម្រោង។',
    bio_en = 'LEK Chumnor is a Cambodian educator, researcher, writer, typographer, and editor with extensive experience in educational administration, literature, and academic publishing. He currently serves as Deputy Head of the Department of Educational Research and Library at Phnom Penh Teacher Education College (PTEC) and is a member of the National Council for Khmer Language at the Royal Academy of Cambodia.

With a Doctorate in Educational Administration from Sisaket Rajabhat University (SSKRU), Thailand, and a Bachelor of Arts in Lao Language and Literature from the National University of Laos (NUOL), he has contributed to research, teacher training, and curriculum development. He is also an accomplished author, editor, and graphic designer, having completed more than 100 Khmer book projects and numerous research publications.

He is recognised internationally for his literary achievements, including the S.E.A. Write Award and the Mekong River Literature Award. Fluent in Khmer, Thai, Lao, and English, he specialises in translation, educational research, and cross-cultural literary studies.

In addition to his work in the field of education, he has served as Vice-President of the Khmer Writers Association since 2017. In this role, he has actively contributed to training, mentoring, and coordinating literary writing and publication projects for numerous Khmer writers, promoting Khmer literature and supporting new generations of Cambodian authors in publishing and showcasing their works both nationally and internationally.',
    bio_km = 'លោកបណ្ឌិត ឡឹក ជំនោរ គឺជាអ្នកអប់រំ អ្នកស្រាវជ្រាវ អ្នកនិពន្ធ អ្នកឯកទេសអក្សរសិល្ប៍ និងអ្នកកែសម្រួលជនជាតិខ្មែរ ដែលមានបទពិសោធន៍ទូលំទូលាយក្នុងវិស័យរដ្ឋបាលអប់រំ អក្សរសាស្ត្រ និងការបោះពុម្ពផ្សាយស្នាដៃសិក្សា។ បច្ចុប្បន្ន លោកបម្រើការជាអនុប្រធាននាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ នៃវិទ្យាស្ថានគរុកោសល្យភ្នំពេញ (PTEC) និងជាសមាជិកក្រុមប្រឹក្សាជាតិភាសាខ្មែរ នៃរាជបណ្ឌិត្យសភាកម្ពុជា។

ដោយកាន់សញ្ញាបត្រថ្នាក់បណ្ឌិតផ្នែករដ្ឋបាលអប់រំ ពីសាកលវិទ្យាល័យ Sisaket Rajabhat (SSKRU) ប្រទេសថៃ និងបរិញ្ញាបត្រផ្នែកភាសា និងអក្សរសាស្ត្រឡាវ ពីសាកលវិទ្យាល័យជាតិឡាវ (NUOL) លោកបានរួមចំណែកយ៉ាងសកម្មក្នុងការស្រាវជ្រាវ ការបណ្ដុះបណ្ដាលគ្រូ និងការអភិវឌ្ឍកម្មវិធីសិក្សា។ លោកក៏ជាអ្នកនិពន្ធ អ្នកកែសម្រួល និងអ្នករចនាក្រាហ្វិកដ៏ជោគជ័យ ដែលបានបញ្ចប់គម្រោងសៀវភៅខ្មែរជាង១០០គម្រោង និងស្នាដៃស្រាវជ្រាវជាច្រើន។

លោកត្រូវបានទទួលស្គាល់ក្នុងកម្រិតអន្តរជាតិ តាមរយៈស្នាដៃអក្សរសិល្ប៍ រួមមានពានរង្វាន់ S.E.A. Write និងពានរង្វាន់អក្សរសិល្ប៍ទន្លេមេគង្គ។ លោកស្ទាត់ជំនាញភាសាខ្មែរ ថៃ ឡាវ និងអង់គ្លេស ហើយមានឯកទេសផ្នែកបកប្រែ ការស្រាវជ្រាវអប់រំ និងការសិក្សាអក្សរសិល្ប៍ឆ្លងវប្បធម៌។

ក្រៅពីការងារក្នុងវិស័យអប់រំ លោកបានបម្រើការជាអនុប្រធានសមាគមអ្នកនិពន្ធខ្មែរតាំងពីឆ្នាំ២០១៧មក។ ក្នុងតួនាទីនេះ លោកបានរួមចំណែកយ៉ាងសកម្មក្នុងការបណ្ដុះបណ្ដាល ការណែនាំ និងការសម្របសម្រួលគម្រោងនិពន្ធ និងបោះពុម្ពផ្សាយអក្សរសិល្ប៍ ដល់អ្នកនិពន្ធខ្មែរជាច្រើនរូប ដោយលើកកម្ពស់អក្សរសិល្ប៍ខ្មែរ និងគាំទ្រអ្នកនិពន្ធជំនាន់ក្រោយ ឱ្យអាចបោះពុម្ព និងផ្សព្វផ្សាយស្នាដៃរបស់ខ្លួនទាំងក្នុង និងក្រៅប្រទេស។',
    responsibilities_en = ARRAY[
      'Deputy leadership of the Department of Educational Research and Library',
      'Supervising educational research, teacher training and curriculum development',
      'Editorial and academic publishing work for the department'
    ]::text[],
    responsibilities_km = ARRAY[
      'ជួយដឹកនាំនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ',
      'ត្រួតពិនិត្យការស្រាវជ្រាវអប់រំ ការបណ្ដុះបណ្ដាលគ្រូ និងការអភិវឌ្ឍកម្មវិធីសិក្សា',
      'ទទួលបន្ទុកការងារកែសម្រួល និងបោះពុម្ពផ្សាយស្នាដៃសិក្សារបស់នាយកដ្ឋាន'
    ]::text[],
    languages = ARRAY[
      'Khmer',
      'English',
      'Thai',
      'Lao'
    ]::text[]
  WHERE slug IN ('lek-chumnor')
     OR (
          (name_en ILIKE '%LEK CHUMNOR%')
          AND NOT EXISTS (
                SELECT 1 FROM public.team_members t2
                 WHERE t2.slug IN ('lek-chumnor')
              )
        )
  RETURNING id, slug
)
INSERT INTO team_profile_touched (n, id, slug)
SELECT 2, id, slug FROM upd;

-- ──────────────────────────────────────────────────────────────────────────
-- #3. Mr. VONG SAVOEUN — Lecturer
-- https://www.ptec.edu.kh/lecturer/vong-savoeun/
-- ──────────────────────────────────────────────────────────────────────────
WITH upd AS (
  UPDATE public.team_members SET
    photo_url = 'https://www.ptec.edu.kh/wp-content/uploads/2026/05/Vong-Savoeun.jpg',
    photo_alt = 'Portrait of Mr. VONG SAVOEUN, Lecturer in the Department of Educational Research and Library at PTEC',
    education = 'បរិ.ជាន់ខ្ពស់ វិទ្យាសាស្ត្រអប់រំ (MA in Educational Science, Cambodian University for Specialties), បរិ. ភាសាអង់គ្លេស និងអក្សរសាស្ត្រ (BA in English and Literature, Cambodian University for Specialties)',
    short_bio_en = 'Teacher educator in the Department of Educational Research and Library, specialising in educational research methodology with a particular focus on Action Research, and supervisor of student-teacher research projects.',
    short_bio_km = 'គ្រូឧទ្ទេសនៃនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ មានឯកទេសផ្នែកវិធីសាស្ត្រស្រាវជ្រាវអប់រំ ជាពិសេសការស្រាវជ្រាវប្រតិបត្តិ និងជាអ្នកណែនាំគម្រោងស្រាវជ្រាវរបស់និស្សិតគ្រូ។',
    bio_en = 'VONG Savoeun has established a distinguished academic foundation through his studies at the Cambodian University for Specialties. He completed a Bachelor of Arts in English and Literature, which gave him linguistic expertise and a deep appreciation for literary analysis, and then advanced his professional qualifications by earning a Master of Educational Science from the same institution. This combination of literary proficiency and advanced pedagogical knowledge positions him as a highly capable professional within the field of education.

In his capacity as a teacher educator within the Department of Educational Research and Library, he plays a pivotal role in shaping the pedagogical competencies of future educators. He specialises in teaching educational research methodology, with a particular focus on Action Research, empowering student teachers to bridge the gap between theoretical frameworks and classroom practice. Beyond his instructional duties, he serves as a dedicated supervisor, leading and mentoring student teachers through the process of conducting their own action research projects. By fostering critical reflection and systematic inquiry, he ensures that his students are equipped with the analytical tools necessary to improve educational outcomes in their future teaching environments.',
    bio_km = 'លោក វង្ស សាវឿន បានកសាងមូលដ្ឋានគ្រឹះសិក្សាដ៏រឹងមាំ តាមរយៈការសិក្សានៅសាកលវិទ្យាល័យឯកទេសកម្ពុជា។ លោកបានបញ្ចប់បរិញ្ញាបត្រផ្នែកភាសាអង់គ្លេស និងអក្សរសាស្ត្រ ដែលផ្ដល់ឱ្យលោកនូវជំនាញភាសា និងការយល់ដឹងស៊ីជម្រៅអំពីការវិភាគអក្សរសិល្ប៍ បន្ទាប់មកលោកបានបន្តបញ្ចប់បរិញ្ញាបត្រជាន់ខ្ពស់ផ្នែកវិទ្យាសាស្ត្រអប់រំ នៅស្ថាប័នដដែល។ ការរួមបញ្ចូលគ្នារវាងជំនាញអក្សរសាស្ត្រ និងចំណេះដឹងគរុកោសល្យកម្រិតខ្ពស់នេះ ធ្វើឱ្យលោកក្លាយជាអ្នកវិជ្ជាជីវៈដ៏មានសមត្ថភាពក្នុងវិស័យអប់រំ។

ក្នុងនាមជាគ្រូឧទ្ទេសនៃនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ លោកដើរតួនាទីយ៉ាងសំខាន់ក្នុងការកសាងសមត្ថភាពគរុកោសល្យរបស់គ្រូនាពេលអនាគត។ លោកមានឯកទេសបង្រៀនវិធីសាស្ត្រស្រាវជ្រាវអប់រំ ជាពិសេសការស្រាវជ្រាវប្រតិបត្តិ ដោយជួយឱ្យនិស្សិតគ្រូអាចភ្ជាប់ទ្រឹស្ដីទៅនឹងការអនុវត្តក្នុងថ្នាក់រៀន។ ក្រៅពីភារកិច្ចបង្រៀន លោកក៏ជាអ្នកណែនាំដ៏ឧស្សាហ៍ ដែលដឹកនាំនិស្សិតគ្រូតាមដំណើរការអនុវត្តគម្រោងស្រាវជ្រាវប្រតិបត្តិផ្ទាល់ខ្លួន។ តាមរយៈការជំរុញការឆ្លុះបញ្ចាំងបែបរិះគន់ និងការស្រាវជ្រាវជាប្រព័ន្ធ លោកធានាថានិស្សិតមានឧបករណ៍វិភាគចាំបាច់ ដើម្បីលើកកម្ពស់លទ្ធផលអប់រំនៅក្នុងបរិយាកាសបង្រៀនរបស់ពួកគេនាពេលអនាគត។',
    responsibilities_en = ARRAY[
      'Teaching educational research methodology, with a focus on Action Research',
      'Supervising and mentoring student teachers through their action research projects',
      'Fostering critical reflection and systematic inquiry among future educators'
    ]::text[],
    responsibilities_km = ARRAY[
      'បង្រៀនវិធីសាស្ត្រស្រាវជ្រាវអប់រំ ដោយផ្ដោតលើការស្រាវជ្រាវប្រតិបត្តិ',
      'ណែនាំ និងដឹកនាំនិស្សិតគ្រូក្នុងគម្រោងស្រាវជ្រាវប្រតិបត្តិរបស់ពួកគេ',
      'ជំរុញការឆ្លុះបញ្ចាំងបែបរិះគន់ និងការស្រាវជ្រាវជាប្រព័ន្ធក្នុងចំណោមគ្រូនាពេលអនាគត'
    ]::text[],
    languages = ARRAY[
      'Khmer',
      'English'
    ]::text[]
  WHERE slug IN ('vong-savoeun')
     OR (
          (name_en ILIKE '%VONG SAVOEUN%')
          AND NOT EXISTS (
                SELECT 1 FROM public.team_members t2
                 WHERE t2.slug IN ('vong-savoeun')
              )
        )
  RETURNING id, slug
)
INSERT INTO team_profile_touched (n, id, slug)
SELECT 3, id, slug FROM upd;

-- ──────────────────────────────────────────────────────────────────────────
-- #4. Mr. LENG SOCHEAT — Lecturer
-- https://www.ptec.edu.kh/lecturer/leng-socheat/
-- ──────────────────────────────────────────────────────────────────────────
WITH upd AS (
  UPDATE public.team_members SET
    photo_url = 'https://www.ptec.edu.kh/wp-content/uploads/2026/05/Leng-SocheAT.jpg',
    photo_alt = 'Portrait of Mr. LENG SOCHEAT, Lecturer in the Department of Educational Research and Library at PTEC',
    education = 'បរិ.ជាន់ខ្ពស់ គ្រប់គ្រងអប់រំ (M.Ed. in Educational Management, National Institute of Education), បរិ.ជាន់ខ្ពស់ សេដ្ឋកិច្ចវិទ្យា (MA in Economics, National University of Management), បរិ. គ្រប់គ្រងសណ្ឋាគារ និងទេសចរណ៍ (BA in Hotel and Tourism Management, Cambodian Mekong University)',
    short_bio_en = 'Lecturer in the Department of Educational Research and Library who teaches research courses and works on internal quality assurance, teacher professional development, and the integration of technology in education.',
    short_bio_km = 'គ្រូឧទ្ទេសនៃនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ ដែលបង្រៀនមុខវិជ្ជាស្រាវជ្រាវ និងទទួលបន្ទុកការធានាគុណភាពផ្ទៃក្នុង ការអភិវឌ្ឍវិជ្ជាជីវៈគ្រូ និងការបញ្ចូលបច្ចេកវិទ្យាក្នុងការអប់រំ។',
    bio_en = 'LENG Socheat is a lecturer in the Department of Educational Research and Library at Phnom Penh Teacher Education College (PTEC). He holds two Master''s degrees — in Educational Management from the National Institute of Education and in Economics from the National University of Management — as well as a Bachelor''s degree in Hotel and Tourism Management from Cambodian Mekong University. His academic background encompasses pedagogical leadership, curriculum development, quality assurance, and educational research.

He currently teaches research courses at PTEC and contributes to institutional development, teaching and learning processes, and the integration of technology in education. His work also involves internal quality assurance, teacher professional development, and research on digital pedagogy and instructional improvement.

His research interests include AI integration in education, educational and action research, digital education, digital leadership, and pedagogical leadership.',
    bio_km = 'លោក ឡេង សុជាតិ គឺជាគ្រូឧទ្ទេសនៃនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ នៃវិទ្យាស្ថានគរុកោសល្យភ្នំពេញ (PTEC)។ លោកកាន់បរិញ្ញាបត្រជាន់ខ្ពស់ចំនួនពីរ គឺផ្នែកគ្រប់គ្រងអប់រំ ពីវិទ្យាស្ថានជាតិអប់រំ និងផ្នែកសេដ្ឋកិច្ចវិទ្យា ពីសាកលវិទ្យាល័យជាតិគ្រប់គ្រង ព្រមទាំងបរិញ្ញាបត្រផ្នែកគ្រប់គ្រងសណ្ឋាគារ និងទេសចរណ៍ ពីសាកលវិទ្យាល័យមេគង្គកម្ពុជា។ សាវតាសិក្សារបស់លោករួមមានការដឹកនាំផ្នែកគរុកោសល្យ ការអភិវឌ្ឍកម្មវិធីសិក្សា ការធានាគុណភាព និងការស្រាវជ្រាវអប់រំ។

បច្ចុប្បន្ន លោកបង្រៀនមុខវិជ្ជាស្រាវជ្រាវនៅ PTEC និងរួមចំណែកក្នុងការអភិវឌ្ឍស្ថាប័ន ដំណើរការបង្រៀន និងរៀន ព្រមទាំងការបញ្ចូលបច្ចេកវិទ្យាក្នុងការអប់រំ។ ការងាររបស់លោកក៏រួមបញ្ចូលការធានាគុណភាពផ្ទៃក្នុង ការអភិវឌ្ឍវិជ្ជាជីវៈគ្រូ និងការស្រាវជ្រាវស្ដីពីគរុកោសល្យឌីជីថល និងការកែលម្អការបង្រៀន។

ចំណាប់អារម្មណ៍ស្រាវជ្រាវរបស់លោករួមមាន ការបញ្ចូលបញ្ញាសិប្បនិម្មិតក្នុងការអប់រំ ការស្រាវជ្រាវអប់រំ និងការស្រាវជ្រាវប្រតិបត្តិ ការអប់រំឌីជីថល ភាពជាអ្នកដឹកនាំឌីជីថល និងភាពជាអ្នកដឹកនាំផ្នែកគរុកោសល្យ។',
    responsibilities_en = ARRAY[
      'Teaching educational research courses to student teachers',
      'Internal quality assurance and institutional development',
      'Teacher professional development and integration of technology in education'
    ]::text[],
    responsibilities_km = ARRAY[
      'បង្រៀនមុខវិជ្ជាស្រាវជ្រាវអប់រំដល់និស្សិតគ្រូ',
      'ធានាគុណភាពផ្ទៃក្នុង និងអភិវឌ្ឍស្ថាប័ន',
      'អភិវឌ្ឍវិជ្ជាជីវៈគ្រូ និងបញ្ចូលបច្ចេកវិទ្យាក្នុងការអប់រំ'
    ]::text[],
    languages = ARRAY[
      'Khmer',
      'English'
    ]::text[]
  WHERE slug IN ('leng-socheat')
     OR (
          (name_en ILIKE '%LENG SOCHEAT%')
          AND NOT EXISTS (
                SELECT 1 FROM public.team_members t2
                 WHERE t2.slug IN ('leng-socheat')
              )
        )
  RETURNING id, slug
)
INSERT INTO team_profile_touched (n, id, slug)
SELECT 4, id, slug FROM upd;

-- ──────────────────────────────────────────────────────────────────────────
-- #5. Mr. SET SEKKHAPIRATH — Lecturer
-- https://www.ptec.edu.kh/lecturer/set-sekkhapirath/
-- ──────────────────────────────────────────────────────────────────────────
WITH upd AS (
  UPDATE public.team_members SET
    photo_url = 'https://www.ptec.edu.kh/wp-content/uploads/2026/05/10x151.jpg',
    photo_alt = 'Portrait of Mr. SET SEKKHAPIRATH, Lecturer in the Department of Educational Research and Library at PTEC',
    education = 'បរិ.ជាន់ខ្ពស់ អប់រំ (M.Ed., Hiroshima University, Japan, 2025), បរិ.ជាន់ខ្ពស់ វិធីសាស្ត្របង្រៀនភាសាអង់គ្លេស (MA in TESOL, Institute of Foreign Languages, 2017), បរិ. វិធីសាស្ត្របង្រៀនភាសាអង់គ្លេស (BA in TESOL, Pannasastra University of Cambodia)',
    short_bio_en = 'Lecturer at PTEC since 2022, teaching English and Research Methodology. His research focuses on pronunciation instruction, learning motivation, cognitive engagement, and action research.',
    short_bio_km = 'គ្រូឧទ្ទេសនៅ PTEC តាំងពីឆ្នាំ២០២២ បង្រៀនមុខវិជ្ជាភាសាអង់គ្លេស និងវិធីសាស្ត្រស្រាវជ្រាវ។ ការស្រាវជ្រាវរបស់លោកផ្ដោតលើការបង្រៀនការបញ្ចេញសំឡេង ការលើកទឹកចិត្តក្នុងការរៀន ការចូលរួមផ្នែកយល់ដឹង និងការស្រាវជ្រាវប្រតិបត្តិ។',
    bio_en = 'SET Sekkhapirath has been serving as a lecturer in the Department of Educational Research and Library at Phnom Penh Teacher Education College (PTEC) since 2022. In this role he is responsible for delivering core curriculum subjects, including English and Research Methodology, contributing significantly to teacher professional development and pedagogical improvement.

With a solid foundation in language education and global educational practices, he earned his Bachelor of Arts in TESOL from Pannasastra University of Cambodia (PUC) and a Master of Arts in TESOL from the Institute of Foreign Languages (IFL) in 2017. Furthering his international academic training, he obtained a Master of Education from Hiroshima University, Japan, in 2025.

His areas of professional expertise include English language teaching, instructional pedagogy, curriculum design, educational leadership, and teacher training. He is actively engaged in educational research, with current projects and publications focusing on pronunciation instruction, students'' learning motivation, cognitive engagement, and action research.',
    bio_km = 'លោក សិត សិក្ខាភិរ័ត្ន បានបម្រើការជាគ្រូឧទ្ទេសនៃនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ នៃវិទ្យាស្ថានគរុកោសល្យភ្នំពេញ (PTEC) តាំងពីឆ្នាំ២០២២មក។ ក្នុងតួនាទីនេះ លោកទទួលបន្ទុកបង្រៀនមុខវិជ្ជាស្នូល រួមមានភាសាអង់គ្លេស និងវិធីសាស្ត្រស្រាវជ្រាវ ដោយរួមចំណែកយ៉ាងសំខាន់ក្នុងការអភិវឌ្ឍវិជ្ជាជីវៈគ្រូ និងការកែលម្អផ្នែកគរុកោសល្យ។

ដោយមានមូលដ្ឋានគ្រឹះរឹងមាំក្នុងការអប់រំភាសា និងការអនុវត្តអប់រំកម្រិតសកល លោកបានបញ្ចប់បរិញ្ញាបត្រផ្នែកវិធីសាស្ត្របង្រៀនភាសាអង់គ្លេស ពីសាកលវិទ្យាល័យបញ្ញាសាស្ត្រកម្ពុជា (PUC) និងបរិញ្ញាបត្រជាន់ខ្ពស់ផ្នែកវិធីសាស្ត្របង្រៀនភាសាអង់គ្លេស ពីវិទ្យាស្ថានភាសាបរទេស (IFL) ក្នុងឆ្នាំ២០១៧។ លោកបានបន្តការសិក្សាកម្រិតអន្តរជាតិ ដោយទទួលបានបរិញ្ញាបត្រជាន់ខ្ពស់ផ្នែកអប់រំ ពីសាកលវិទ្យាល័យហ៊ីរ៉ូស៊ីម៉ា ប្រទេសជប៉ុន ក្នុងឆ្នាំ២០២៥។

ជំនាញវិជ្ជាជីវៈរបស់លោករួមមាន ការបង្រៀនភាសាអង់គ្លេស គរុកោសល្យបង្រៀន ការរចនាកម្មវិធីសិក្សា ភាពជាអ្នកដឹកនាំផ្នែកអប់រំ និងការបណ្ដុះបណ្ដាលគ្រូ។ លោកកំពុងចូលរួមយ៉ាងសកម្មក្នុងការស្រាវជ្រាវអប់រំ ដោយមានគម្រោង និងស្នាដៃបោះពុម្ពផ្ដោតលើការបង្រៀនការបញ្ចេញសំឡេង ការលើកទឹកចិត្តក្នុងការរៀនរបស់និស្សិត ការចូលរួមផ្នែកយល់ដឹង និងការស្រាវជ្រាវប្រតិបត្តិ។',
    responsibilities_en = ARRAY[
      'Teaching core curriculum subjects, including English and Research Methodology',
      'Contributing to teacher professional development and pedagogical improvement',
      'Conducting and publishing research on pronunciation instruction and learner engagement'
    ]::text[],
    responsibilities_km = ARRAY[
      'បង្រៀនមុខវិជ្ជាស្នូល រួមមានភាសាអង់គ្លេស និងវិធីសាស្ត្រស្រាវជ្រាវ',
      'រួមចំណែកក្នុងការអភិវឌ្ឍវិជ្ជាជីវៈគ្រូ និងការកែលម្អផ្នែកគរុកោសល្យ',
      'អនុវត្ត និងបោះពុម្ពផ្សាយការស្រាវជ្រាវស្ដីពីការបញ្ចេញសំឡេង និងការចូលរួមរបស់អ្នកសិក្សា'
    ]::text[],
    languages = ARRAY[
      'Khmer',
      'English'
    ]::text[]
  WHERE slug IN ('set-sekkhapirath')
     OR (
          (name_en ILIKE '%SEKKHAPIRATH%')
          AND NOT EXISTS (
                SELECT 1 FROM public.team_members t2
                 WHERE t2.slug IN ('set-sekkhapirath')
              )
        )
  RETURNING id, slug
)
INSERT INTO team_profile_touched (n, id, slug)
SELECT 5, id, slug FROM upd;

-- ──────────────────────────────────────────────────────────────────────────
-- #6. Dr. NHOR SANHEI / NHOR SANHUI — Lecturer
-- https://www.ptec.edu.kh/lecturer/7620/
-- ──────────────────────────────────────────────────────────────────────────
WITH upd AS (
  UPDATE public.team_members SET
    photo_url = 'https://www.ptec.edu.kh/wp-content/uploads/2026/05/11.jpg',
    photo_alt = 'Portrait of Dr. NHOR SANHEI, Lecturer in the Department of Educational Research and Library at PTEC',
    education = 'បណ្ឌិត (Ph.D.)',
    short_bio_en = 'Trainer in the Department of Educational Research and Library, specialising in ESL/EFL, bilingual education, teacher education, educational leadership and EdTech. He reviews for several international academic journals and conferences.',
    short_bio_km = 'គ្រូបណ្ដុះបណ្ដាលនៃនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ មានឯកទេសផ្នែកការបង្រៀនភាសាអង់គ្លេស ការអប់រំពីរភាសា ការអប់រំគ្រូ ភាពជាអ្នកដឹកនាំផ្នែកអប់រំ និងបច្ចេកវិទ្យាអប់រំ។ លោកជាអ្នកត្រួតពិនិត្យអត្ថបទឱ្យទស្សនាវដ្ដី និងសន្និសីទអន្តរជាតិជាច្រើន។',
    bio_en = 'Dr. NHOR Sanhei is a trainer in the Department of Educational Research and Library at Phnom Penh Teacher Education College (PTEC).

His educational expertise covers ESL/EFL, bilingual education, teacher education, educational leadership, and educational technology (EdTech).

He frequently publishes and researches strategies to improve teaching and learning outcomes in Cambodia, and serves on technical committees as a reviewer for publications and conferences including Middle School Journal, the Journal of Education and Training (USA), the ICRRD Quality Index Research Journal (Malaysia), and the International Conference on Information Management and Processing (ICIMP, UK).',
    bio_km = 'លោកបណ្ឌិត ញ៉ សាញ់ហ៊ុយ គឺជាគ្រូបណ្ដុះបណ្ដាលនៃនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ នៃវិទ្យាស្ថានគរុកោសល្យភ្នំពេញ (PTEC)។

ជំនាញអប់រំរបស់លោករួមមាន ការបង្រៀនភាសាអង់គ្លេសជាភាសាទីពីរ និងភាសាបរទេស ការអប់រំពីរភាសា ការអប់រំគ្រូ ភាពជាអ្នកដឹកនាំផ្នែកអប់រំ និងបច្ចេកវិទ្យាអប់រំ។

លោកបានបោះពុម្ពផ្សាយ និងស្រាវជ្រាវជាញឹកញាប់ ស្ដីពីយុទ្ធសាស្ត្រលើកកម្ពស់លទ្ធផលបង្រៀន និងរៀននៅកម្ពុជា ព្រមទាំងបម្រើការក្នុងគណៈកម្មការបច្ចេកទេស ជាអ្នកត្រួតពិនិត្យអត្ថបទសម្រាប់ទស្សនាវដ្ដី និងសន្និសីទអន្តរជាតិ រួមមាន Middle School Journal, Journal of Education and Training (សហរដ្ឋអាមេរិក), ICRRD Quality Index Research Journal (ម៉ាឡេស៊ី) និងសន្និសីទអន្តរជាតិស្ដីពីការគ្រប់គ្រង និងដំណើរការព័ត៌មាន (ICIMP, ចក្រភពអង់គ្លេស)។',
    responsibilities_en = ARRAY[
      'Training student teachers in the Department of Educational Research and Library',
      'Researching and publishing strategies to improve teaching and learning outcomes in Cambodia',
      'Serving as a technical reviewer for international academic journals and conferences'
    ]::text[],
    responsibilities_km = ARRAY[
      'បណ្ដុះបណ្ដាលនិស្សិតគ្រូនៅនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ',
      'ស្រាវជ្រាវ និងបោះពុម្ពផ្សាយយុទ្ធសាស្ត្រលើកកម្ពស់លទ្ធផលបង្រៀន និងរៀននៅកម្ពុជា',
      'បម្រើការជាអ្នកត្រួតពិនិត្យបច្ចេកទេសសម្រាប់ទស្សនាវដ្ដី និងសន្និសីទអន្តរជាតិ'
    ]::text[],
    languages = ARRAY[
      'Khmer',
      'English'
    ]::text[]
  WHERE slug IN ('nhor-sanhui', 'nhor-sanhei')
     OR (
          (name_en ILIKE '%NHOR SAN%')
          AND NOT EXISTS (
                SELECT 1 FROM public.team_members t2
                 WHERE t2.slug IN ('nhor-sanhui', 'nhor-sanhei')
              )
        )
  RETURNING id, slug
)
INSERT INTO team_profile_touched (n, id, slug)
SELECT 6, id, slug FROM upd;

-- ──────────────────────────────────────────────────────────────────────────
-- #7. Mr. SOK THOEURN — Lecturer
-- https://www.ptec.edu.kh/lecturer/sok-thoeurn/
-- ──────────────────────────────────────────────────────────────────────────
WITH upd AS (
  UPDATE public.team_members SET
    photo_url = 'https://www.ptec.edu.kh/wp-content/uploads/2026/05/Sok-Thoeurn.jpg',
    photo_alt = 'Portrait of Mr. SOK THOEURN, Lecturer in the Department of Educational Research and Library at PTEC',
    education = 'បរិ.ជាន់ខ្ពស់ អប់រំ ជំនាញប្រឹក្សាគរុកោសល្យ (M.Ed. in Education, Mentoring), បរិ. សង្គមវិទ្យា (BA in Sociology), វិញ្ញាបនបត្រគ្រូបង្រៀនកម្រិតឧត្តមសិក្សា ជំនាញសីលធម៌-ពលរដ្ឋវិជ្ជា (Certificate of Teacher with Higher Education Degree in Moral Civics, Management and Leadership)',
    short_bio_en = 'Teacher educator with more than ten years in education, including a decade as a high school teacher and work as a researcher with international organisations. He teaches educational research and specialises in Action Research.',
    short_bio_km = 'គ្រូឧទ្ទេសដែលមានបទពិសោធន៍ជាង១០ឆ្នាំក្នុងវិស័យអប់រំ រួមទាំងការបង្រៀននៅវិទ្យាល័យរយៈពេលមួយទសវត្សរ៍ និងការងារជាអ្នកស្រាវជ្រាវជាមួយអង្គការអន្តរជាតិ។ លោកបង្រៀនមុខវិជ្ជាស្រាវជ្រាវអប់រំ និងមានឯកទេសផ្នែកការស្រាវជ្រាវប្រតិបត្តិ។',
    bio_en = 'SOK Thoeurn is a dedicated teacher educator at Phnom Penh Teacher Education College (PTEC). He holds a Bachelor''s degree in Sociology and a Master''s degree in Education focused on Mentoring. He also earned a professional Certificate of Teacher with Higher Education Degree, specialising in Moral Civics, Management, and Leadership. With over ten years of experience in education, he spent a decade as a high school teacher and has worked as a researcher with international organisations.

Currently, he teaches educational research subjects to student teachers. He specialises in Action Research (ការស្រាវជ្រាវប្រតិបត្តិ), helping future teachers solve classroom problems and connect educational theory with real-world teaching practices. He is highly skilled in training, mentoring, and research methodologies.',
    bio_km = 'លោក សុខ ធឿន គឺជាគ្រូឧទ្ទេសដ៏ឧស្សាហ៍នៃវិទ្យាស្ថានគរុកោសល្យភ្នំពេញ (PTEC)។ លោកកាន់បរិញ្ញាបត្រផ្នែកសង្គមវិទ្យា និងបរិញ្ញាបត្រជាន់ខ្ពស់ផ្នែកអប់រំ ជំនាញប្រឹក្សាគរុកោសល្យ។ លោកក៏បានទទួលវិញ្ញាបនបត្រវិជ្ជាជីវៈគ្រូបង្រៀនកម្រិតឧត្តមសិក្សា ជំនាញសីលធម៌-ពលរដ្ឋវិជ្ជា ការគ្រប់គ្រង និងភាពជាអ្នកដឹកនាំ។ ដោយមានបទពិសោធន៍ជាង១០ឆ្នាំក្នុងវិស័យអប់រំ លោកបានបង្រៀននៅវិទ្យាល័យរយៈពេលមួយទសវត្សរ៍ និងធ្លាប់បម្រើការជាអ្នកស្រាវជ្រាវជាមួយអង្គការអន្តរជាតិ។

បច្ចុប្បន្ន លោកបង្រៀនមុខវិជ្ជាស្រាវជ្រាវអប់រំដល់និស្សិតគ្រូ។ លោកមានឯកទេសផ្នែកការស្រាវជ្រាវប្រតិបត្តិ ដោយជួយឱ្យគ្រូនាពេលអនាគតដោះស្រាយបញ្ហាក្នុងថ្នាក់រៀន និងភ្ជាប់ទ្រឹស្ដីអប់រំទៅនឹងការអនុវត្តជាក់ស្ដែង។ លោកមានជំនាញខ្ពស់ក្នុងការបណ្ដុះបណ្ដាល ការណែនាំ និងវិធីសាស្ត្រស្រាវជ្រាវ។',
    responsibilities_en = ARRAY[
      'Teaching educational research subjects to student teachers',
      'Specialising in Action Research to help future teachers solve classroom problems',
      'Training and mentoring in research methodologies'
    ]::text[],
    responsibilities_km = ARRAY[
      'បង្រៀនមុខវិជ្ជាស្រាវជ្រាវអប់រំដល់និស្សិតគ្រូ',
      'ឯកទេសផ្នែកការស្រាវជ្រាវប្រតិបត្តិ ដើម្បីជួយគ្រូនាពេលអនាគតដោះស្រាយបញ្ហាក្នុងថ្នាក់រៀន',
      'បណ្ដុះបណ្ដាល និងណែនាំអំពីវិធីសាស្ត្រស្រាវជ្រាវ'
    ]::text[],
    languages = ARRAY[
      'Khmer',
      'English'
    ]::text[]
  WHERE slug IN ('sok-thoeurn')
     OR (
          (name_en ILIKE '%SOK THOEURN%')
          AND NOT EXISTS (
                SELECT 1 FROM public.team_members t2
                 WHERE t2.slug IN ('sok-thoeurn')
              )
        )
  RETURNING id, slug
)
INSERT INTO team_profile_touched (n, id, slug)
SELECT 7, id, slug FROM upd;

-- ──────────────────────────────────────────────────────────────────────────
-- #8. Mrs. LAM SOKLANG — Librarian
-- https://www.ptec.edu.kh/lecturer/lam-soklang/
-- ──────────────────────────────────────────────────────────────────────────
WITH upd AS (
  UPDATE public.team_members SET
    photo_url = 'https://www.ptec.edu.kh/wp-content/uploads/2026/05/Lam-Soklang.jpg',
    photo_alt = 'Portrait of Mrs. LAM SOKLANG, Librarian in the Department of Educational Research and Library at PTEC',
    education = 'បរិ. សង្គមវិទ្យា (BA in Sociology, Royal University of Phnom Penh, 2001), វិញ្ញាបនបត្រ ចិត្តវិទ្យាគរុកោសល្យ (Certificate in Psycho-Pedagogy, National Institute of Education, 2002)',
    short_bio_en = 'Librarian in the Department of Educational Research and Library, responsible for keeping the collection organised and accessible, and for teaching students how to manage and arrange a library.',
    short_bio_km = 'បណ្ណារក្សនៃនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ ទទួលបន្ទុករៀបចំឯកសារឱ្យមានសណ្ដាប់ធ្នាប់ និងងាយស្រួលប្រើប្រាស់ ព្រមទាំងបង្រៀននិស្សិតអំពីការគ្រប់គ្រង និងរៀបចំបណ្ណាល័យ។',
    bio_en = 'LAM Soklang studied at the Royal University of Phnom Penh from 1998 to 2001 and graduated with a Bachelor''s degree in Sociology. In 2001–2002 she continued her studies for a year at the National Institute of Education (NIE) and obtained a Certificate in Psycho-Pedagogy.

She currently serves as a Librarian at Phnom Penh Teacher Education College (PTEC) in the Department of Educational Research and Library. In this role she has been faithfully dedicated to managing the library, making sure it is well organised and properly maintained. She also instructs and supports students at the college, teaching them how to manage and arrange a library — knowledge that will serve them in their own careers.',
    bio_km = 'លោកស្រី ឡាំ សុខឡាង បានសិក្សានៅសាកលវិទ្យាល័យភូមិន្ទភ្នំពេញ ចាប់ពីឆ្នាំ១៩៩៨ ដល់ឆ្នាំ២០០១ ហើយបានបញ្ចប់បរិញ្ញាបត្រផ្នែកសង្គមវិទ្យា។ ក្នុងឆ្នាំ២០០១-២០០២ លោកស្រីបានបន្តការសិក្សារយៈពេលមួយឆ្នាំនៅវិទ្យាស្ថានជាតិអប់រំ (NIE) និងទទួលបានវិញ្ញាបនបត្រផ្នែកចិត្តវិទ្យាគរុកោសល្យ។

បច្ចុប្បន្ន លោកស្រីបម្រើការជាបណ្ណារក្សនៅវិទ្យាស្ថានគរុកោសល្យភ្នំពេញ (PTEC) ក្នុងនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ។ ក្នុងតួនាទីនេះ លោកស្រីបានយកចិត្តទុកដាក់គ្រប់គ្រងបណ្ណាល័យ ដោយធានាឱ្យមានសណ្ដាប់ធ្នាប់ និងការថែរក្សាបានត្រឹមត្រូវ។ លោកស្រីក៏បានណែនាំ និងជួយនិស្សិតនៃវិទ្យាស្ថាន ដោយបង្រៀនពួកគេអំពីរបៀបគ្រប់គ្រង និងរៀបចំបណ្ណាល័យ ដែលជាចំណេះដឹងមានប្រយោជន៍សម្រាប់អាជីពរបស់ពួកគេនាពេលអនាគត។',
    responsibilities_en = ARRAY[
      'Managing the library collection and keeping it organised and well maintained',
      'Teaching students how to manage and arrange a library',
      'Supporting readers in finding and using library materials'
    ]::text[],
    responsibilities_km = ARRAY[
      'គ្រប់គ្រងឯកសារបណ្ណាល័យ និងរក្សាសណ្ដាប់ធ្នាប់ឱ្យបានល្អ',
      'បង្រៀននិស្សិតអំពីរបៀបគ្រប់គ្រង និងរៀបចំបណ្ណាល័យ',
      'ជួយអ្នកអានក្នុងការស្វែងរក និងប្រើប្រាស់ឯកសារបណ្ណាល័យ'
    ]::text[],
    languages = ARRAY[
      'Khmer',
      'English'
    ]::text[]
  WHERE slug IN ('lam-soklang')
     OR (
          (name_en ILIKE '%LAM SOKLANG%')
          AND NOT EXISTS (
                SELECT 1 FROM public.team_members t2
                 WHERE t2.slug IN ('lam-soklang')
              )
        )
  RETURNING id, slug
)
INSERT INTO team_profile_touched (n, id, slug)
SELECT 8, id, slug FROM upd;

-- ──────────────────────────────────────────────────────────────────────────
-- #9. Mrs. NOUM VIRADETTE — Librarian
-- https://www.ptec.edu.kh/lecturer/noum-viradette/
-- ──────────────────────────────────────────────────────────────────────────
WITH upd AS (
  UPDATE public.team_members SET
    photo_url = 'https://www.ptec.edu.kh/wp-content/uploads/2026/05/Noum-Virdette.jpg',
    photo_alt = 'Portrait of Mrs. NOUM VIRADETTE, Librarian in the Department of Educational Research and Library at PTEC',
    education = 'បរិ. ភាសាបារាំងសម្រាប់ការអប់រំ (BA in French Language for Education, Royal University of Phnom Penh)',
    short_bio_en = 'Teacher trainer and librarian who manages the college''s library resources and makes sure student teachers and lecturers can reach the teaching books, curriculum guides and research materials they need.',
    short_bio_km = 'គ្រូបណ្ដុះបណ្ដាល និងបណ្ណារក្ស ដែលគ្រប់គ្រងធនធានបណ្ណាល័យរបស់វិទ្យាស្ថាន និងធានាឱ្យនិស្សិតគ្រូ និងគ្រូឧទ្ទេស អាចទទួលបានសៀវភៅបង្រៀន មគ្គុទ្ទេសក៍កម្មវិធីសិក្សា និងឯកសារស្រាវជ្រាវចាំបាច់។',
    bio_en = 'NOUM Viradette is a teacher trainer. She earned her Bachelor''s degree from the Royal University of Phnom Penh (RUPP), focusing on French Language for Education.

She works at Phnom Penh Teacher Education College (PTEC) in the Department of Educational Research and Library. In her role as a librarian, she manages the college''s library resources, making sure that student teachers and lecturers have easy access to important teaching books, curriculum guides, and research materials.

Beyond her daily library work, she actively helps and guides students to find and use information correctly. By keeping the library active and well stocked, she turns it into more than a place for books: a space where future teachers gain the knowledge and skills they need to succeed in their own classrooms. Her interests include education, information science, pedagogy, and information technology.',
    bio_km = 'លោកស្រី ឌុម វីរ៉ាដេត គឺជាគ្រូបណ្ដុះបណ្ដាល។ លោកស្រីបានបញ្ចប់បរិញ្ញាបត្រពីសាកលវិទ្យាល័យភូមិន្ទភ្នំពេញ (RUPP) ជំនាញភាសាបារាំងសម្រាប់ការអប់រំ។

លោកស្រីបម្រើការនៅវិទ្យាស្ថានគរុកោសល្យភ្នំពេញ (PTEC) ក្នុងនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ។ ក្នុងតួនាទីជាបណ្ណារក្ស លោកស្រីគ្រប់គ្រងធនធានបណ្ណាល័យរបស់វិទ្យាស្ថាន ដោយធានាឱ្យនិស្សិតគ្រូ និងគ្រូឧទ្ទេស អាចទទួលបានយ៉ាងងាយស្រួលនូវសៀវភៅបង្រៀនសំខាន់ៗ មគ្គុទ្ទេសក៍កម្មវិធីសិក្សា និងឯកសារស្រាវជ្រាវ។

ក្រៅពីការងារបណ្ណាល័យប្រចាំថ្ងៃ លោកស្រីបានជួយ និងណែនាំនិស្សិតយ៉ាងសកម្ម ក្នុងការស្វែងរក និងប្រើប្រាស់ព័ត៌មានឱ្យបានត្រឹមត្រូវ។ ដោយរក្សាបណ្ណាល័យឱ្យមានភាពសកម្ម និងសម្បូរធនធាន លោកស្រីបានធ្វើឱ្យបណ្ណាល័យក្លាយជាមិនត្រឹមតែកន្លែងដាក់សៀវភៅប៉ុណ្ណោះទេ ថែមទាំងជាលំហដែលគ្រូនាពេលអនាគតទទួលបានចំណេះដឹង និងជំនាញចាំបាច់សម្រាប់ជោគជ័យក្នុងថ្នាក់រៀនរបស់ពួកគេ។ ចំណាប់អារម្មណ៍របស់លោកស្រីរួមមាន ការអប់រំ វិទ្យាសាស្ត្រព័ត៌មាន គរុកោសល្យ និងបច្ចេកវិទ្យាព័ត៌មាន។',
    responsibilities_en = ARRAY[
      'Managing the college''s library resources',
      'Ensuring access to teaching books, curriculum guides and research materials',
      'Guiding students to find and use information correctly'
    ]::text[],
    responsibilities_km = ARRAY[
      'គ្រប់គ្រងធនធានបណ្ណាល័យរបស់វិទ្យាស្ថាន',
      'ធានាលទ្ធភាពទទួលបានសៀវភៅបង្រៀន មគ្គុទ្ទេសក៍កម្មវិធីសិក្សា និងឯកសារស្រាវជ្រាវ',
      'ណែនាំនិស្សិតក្នុងការស្វែងរក និងប្រើប្រាស់ព័ត៌មានឱ្យបានត្រឹមត្រូវ'
    ]::text[],
    languages = ARRAY[
      'Khmer',
      'English',
      'French'
    ]::text[]
  WHERE slug IN ('noum-viradette')
     OR (
          (name_en ILIKE '%VIRADETTE%')
          AND NOT EXISTS (
                SELECT 1 FROM public.team_members t2
                 WHERE t2.slug IN ('noum-viradette')
              )
        )
  RETURNING id, slug
)
INSERT INTO team_profile_touched (n, id, slug)
SELECT 9, id, slug FROM upd;

-- ──────────────────────────────────────────────────────────────────────────
-- #10. Mrs. PHENG AMPOR — Librarian
-- https://www.ptec.edu.kh/lecturer/pheng-ampor/
-- ──────────────────────────────────────────────────────────────────────────
WITH upd AS (
  UPDATE public.team_members SET
    photo_url = 'https://www.ptec.edu.kh/wp-content/uploads/2026/05/Pheng-Ampor.png',
    photo_alt = 'Portrait of Mrs. PHENG AMPOR, Librarian in the Department of Educational Research and Library at PTEC',
    education = 'វិញ្ញាបនបត្រ គរុកោសល្យ ជំនាញភូមិវិទ្យា និងប្រវត្តិវិទ្យា (Certificate in Pedagogy, majoring in Geography and History, Phnom Penh Regional Teacher Training Centre, 1989)',
    short_bio_en = 'Librarian in the Department of Educational Research and Library, responsible for maintaining the library and teaching students how to manage and arrange library collections.',
    short_bio_km = 'បណ្ណារក្សនៃនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ ទទួលបន្ទុកថែរក្សាបណ្ណាល័យ និងបង្រៀននិស្សិតអំពីការគ្រប់គ្រង និងរៀបចំឯកសារបណ្ណាល័យ។',
    bio_en = 'PHENG Ampor studied at the Phnom Penh Regional Teacher Training Centre from 1987 to 1989 and obtained a Certificate in Pedagogy, majoring in Geography and History.

She currently works as a Librarian in the Department of Educational Research and Library at Phnom Penh Teacher Education College (PTEC). As a librarian she is fully invested in her role, making sure the library is well maintained. She also supports students by teaching them how to manage and arrange library collections — practical knowledge they can carry into their own schools.',
    bio_km = 'លោកស្រី ផេង អំពរ បានសិក្សានៅមជ្ឈមណ្ឌលបណ្ដុះបណ្ដាលគ្រូបង្រៀនថ្នាក់តំបន់ភ្នំពេញ ចាប់ពីឆ្នាំ១៩៨៧ ដល់ឆ្នាំ១៩៨៩ ហើយបានទទួលវិញ្ញាបនបត្រផ្នែកគរុកោសល្យ ជំនាញភូមិវិទ្យា និងប្រវត្តិវិទ្យា។

បច្ចុប្បន្ន លោកស្រីបម្រើការជាបណ្ណារក្សក្នុងនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ នៃវិទ្យាស្ថានគរុកោសល្យភ្នំពេញ (PTEC)។ ក្នុងនាមជាបណ្ណារក្ស លោកស្រីបានយកចិត្តទុកដាក់ពេញលេញក្នុងតួនាទីរបស់ខ្លួន ដោយធានាថាបណ្ណាល័យត្រូវបានថែរក្សាបានល្អ។ លោកស្រីក៏បានជួយនិស្សិត ដោយបង្រៀនពួកគេអំពីរបៀបគ្រប់គ្រង និងរៀបចំឯកសារបណ្ណាល័យ ដែលជាចំណេះដឹងជាក់ស្ដែងអាចយកទៅប្រើនៅសាលារៀនរបស់ពួកគេ។',
    responsibilities_en = ARRAY[
      'Maintaining the library and its daily services',
      'Teaching students how to manage and arrange library collections',
      'Supporting readers at the circulation and reference desk'
    ]::text[],
    responsibilities_km = ARRAY[
      'ថែរក្សាបណ្ណាល័យ និងសេវាកម្មប្រចាំថ្ងៃ',
      'បង្រៀននិស្សិតអំពីរបៀបគ្រប់គ្រង និងរៀបចំឯកសារបណ្ណាល័យ',
      'ជួយអ្នកអាននៅតុខ្ចីសៀវភៅ និងតុព័ត៌មាន'
    ]::text[],
    languages = ARRAY[
      'Khmer',
      'English'
    ]::text[]
  WHERE slug IN ('pheng-ampor')
     OR (
          (name_en ILIKE '%PHENG AMPOR%')
          AND NOT EXISTS (
                SELECT 1 FROM public.team_members t2
                 WHERE t2.slug IN ('pheng-ampor')
              )
        )
  RETURNING id, slug
)
INSERT INTO team_profile_touched (n, id, slug)
SELECT 10, id, slug FROM upd;

-- ──────────────────────────────────────────────────────────────────────────
-- #11. Mr. MOM CHANNA — Librarian
-- https://www.ptec.edu.kh/lecturer/mom-channa/
-- ──────────────────────────────────────────────────────────────────────────
WITH upd AS (
  UPDATE public.team_members SET
    photo_url = 'https://www.ptec.edu.kh/wp-content/uploads/2026/05/Mom-Channa-scaled.jpg',
    photo_alt = 'Portrait of Mr. MOM CHANNA, Librarian in the Department of Educational Research and Library at PTEC',
    education = 'បរិ.ជាន់ខ្ពស់ គណិតវិទ្យា (M.Sc. in Mathematics, Royal University of Phnom Penh, 2025), បរិ.+១ គរុកោសល្យ (Bachelor+1 in Pedagogy, National Institute of Education, 2018), បរិ. គណិតវិទ្យា (B.Sc. in Mathematics, Svay Rieng University, 2017)',
    short_bio_en = 'Mathematics lecturer and librarian who oversees the library in the Department of Educational Research and Library. He works with the Koha and PMB library systems and Dewey Decimal Classification.',
    short_bio_km = 'គ្រូបង្រៀនគណិតវិទ្យា និងបណ្ណារក្ស ដែលត្រួតពិនិត្យបណ្ណាល័យនៃនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ។ លោកប្រើប្រាស់ប្រព័ន្ធបណ្ណាល័យ Koha និង PMB ព្រមទាំងប្រព័ន្ធចាត់ថ្នាក់ឯកសារ Dewey (DDC)។',
    bio_en = 'MOM Channa has been a dedicated public servant with the Cambodian Ministry of Education, Youth and Sport since 2018, after completing a year of pedagogy at the National Institute of Education (NIE).

From 2022 to the present he has served as a Mathematics lecturer at Phnom Penh Teacher Education College (PTEC). Before coming to PTEC he taught mathematics at Hun Sen Chrey Thom High School for four years. In his current capacity he oversees the library in PTEC''s Department of Educational Research and Library, part of the Faculty of Pedagogy and Research.

He earned a Bachelor''s degree in Mathematics from Svay Rieng University in 2017 and a Master''s degree in Mathematics from the Royal University of Phnom Penh (RUPP) in 2025. His skills include mathematics, the Koha and PMB library systems, and Dewey Decimal Classification, and his research interests are applied statistics and probability.',
    bio_km = 'លោក មុំ ចាន់ណា គឺជាមន្ត្រីរាជការដ៏ឧស្សាហ៍នៃក្រសួងអប់រំ យុវជន និងកីឡា តាំងពីឆ្នាំ២០១៨មក បន្ទាប់ពីបានបញ្ចប់ការសិក្សាគរុកោសល្យរយៈពេលមួយឆ្នាំនៅវិទ្យាស្ថានជាតិអប់រំ (NIE)។

ចាប់ពីឆ្នាំ២០២២រហូតមកដល់បច្ចុប្បន្ន លោកបានបម្រើការជាគ្រូបង្រៀនគណិតវិទ្យានៅវិទ្យាស្ថានគរុកោសល្យភ្នំពេញ (PTEC)។ មុនពេលមកបម្រើការនៅ PTEC លោកបានបង្រៀនគណិតវិទ្យានៅវិទ្យាល័យហ៊ុនសែនជ្រៃធំ រយៈពេល៤ឆ្នាំ។ ក្នុងតួនាទីបច្ចុប្បន្ន លោកត្រួតពិនិត្យបណ្ណាល័យនៃនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ ដែលស្ថិតក្រោមមហាវិទ្យាល័យគរុកោសល្យ និងស្រាវជ្រាវ។

លោកបានបញ្ចប់បរិញ្ញាបត្រផ្នែកគណិតវិទ្យា ពីសាកលវិទ្យាល័យស្វាយរៀង ក្នុងឆ្នាំ២០១៧ និងបរិញ្ញាបត្រជាន់ខ្ពស់ផ្នែកគណិតវិទ្យា ពីសាកលវិទ្យាល័យភូមិន្ទភ្នំពេញ (RUPP) ក្នុងឆ្នាំ២០២៥។ ជំនាញរបស់លោករួមមាន គណិតវិទ្យា ប្រព័ន្ធបណ្ណាល័យ Koha និង PMB ព្រមទាំងប្រព័ន្ធចាត់ថ្នាក់ឯកសារ Dewey (DDC) ហើយចំណាប់អារម្មណ៍ស្រាវជ្រាវរបស់លោកគឺស្ថិតិអនុវត្ត និងប្រូបាប៊ីលីតេ។',
    responsibilities_en = ARRAY[
      'Overseeing the library of the Department of Educational Research and Library',
      'Operating the Koha and PMB library systems and Dewey Decimal Classification',
      'Teaching mathematics to student teachers at PTEC'
    ]::text[],
    responsibilities_km = ARRAY[
      'ត្រួតពិនិត្យបណ្ណាល័យនៃនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ',
      'ប្រើប្រាស់ប្រព័ន្ធបណ្ណាល័យ Koha និង PMB ព្រមទាំងប្រព័ន្ធចាត់ថ្នាក់ឯកសារ Dewey (DDC)',
      'បង្រៀនគណិតវិទ្យាដល់និស្សិតគ្រូនៅ PTEC'
    ]::text[],
    languages = ARRAY[
      'Khmer',
      'English'
    ]::text[]
  WHERE slug IN ('mom-channa')
     OR (
          (name_en ILIKE '%MOM CHANNA%'
             OR name_en ILIKE '%CHANNA MOM%')
          AND NOT EXISTS (
                SELECT 1 FROM public.team_members t2
                 WHERE t2.slug IN ('mom-channa')
              )
        )
  RETURNING id, slug
)
INSERT INTO team_profile_touched (n, id, slug)
SELECT 11, id, slug FROM upd;

-- ──────────────────────────────────────────────────────────────────────────
-- #12. Mrs. SEK SAMSOKNEANG / SEK SOMSOKNEANG — Librarian
-- https://www.ptec.edu.kh/lecturer/sek-samsokneang/
-- ──────────────────────────────────────────────────────────────────────────
WITH upd AS (
  UPDATE public.team_members SET
    photo_url = 'https://www.ptec.edu.kh/wp-content/uploads/2026/05/photo_2025-01-24_09-33-53.jpg',
    photo_alt = 'Portrait of Mrs. SEK SAMSOKNEANG, Librarian in the Department of Educational Research and Library at PTEC',
    education = 'បរិ. ភូមិវិទ្យា (BA in Geography, Royal University of Phnom Penh, 2010), វិញ្ញាបនបត្រ ភូមិវិទ្យា និងគ្រប់គ្រងបណ្ណាល័យ (Certificate in Geography and Library Management, National Institute of Education, 2011)',
    short_bio_en = 'Librarian in the Department of Educational Research and Library, dedicated to keeping the collection organised and to teaching students how to manage and arrange a library.',
    short_bio_km = 'បណ្ណារក្សនៃនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ ដែលយកចិត្តទុកដាក់រៀបចំឯកសារឱ្យមានសណ្ដាប់ធ្នាប់ និងបង្រៀននិស្សិតអំពីការគ្រប់គ្រង និងរៀបចំបណ្ណាល័យ។',
    bio_en = 'SEK Samsokneang studied at the Royal University of Phnom Penh from 2006 to 2010 and graduated with a Bachelor''s degree in Geography. In 2010–2011 she continued her studies for a year at the National Institute of Education (NIE) and obtained a Certificate in Geography and Library Management.

She currently serves as a Librarian at Phnom Penh Teacher Education College (PTEC) in the Department of Educational Research and Library. She has been faithfully dedicated to managing the library, making sure it is well organised and properly maintained. She also instructs and supports students at the college, teaching them how to manage and arrange a library — knowledge that will serve them in their own careers.',
    bio_km = 'លោកស្រី សេក សំសុខនាង បានសិក្សានៅសាកលវិទ្យាល័យភូមិន្ទភ្នំពេញ ចាប់ពីឆ្នាំ២០០៦ ដល់ឆ្នាំ២០១០ ហើយបានបញ្ចប់បរិញ្ញាបត្រផ្នែកភូមិវិទ្យា។ ក្នុងឆ្នាំ២០១០-២០១១ លោកស្រីបានបន្តការសិក្សារយៈពេលមួយឆ្នាំនៅវិទ្យាស្ថានជាតិអប់រំ (NIE) និងទទួលបានវិញ្ញាបនបត្រផ្នែកភូមិវិទ្យា និងគ្រប់គ្រងបណ្ណាល័យ។

បច្ចុប្បន្ន លោកស្រីបម្រើការជាបណ្ណារក្សនៅវិទ្យាស្ថានគរុកោសល្យភ្នំពេញ (PTEC) ក្នុងនាយកដ្ឋានស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ។ លោកស្រីបានយកចិត្តទុកដាក់គ្រប់គ្រងបណ្ណាល័យ ដោយធានាឱ្យមានសណ្ដាប់ធ្នាប់ និងការថែរក្សាបានត្រឹមត្រូវ។ លោកស្រីក៏បានណែនាំ និងជួយនិស្សិតនៃវិទ្យាស្ថាន ដោយបង្រៀនពួកគេអំពីរបៀបគ្រប់គ្រង និងរៀបចំបណ្ណាល័យ ដែលជាចំណេះដឹងមានប្រយោជន៍សម្រាប់អាជីពរបស់ពួកគេនាពេលអនាគត។',
    responsibilities_en = ARRAY[
      'Managing and organising the library collection',
      'Instructing students in library management and arrangement',
      'Supporting readers in finding and using library materials'
    ]::text[],
    responsibilities_km = ARRAY[
      'គ្រប់គ្រង និងរៀបចំឯកសារបណ្ណាល័យ',
      'ណែនាំនិស្សិតអំពីការគ្រប់គ្រង និងរៀបចំបណ្ណាល័យ',
      'ជួយអ្នកអានក្នុងការស្វែងរក និងប្រើប្រាស់ឯកសារបណ្ណាល័យ'
    ]::text[],
    languages = ARRAY[
      'Khmer',
      'English'
    ]::text[]
  WHERE slug IN ('sek-somsokneang', 'sek-samsokneang')
     OR (
          (name_en ILIKE '%SEK SOMSOKNEANG%'
             OR name_en ILIKE '%SEK SAMSOKNEANG%')
          AND NOT EXISTS (
                SELECT 1 FROM public.team_members t2
                 WHERE t2.slug IN ('sek-somsokneang', 'sek-samsokneang')
              )
        )
  RETURNING id, slug
)
INSERT INTO team_profile_touched (n, id, slug)
SELECT 12, id, slug FROM upd;

-- ──────────────────────────────────────────────────────────────────────────
-- Verification
--
-- Asserted per statement, not table-wide: team_members is the whole college
-- directory and holds people this script does not manage, so "12 rows in the
-- table look enriched" is the wrong question. The right one is whether each
-- of the twelve statements above found its one person.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_people integer;
  v_bad    text;
BEGIN
  -- (a) Every statement must have matched exactly one row. Zero means a name
  --     or slug changed underneath this file; more than one means a WHERE
  --     clause is also catching somebody else in the directory.
  SELECT string_agg(format('#%s matched %s row(s)', g.n, coalesce(c.hits, 0)), '; ' ORDER BY g.n)
    INTO v_bad
    FROM generate_series(1, 12) AS g(n)
    LEFT JOIN (
      SELECT n, count(*) AS hits FROM team_profile_touched GROUP BY n
    ) AS c ON c.n = g.n
   WHERE coalesce(c.hits, 0) <> 1;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'seed_update_team_profiles: every statement must update exactly one row, but %', v_bad;
  END IF;

  -- (b) Twelve statements must have reached twelve DIFFERENT people, not the
  --     same person twelve times.
  SELECT count(DISTINCT id) INTO v_people FROM team_profile_touched;

  IF v_people <> 12 THEN
    RAISE EXCEPTION
      'seed_update_team_profiles: the 12 statements reached only % distinct members', v_people;
  END IF;

  RAISE NOTICE 'seed_update_team_profiles: 12/12 department members enriched (%)',
    (SELECT string_agg(slug, ', ' ORDER BY n) FROM team_profile_touched);
END $$;

DROP TABLE team_profile_touched;

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────
-- Post-run check (run separately). Scoped to this department on purpose:
-- team_members also holds directory rows this file does not manage.
--
--   SELECT tm.display_order, tm.slug, tm.position_en,
--          left(tm.education, 60) AS education,
--          tm.photo_url IS NOT NULL AS has_photo,
--          array_length(tm.responsibilities_en, 1) AS resp,
--          tm.languages
--     FROM public.team_members tm
--    WHERE tm.slug IN (
--            'tholthoeun-chanraeksmey','lek-chumnor','vong-savoeun',
--            'leng-socheat','set-sekkhapirath','nhor-sanhui','sok-thoeurn',
--            'lam-soklang','noum-viradette','pheng-ampor','mom-channa',
--            'sek-somsokneang')
--    ORDER BY tm.display_order;
--
-- To see everyone else the directory holds (this file leaves them alone):
--
--   SELECT slug, name_en, position_en, is_published
--     FROM public.team_members
--    WHERE slug NOT IN (...the twelve above...)
--    ORDER BY display_order;
--
-- Then revalidate the public pages that render these people:
--   /about/team, /km/about/team, /about/committee, /km/about/committee
-- ──────────────────────────────────────────────────────────────────────────
