-- 0145_books_language_normalization.sql
--
-- `books.language` is free text and production held FIVE spellings of TWO
-- languages (measured 2026-09-13, 296 published books):
--
--     Khmer   157      English  102
--     kh       35      en         1      khmer  1
--
-- The upload form has only ever offered "Khmer" and "English", so this did not
-- come from the UI — an import path wrote raw codes, and "kh" is not even the
-- ISO code for Khmer (that is "km").
--
-- WHY IT MATTERS, MEASURED
-- ────────────────────────
-- `languageCode()` mapped khmer / km / english / en and NOT kh, so 35 published
-- books — 11.8% of the catalogue — emitted no `inLanguage` at all in their Book
-- JSON-LD. Verified on the live site before this migration:
--
--     /books/រុក្ខវិទ្យា-1            inLanguage absent
--     /books/ប្រជុំកំណាព្យ-១០១        inLanguage "km"
--
-- Two identical Khmer books, one machine-readable. The facet sidebar had the
-- same fracture from the other side: the chip label IS the stored string, so
-- one language appeared as three separate filters.
--
-- WHY THIS IS SAFE FOR URLS
-- ─────────────────────────
-- The stored value is also the `?language=` filter value, so a rename would
-- retire a filtered URL — if those were indexed. They are not: verified live,
-- `/books?language=kh` returns `noindex, follow` and canonicalises to `/books`
-- (docs/SEO-V3-PARAMETER-POLICY.md). No indexed URL depends on these values,
-- and a bookmarked filter degrades to an empty result rather than a 404.
--
-- WHAT IT DELIBERATELY DOES NOT DO
-- ────────────────────────────────
-- `catalog_books.language` uses ISO-ish codes (km/en/fr/zh/other) and is left
-- alone. That is correct for a MARC-shaped physical catalogue, while
-- `books.language` is a DISPLAY string rendered to readers and used as the
-- facet label. Unifying them would change what a reader sees and what every
-- existing filter matches, for no gain.
--
-- It also does not touch a value it does not recognise. A French book stays
-- "French"; folding the unknown into a default is how 35 books came to claim a
-- language nobody recorded. Only the aliases below are rewritten.
--
-- Idempotent: re-running changes nothing once the values are canonical.
-- The application normalises on write (lib/books/language.ts), so this is a
-- one-time repair of history rather than a recurring sweep.

do $$
declare
  updated_khmer   int := 0;
  updated_english int := 0;
  remaining       int := 0;
begin
  -- Khmer: every spelling an import has produced or plausibly could.
  update public.books
     set language = 'Khmer'
   where language is not null
     and lower(btrim(language)) in ('kh', 'km', 'khmer', 'kmr', 'km-kh', 'cambodian', 'ខ្មែរ', 'ភាសាខ្មែរ')
     and language <> 'Khmer';
  get diagnostics updated_khmer = row_count;

  update public.books
     set language = 'English'
   where language is not null
     and lower(btrim(language)) in ('en', 'eng', 'english', 'en-us', 'en-gb', 'អង់គ្លេស', 'ភាសាអង់គ្លេស')
     and language <> 'English';
  get diagnostics updated_english = row_count;

  -- Anything still outside the canonical vocabulary is REPORTED, never
  -- rewritten: it is either a language this library genuinely holds and has no
  -- canonical spelling for yet, or a data-entry error a human should see.
  select count(*) into remaining
    from public.books
   where language is not null
     and btrim(language) <> ''
     and language not in ('Khmer', 'English');

  raise notice 'books.language normalized: % -> Khmer, % -> English; % row(s) left outside the canonical vocabulary (reported, not rewritten)',
    updated_khmer, updated_english, remaining;
end $$;
