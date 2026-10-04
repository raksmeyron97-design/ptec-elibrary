-- 0168_clear_trial_catalog_keywords.sql
-- One-off data repair: the keywords of six Physical Library records written
-- by a trial import of the PMB book spreadsheets (ptec-books-part1–3.xlsx).
--
-- Those spreadsheets' keywords are generated — the record's category, its
-- author, and its title split into words ("BABY", "SITTERS", "About") — and
-- PTEC decided on 2026-10-04 not to import them (the Koha deployment's
-- docs/10-LIBRARIAN-SETUP-PLAN.md records why). Six records (Koha records
-- 1–6) kept them from the trial; since the record page shows keywords as
-- links, they would now be displayed. Per PTEC's instruction they are
-- cleared.
--
-- Compare-and-set: each row is cleared only while it still holds exactly
-- the trial keywords, so a keyword a librarian has since written is never
-- lost. Record 2639 (inactive, real subject headings) is not touched.
--
-- Idempotent: a second run matches nothing.

-- Koha record 1: /catalogs/១០០-រឿងដែលគួរយល់ដឹងពី-ប្រទេសកម្ពុជ
update public.catalog_books
   set keywords = '{}'::text[]
 where id = '2f4d2c99-5a07-491d-9399-494e51a1ca8b'
   and keywords = ARRAY['វិទ្យាសាស្ត្រសង្គម', 'រឿងដែលគួរយល់ដឹងពី', 'ប្រទេសកម្ពុជា', 'ប្រាជ្ញ វិជ័យ']::text[];

-- Koha record 2: /catalogs/ខ្ញុំចង់ដឹងជីវិតរបស់-ម៉ាកូ-ប៉ូឡ-labbe-brigitte
update public.catalog_books
   set keywords = '{}'::text[]
 where id = '51627370-96d7-421f-a048-ea3beb7f2f63'
   and keywords = ARRAY['ប្រវត្តិសាស្ត្រ និងភូមិសាស្ត្រ', 'ខ្ញុំចង់ដឹងជីវិតរបស់', 'ម៉ាកូ', 'ប៉ូឡូ', 'Labbé Brigitte']::text[];

-- Koha record 3: /catalogs/3-the-baby-sitters-club-the-truth-about-stacey-martin-ann-m
update public.catalog_books
   set keywords = '{}'::text[]
 where id = '319fd858-abfb-460b-98f1-fc18d46f693b'
   and keywords = ARRAY['Social sciences', 'វិទ្យាសាស្ត្រសង្គម', 'BABY', 'SITTERS', 'CLUB', 'Truth', 'About', 'Stacey', 'Martin Ann M.']::text[];

-- Koha record 4: /catalogs/10-mindframes-for-visible-learning-teaching-for-success-hattie-john
update public.catalog_books
   set keywords = '{}'::text[]
 where id = '65940fc6-eb08-4f2b-8b58-459f13081636'
   and keywords = ARRAY['Education and pedagogy', 'អប់រំ និងគរុកោសល្យ', 'mindframes', 'visible', 'learning', 'teaching', 'success', 'Hattie John']::text[];

-- Koha record 5: /catalogs/១០០-វិទ្យាសាស្ត្រអភិវឌ្ឍពិភពលោក-ភាគ៣
update public.catalog_books
   set keywords = '{}'::text[]
 where id = '63d5ae38-6763-4f22-bfa1-75f248cf28c9'
   and keywords = ARRAY['បច្ចេកវិទ្យា និងវិទ្យាសាស្ត្រអនុវត្ត', 'វិទ្យាសាស្ត្រអភិវឌ្ឍពិភពលោក', 'ភាគ៣', 'គីម ថែខ្វាន់']::text[];

-- Koha record 6: /catalogs/100-វិទ្យាសាស្រ្តអភិវឌ្ឍពិភពលោក-1
update public.catalog_books
   set keywords = '{}'::text[]
 where id = '3224e17e-1cee-427a-a149-a2be93ae344b'
   and keywords = ARRAY['ប្រលោមលោក', 'វិទ្យាសាស្រ្តអភិវឌ្ឍពិភពលោក', 'គីម ថែខ្វាន់']::text[];
