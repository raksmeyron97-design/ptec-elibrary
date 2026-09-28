# Unified discovery (Koha Phase 9)

**Status (2026-09-28): Stages 9.0 (#265), 9.1 (#266) and its budget
calibration (#267) are live in production and verified; 9.2 (the unified UI)
is built; 9.3 to come.** Design agreed with PTEC on 2026-09-28; stages 9.0 → 9.1
→ 9.2 → 9.3, one pull request each.

One search surface for everything the library holds: e-books, theses, journal
articles and the physical collection that Koha catalogues. This page records
what already existed, what was decided, and the rules the code has to keep.

## What already existed

`/search` was already a unified search. `GET /api/search/native` fans one query
out to six collections — books, theses, journal articles, the **physical
catalogue** (`catalog_books`), learning paths, posts — plus page text, and the
page has a Catalog tab, a "Physical Books" section, facets and autocomplete that
include physical records. Phase 9 does not add a second engine; it makes that
blend honest, robust and first-class.

What production held on 2026-09-28 (public columns, read one request at a time):

| Fact | Consequence |
|---|---|
| 13,429 of 13,429 copies read `available`; availability is not live | No surface may claim a copy is on the shelf until the PMB loans are re-issued in Koha |
| 0 copies have a shelf location; every copy has a call number | The "where" of a print book is its call number (`320.09 ប្រាជ្ញ`) |
| 0 of 2,638 physical records have an ISBN (the PMB export had none); 140 of 1,956 digital books do | No digital ↔ physical "same work" link is possible |
| Digital language is stored as names (`Khmer`/`English`), physical as codes (`km`/`en`); physical category is a DDC class, digital category one of 12 subjects | Facets need folding and a crosswalk |

## Decisions (PTEC, 2026-09-28)

1. **One blended list in "All"**, ranked by relevance, with a format badge on
   every card (E-book · PDF, Print book, Thesis, Journal article, …). An exact
   title / ISBN / call-number match leads.
2. **Availability:** "Ask at the desk for availability" while availability is
   not live. The librarians are re-issuing the PMB loans in Koha; the
   administrator then sets `CATALOG_AVAILABILITY_LIVE=on` (an `.env` switch
   since 9.1 — it was a code constant, which would have needed a deploy).
3. **Subject filter:** the 12 digital categories are mapped onto DDC hundreds
   classes (000–900), so one Subject facet spans both collections.
4. **Khmer typography:** Hanuman, the e-Library's Khmer face — no second font download.
5. **`/catalogs` stays** the shelf browser (DDC navigation, a search that works
   before JavaScript), linking to `/search` and back.
6. **No merging** of digital and physical records, and never by title
   similarity. They stay distinct until Koha records carry ISBNs.
7. **Stage 9.3 is in scope:** the first page of `/search` is server-rendered.

## Stages

| Stage | What | Gate |
|---|---|---|
| **9.0 Measure** | 26 physical labels in the search benchmark (query set v4, categories `phys_*`); a `Server-Timing` header on every search answer (one metric per leg); the benchmark records it. No behaviour change. | Production baseline, both modes |
| **9.1 Honest and robust backend** | Availability honesty on `/search`; the physical leg reads its whole matched set instead of the first 80 by title; one field list for both physical searches; per-leg budgets with a `partial` answer that is never cached and never reads as zero results; an exact call number is identity; every `.or()` built from a reader's words fits the URL; no import-date years on print; parallel autocomplete | Benchmark: no regression overall, physical recall up |
| **9.2 Unified UI** | Scope control (All · Digital · Physical); the blended list, ranked by relevance only across collections; cards and badges; unified facets (Format, Subject by DDC class, Language, Availability, Year); one autocomplete for every search box | e2e, axe, phone + Khmer screenshots, benchmark |
| **9.3 Server-rendered first page** | `/search` answers with results in the HTML, so a phone sees them before the bundle | Same, plus a no-bundle e2e |

## Rules the code keeps

- No surface presents physical availability as live while the flag is off.
- A leg that failed or ran out of time is reported as `partial`, never as zero
  results, and a partial answer is never cached.
- Popularity and recency may reorder results within one collection, never
  across collections: print has no views or downloads by construction, so a
  cross-collection boost would bury it.
- `/search` and `/catalogs` match physical records on one field list
  (`lib/catalogs/match-fields.ts`).
- An `.or()` built from what a reader typed fits the URL
  (`lib/db/postgrest-url.ts`): Kong refuses a request line over 8 KB, and a
  long Khmer title over ten columns used to reach 10 KB and fail.
- Search reads Koha's projection only — never Koha — and no search payload
  carries a barcode.
- Old URLs (`type=catalog`, `format=Print`, `types=`, `subject=`) keep working.
- The Subject filter is ONE DDC class vocabulary over both libraries, 370
  Education on its own; print records take their class from the call number,
  digital books only from a CONFIRMED category mapping
  (`lib/search/subject-class.ts`).

## Baseline (production, 2026-09-28, before any Phase 9 change)

`scripts/search-benchmark/results/production-phase9-baseline{,-depth}-2026-09-28.json`,
query set v4, one request at a time.

| Physical category | Blended "All" view: R@1 / R@10 | Its own Catalog tab (`--depth`): R@1 / R@10 |
|---|---|---|
| Khmer titles (6) | 17% / 83% | 100% / 100% |
| English titles (6) | **0%** / 100% | 100% / 100% |
| Authors (6) | 33% / 100% | 100% / 100% |
| Call numbers (4) | 25% / 50% | **25% / 75%** |
| Typos (4) | 0% / 100% | 100% / 100% |

Digital, unchanged by design: titles 100%, ISBN 100%, author 90%, typo 90% at
R@1 in both modes. Overall client latency p50 745 ms / p95 1.67 s (blended).

Two defects, two stages. **Inside** the physical collection the ranking is
right except for call numbers, which the scorer only credits as "any text"
(weight 8): "395.1 ឈូក" loses to every title containing ឈូក. That is a 9.1
ranking rule. **Across** collections the "All" view lists each type's top four
in a fixed order with the catalogue after the digital types, so an exact print
title ranks behind up to twelve digital rows — the blended list of 9.2.

## Measuring

```bash
npx tsx scripts/search-benchmark.ts --base https://library.ptec.edu.kh          # blended landing view
npx tsx scripts/search-benchmark.ts --base https://library.ptec.edu.kh --depth  # each record's own tab
```

One request at a time (the script waits 2.1 s between queries; production
answers 502 under about six concurrent requests). The table prints a
`(physical)` and a `(digital)` subtotal, and — once the route sends
`Server-Timing` — p50/p95 per leg.

## Stage 9.1 — what changed (2026-09-28)

- **Honest availability.** `CATALOG_AVAILABILITY_LIVE` (`.env`, default off)
  replaces the `CATALOG_AVAILABILITY_IS_LIVE` constant. While it is off,
  `/search` sends no shelf count for print, the availability value is the new
  `physical_held` ("In the library"), the card reads "N copies in the library ·
  Ask at the desk for availability", and the advanced filter offers "In the
  library" instead of "On the shelf now". `physicalAvailability()` REQUIRES
  the switch, so no caller can forget it.
- **The physical leg reads its whole matched set** (`pagedScan`, ordered by
  id), not the first 80 (260 on its tab) by title, and without an exact-count
  query: faster as well as complete.
- **One field list** (`CATALOG_MATCH_FIELDS`) for `/search` and `/catalogs`
  "All fields", most valuable first.
- **Call numbers are identity** in the ranker (250, as an ISBN; a DDC class
  query credits the books filed under it, 120; Khmer digits fold to ASCII).
- **Every leg runs inside a budget** (`lib/search/budgets.ts`); a leg that
  throws, errors or runs out of time is named in `partial`, the page says
  which part of the library could not be searched, and the answer is sent
  `no-store`, never cached and never logged as a zero-result query. No
  synonym or typo guess is offered in place of a collection that did not
  answer. The budgets were set from production's `Server-Timing` (below).
- **URL budget.** The broad pool drops the whole-query token when the query
  has words (it adds no row), orders clauses field by field, and keeps the
  `.or()` under 6,000 encoded characters; `/catalogs` caps its query at 200
  characters.
- **No import-date years** on print records (they were all "2026").
- **Autocomplete** runs its eight lookups at once, each inside 2.5 s.
- Matched-field chips are translated ("ត្រូវនឹង ចំណងជើង", not "Matched
  title"); learning-path result clicks are accepted by `/api/search/click`.

Measured locally (the local catalogue is production's 2,638 records; the 26
physical labels resolve there, the digital ones do not):

| | Before 9.1 | After |
|---|---|---|
| Physical R@1, Catalog tab (`--depth`) | 88% | **100%** |
| Call numbers R@1, both modes | 25% | **100%** |
| Khmer titles found without the typo fallback | 5 of 6 | 6 of 6 |
| Catalogue leg, server time p50 / p95 | 341 / 825 ms | 109 / 250 ms |
| Whole request p50 (Catalog tab) | 555 ms | 246 ms |
| Digital results: non-catalogue top 10 of all 100 digital queries | — | identical to 9.0 |

English print titles still rank behind the digital sections in the "All"
view (R@1 0%): that is the blended list of 9.2, not a 9.1 defect.

Found for 9.2: the Khmer Catalog tab label reads "សៀវភៅក្រុមក្ដារ"; the
format chip prints "Print" in English on the Khmer page; the call-number line
can start with a stray "·" when it wraps.

## Production verification and budgets (2026-09-28)

9.0 went live at 15:03 (Phnom Penh), 9.1 about an hour later. Measured on
production with 9.1 live, both modes, 252 requests one at a time, all answered
(`scripts/search-benchmark/results/production-phase9-9.1-live{,-depth}-2026-09-28.json`):

| | Baseline (morning) | 9.1 live |
|---|---|---|
| Physical R@1, Catalog tab | 88% | **100%** |
| Call numbers R@1, Catalog tab / "All" | 25% / 25% | **100% / 100%** |
| Digital R@1 (both modes) | 90% | 90% (unchanged) |
| Server time per search, p50 / p95 / max | — | 0.30–0.35 s / 0.55–0.61 s / 2.2 s |

Per-leg server time in that quiet run: every leg's p95 ≤ 0.37 s, max 1.03 s
(page text). The budgets are NOT set from those numbers but from a run taken an
hour earlier while production was overloaded by concurrent audits (Lighthouse
and entity verification running against it; 43 requests got no answer, one
query hung for 11 minutes, and the entity-verification job itself timed out).
The slowest answer each leg still COMPLETED there, rounded up to the next
second, is its budget:

| Leg | Quiet p95 / max | Slowest completed under load | Budget |
|---|---|---|---|
| book (and the other five collections) | 0.32 / 0.42 s | 5.9 s | **6 s** |
| catalog | 0.37 / 0.49 s | 0.47 s | 6 s (shares the collections' number) |
| page text | 0.17 / 1.03 s | 3.6 s | **4 s** |
| trigram seeds | 0.17 / 0.24 s | 3.6 s | **4 s** |
| semantic (query embedding) | 0.27 / 0.33 s | 0.32 s | **3 s** |

Cutting at the quiet tail (~1.5 s) would have made every loaded answer partial,
and a partial answer is never cached — more load exactly when there is too
much. At these budgets nothing production actually answered is cut, and a hung
leg ends within seconds instead of holding the request for minutes.
`lib/search/budgets.test.ts` pins that every budget clears these measurements.

## Stage 9.2 — the unified UI (2026-09-28)

- **Scope.** All · Digital library · Physical library, as `scope=` in the URL
  (the Physical library IS the catalogue leg, so an old `type=catalog` link
  lands there). Under All and Digital, the type chips (Books, Theses,
  Journals, Learning Paths, News) narrow the Digital library, as `type=`. A
  scope's count is shown only on a blended answer, which runs every leg.
- **One blended list** in All and Digital, 20 per page, ordered by
  `compareAcrossCollections`: a record the reader NAMED (exact title, ISBN or
  call number) leads whichever library holds it; then relevance ALONE; an
  exact tie puts the e-book first (it can be read now). "Load more" appends.
- **Format badges** on every card — "E-book · PDF" only when a file is there,
  "Print book", "Thesis", "Journal article", "Learning Path", "News" — and
  the raw "Print"/"PDF" chip (English on the Khmer page) is gone. A print
  book's first action is **Where to find it** (`/catalogs/<slug>#where`, the
  card with its call number and availability); its meta line reads "Call no.
  510 GOL · 35 copies in the library · Ask at the desk for availability".
- **Filters:** Format (`types`), Subject (`class`, the DDC classes),
  Language, Availability, Year (hidden in the Physical library — print carries
  no year). The category-name `subject=` still filters for old links and the
  advanced search, but is no longer listed. In the Digital library the
  filters count digital records only.
- **Entry points:** the homepage hero's scope menu offers the Physical
  library; a print suggestion shows its call number beside the author.
- The Khmer name of the catalogue scope is now បណ្ណាល័យរូបវន្ត (it read
  "សៀវភៅក្រុមក្ដារ").

### The subject crosswalk: confirmed, and awaiting review

21 of production's 35 digital categories are mapped (confirmed with PTEC,
2026-09-28). The 14 below map to NOTHING until decided — a book in one of them
is simply under no Subject value, never under a guess:

| Category | Candidate classes |
|---|---|
| ទស្សនវិជ្ជាអប់រំ (philosophy of education) | 370 or 100 |
| បច្ចេកវិទ្យាព័ត៌មាន (information technology) | 000 (DDC puts computing in 004) or 600 |
| វប្បធម៌ (culture) | 300 or 900 |
| សុខភាព (health) | 600 or 300 |
| ស្រាវជ្រាវប្រតិបត្តិ (action research) | 370 or 300 |
| បំណិនជីវិត (life skills) | 600 or 370 |
| វិញ្ញាសាប្រឡង (exam papers) | 370 |
| វិធីសាស្ត្របង្រៀនរូបវិទ្យា (physics teaching methods) | 370 or 500 |
| ស្ថិតិ និងវិភាគទិន្នន័យ (statistics and data analysis) | 500 or 300 |
| ស្រាវជ្រាវ (research) | 000, 300 or 370 |
| ស្រាវជ្រាវបែបគុណភាព (qualitative research) | 300, 000 or 370 |
| អំណានកុមារ (children's reading) | 800 or 370 |
| អប់រំកាយ និងកីឡា (physical education and sport) | 700 or 370 |
| អប់រំសិល្បៈ (arts education) | 700 or 370 |

A decision is one line: move the entry from `CATEGORIES_AWAITING_REVIEW` to
`CATEGORY_SUBJECT_CLASS` in `lib/search/subject-class.ts`.

### Measured

Locally (production's catalogue; the 26 physical labels resolve there), the
blended "All" view: physical R@1 **65% → 100%** (English print titles 0% →
100%, misspelt titles 25% → 100%). Latency could not be judged locally — the
machine was at load average 87 during the run — and 9.2 adds no database work
(the class, the blend and the page are computed in memory), so its latency is
measured on production after deploy.

