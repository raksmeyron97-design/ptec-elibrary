-- 0160_thesis_bilingual_contents.sql
--
-- Thesis record, bilingual and with its own table of contents
-- (docs: the thesis-page design system, "Data structure").
--
--   title_km, abstract_km   The Khmer title and abstract, beside the record's
--                           own `title` / `abstract`. Named as publications
--                           name theirs (`publications.title_km`, 0085) so
--                           the two collections read the same way: one
--                           primary field, one Khmer field. Empty means "no
--                           Khmer version recorded", never "the same text" —
--                           the page does not repeat a title in its own
--                           language.
--
--   table_of_contents       The thesis's chapters as printed, confirmed by a
--                           librarian: an array of
--                             { level: 1 | 2, number?: text, label: text,
--                               page?: text }
--                           `page` is the page number AS PRINTED ("iv", "27",
--                           "២៧"), not a PDF page index — front matter is
--                           numbered in roman numerals and a printed page is
--                           what a reader holding the copy looks for. The
--                           admin form can draft it from the indexed contents
--                           page (lib/theses/contents.ts); nothing reaches
--                           this column without a librarian saving it.
--
-- Additive and nullable: every existing reader, writer and the e2e seed keep
-- working untouched. No new table, so `research_reports`' existing RLS
-- policies govern the new columns.

alter table public.research_reports
  add column if not exists title_km          text,
  add column if not exists abstract_km       text,
  add column if not exists table_of_contents jsonb;

-- Shape, not content: the save path sanitises every entry
-- (lib/theses/contents.ts `sanitizeContents`); this only refuses a value no
-- reader could render. 300 entries is ~10x the longest thesis contents page
-- measured, and bounds what a hand-edited request can store.
alter table public.research_reports
  drop constraint if exists research_reports_table_of_contents_shape;
alter table public.research_reports
  add constraint research_reports_table_of_contents_shape check (
    table_of_contents is null
    or (
      jsonb_typeof(table_of_contents) = 'array'
      and jsonb_array_length(table_of_contents) <= 300
    )
  );

comment on column public.research_reports.title_km is
  'Khmer title (publications.title_km precedent). Null = none recorded.';
comment on column public.research_reports.abstract_km is
  'Khmer abstract. Null = none recorded.';
comment on column public.research_reports.table_of_contents is
  'Librarian-confirmed contents: [{level: 1|2, number?, label, page? (as printed)}].';
