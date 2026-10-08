-- 0171_seed_retired_urls.sql
--
-- The 43 dead book URLs (SEO audit 2026-10, WI-1) into the retired-URL queue
-- that 0170 created, so a librarian can decide each one at
-- /admin/books/retired-urls: confirm the suggested successor (301), mark it
-- removed (410), or ignore it. NOTHING here redirects anything — a seeded row
-- is a question, and the answer is a person's, audited by the queue's
-- actions. (Correction C5 to the Gate 5 plan, which baked 43 confirmed
-- redirects into SQL after a CSV round trip.)
--
-- Every path was re-checked against production on 2026-10-07 (each answered
-- 404) and every suggested successor appears exactly once in the production
-- sitemaps. Gated per row, in the 0142/0147 style, so this changes nothing on
-- a database that is not production's:
--   * a path that is live again is skipped;
--   * a suggestion is kept only if that record is published NOW — otherwise
--     it is dropped and the note says so;
--   * a row with no live suggestion is inserted only on the production corpus
--     (at least 10 of the 16 distinct suggested successors published). On the
--     CI seed — where migrations run before seed.sql, so `books` is empty —
--     nothing is inserted at all.
-- Idempotent: ON CONFLICT DO NOTHING, so a row a librarian has already
-- decided is never reset.
--
-- Rollback: delete from public.retired_url_queue
--             where cause = 'seeded' and resolution = 'pending';

set local lock_timeout = '10s';

with seed (path, suggested_path, note) as (
  values
    ('/books/ថ្នាក់ទី៩-សិក្ាសង្គម', '/books/ថ្នាក់ទី៩-សិក្សាសង្គម', 'typo fix'),
    ('/books/ប្រវត្តិវិទ្យា-ថ្នាក់ទ១២', '/books/ប្រវត្តិវិទ្យា-ថ្នាក់ទី១២', 'typo fix'),
    ('/books/កំណែវិទ្យាសាស្ត្រ-សិក្សាសង្គម-ថ្នាក់ទ៳', '/books/កំណែវិទ្យាសាស្ត្រ-សិក្សាសង្គម-ថ្នាក់ទី៣', 'typo fix'),
    ('/books/កម្មវិធីសិក្សាលម្អិត-បំណិនជីវិត-ថ្នាក់ទីឡ-៦', '/books/កម្មវិធីសិក្សាលម្អិត-បំណិនជីវិត-ថ្នាក់ទី១-៦', 'typo fix'),
    ('/books/ពិសោធគីមីវិទ្យា-ភាគ២', '/books/សៀវភៅពិសោធគីមីវិទ្យា-ភាគ២', 're-created record: confirm it is the same work (another edition is fine if it replaced the old record)'),
    ('/books/ឯកសារណែនាំស្តីពីឧបករណ៍ពិសោធ', '/books/សៀវភៅណែនាំស្ដីពីឧបករណ៍ពិសោធ-មន្ទីរពិសោធវិទ្យាសាស្ត្រ', 're-created record: confirm it is the same work (another edition is fine if it replaced the old record)'),
    ('/books/កម្មវិធីសិក្សាលម្អិតវិធីសាស្ត្របង្រៀនគណិតវិទ្យា-១', '/books/កម្មវិធីសិក្សាលម្អិត-មុខវិជ្ជាវិធីសាស្ត្របង្រៀនគណិតវិទ្យា១', 're-created record: confirm it is the same work (another edition is fine if it replaced the old record)'),
    ('/books/កម្មវិធីសិក្សាលម្អិតវិធីសាស្ត្របង្រៀនគណិតវិទ្យា-២', '/books/កម្មវិធីសិក្សាលម្អិត-មុខវិជ្ជាវិធីសាស្ត្របង្រៀនគណិតវិទ្យា២', 're-created record: confirm it is the same work (another edition is fine if it replaced the old record)'),
    ('/books/educational-research-competencies-for-analysis-and-applications-10th-edition', '/books/educational-research-competencies-for-analysis-10th-edition', 're-created record: confirm it is the same work (another edition is fine if it replaced the old record)'),
    ('/books/how-to-design-and-evaluate-research-in-education', '/books/how-to-design-and-evaluate-research-in-education-8th-edition', 're-created record: confirm it is the same work (another edition is fine if it replaced the old record)'),
    ('/books/effective-school-management', '/books/effective-school-management-4th-edition', 're-created record: confirm it is the same work (another edition is fine if it replaced the old record)'),
    ('/books/interviewing-as-qualitative-research', '/books/interviewing-as-qualitative-research-3rd-edition', 're-created record: confirm it is the same work (another edition is fine if it replaced the old record)'),
    ('/books/doing-data-analysis-with-spss', '/books/doing-data-analysis-with-spss-version-18-5th-edition', 're-created record: confirm it is the same work (another edition is fine if it replaced the old record)'),
    ('/books/operations-research-an-introduction-10th-edition', '/books/operations-research-an-introduction-10th-edition-global-edition', 're-created record: confirm it is the same work (another edition is fine if it replaced the old record)'),
    ('/books/book-1781238136253', '/books/សៀវភៅណែនាំស្ដីពីឧបករណ៍ពិសោធ-មន្ទីរពិសោធវិទ្យាសាស្ត្រ', 'July 2026 rename chain; the intermediate slug is dead too'),
    ('/books/book-1781238137178', '/books/សៀវភៅពិសោធគីមីវិទ្យា-ភាគ២', 'July 2026 rename chain; the intermediate slug is dead too'),
    ('/books/book-1781238128375', '/books/កម្មវិធីសិក្សាលម្អិត-មុខវិជ្ជាវិធីសាស្ត្របង្រៀនគណិតវិទ្យា១', 'July 2026 rename chain; the intermediate slug is dead too'),
    ('/books/book-1781238129420', '/books/កម្មវិធីសិក្សាលម្អិត-មុខវិជ្ជាវិធីសាស្ត្របង្រៀនគណិតវិទ្យា២', 'July 2026 rename chain; the intermediate slug is dead too'),
    ('/books/action-research-top-10-2023', '/theses/quality-of-teaching-and-learning-action-research-top-10-cohort-2-2022-2023', 'collection move (book → thesis): confirm'),
    ('/books/action-research-top-10-2025', '/theses/quality-of-teaching-and-learning-21st-century-action-research-top-10-cohort-3-2024-2025', 'collection move (book → thesis): confirm'),
    ('/books/ba-1', null, 'librarian chooses among the three live …-ba-1 syllabi (educational research · pedagogical practicum · pedagogy and teaching)'),
    ('/books/practicum-syllabus-ba-1', null, 'likely the live practicum syllabus …ផ្នែកកម្មសិក្សាគរុកោសល្យ-ba-1: librarian confirms'),
    ('/books/syllabus-pedagogy-ba-1', null, 'likely the live …មុខវិជ្ជាគរុកោសល្យនិងការបង្រៀន-ba-1: librarian confirms'),
    ('/books/educational-research-competencies-for-analysis-and-applications', null, '10th, 11th or 12th edition record, or 410'),
    ('/books/action-research-a-guide-for-the-teacher-researcher', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/action-research-in-practice', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/action-research-in-teacher-education', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/becoming-a-teacher-through-action-research-process-context-and-self-study', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/chapter-12-action-research', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/data-analysis-with-microsoft-excel', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/educational-research-planning-conducting-and-evaluating-quantitative-and-qualitative-research', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/educational-research-quantitative-approaches', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/educational-research-text', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/introduction-to-research-in-education', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/pedagogy-and-practice-teaching-and-learning-in-secondary-schools', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/qualitative-research', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/quantitative-data-analysis-in-education-a-critical-introduction-using-spss', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/research-design-quantitative-qualitative-mixed-methods-arts-based-and-community-based-participatory-research-approaches', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/research-methods-and-statistics', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/student-statistics-challenges-in-data-collection-processes', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/the-skillful-teacher-building-your-teaching-skills', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/កម្មវិធីសិក្សាលម្អិតចំណេះដឹងឯកទេសគណិតវិទ្យា', null, 'no successor found: 410 only if removed deliberately, else Ignore'),
    ('/books/book-1781238127030', null, 'no successor found; its July rename target (the row above) is dead too')
),
judged as (
  select s.path,
         s.suggested_path,
         s.note,
         case
           when s.suggested_path like '/books/%' then exists (
             select 1 from public.books b
              where b.is_published and '/books/' || b.slug = s.suggested_path)
           when s.suggested_path like '/theses/%' then exists (
             select 1 from public.research_reports r
              where r.is_published and '/theses/' || r.slug = s.suggested_path)
           else false
         end as target_live
    from seed s
),
corpus as (
  select count(distinct suggested_path) filter (where target_live) as live_targets
    from judged
)
insert into public.retired_url_queue (path, record_type, title, cause, suggested_path, note)
select j.path,
       'book',
       null,
       'seeded',
       case when j.target_live then j.suggested_path end,
       case
         when j.suggested_path is not null and not j.target_live
           then 'suggested target not live at seed time (' || j.suggested_path || '); ' || j.note
         else j.note
       end
  from judged j
 cross join corpus c
 where not exists (select 1 from public.books b where '/books/' || b.slug = j.path)
   and (j.target_live or c.live_targets >= 10)
on conflict (path) do nothing;
