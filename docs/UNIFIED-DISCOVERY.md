# Unified discovery (Koha Phase 9)

**Status (2026-09-28): Stage 9.0 (measurement) in progress.** Design agreed
with PTEC on 2026-09-28; stages 9.0 → 9.1 → 9.2 → 9.3, one pull request each.

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
| 13,429 of 13,429 copies read `available`; `CATALOG_AVAILABILITY_IS_LIVE` is `false` | No surface may claim a copy is on the shelf until the PMB loans are re-issued in Koha |
| 0 copies have a shelf location; every copy has a call number | The "where" of a print book is its call number (`320.09 ប្រាជ្ញ`) |
| 0 of 2,638 physical records have an ISBN (the PMB export had none); 140 of 1,956 digital books do | No digital ↔ physical "same work" link is possible |
| Digital language is stored as names (`Khmer`/`English`), physical as codes (`km`/`en`); physical category is a DDC class, digital category one of 12 subjects | Facets need folding and a crosswalk |

## Decisions (PTEC, 2026-09-28)

1. **One blended list in "All"**, ranked by relevance, with a format badge on
   every card (E-book · PDF, Print book, Thesis, Journal article, …). An exact
   title / ISBN / call-number match leads.
2. **Availability:** "Ask at the desk for availability" while
   `CATALOG_AVAILABILITY_IS_LIVE` is `false`. The librarians are re-issuing the
   PMB loans in Koha; the admin turns the flag on when that is done.
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
| **9.1 Honest and robust backend** | Availability honesty on `/search`; the physical leg reads its whole matched set instead of the first 80 by title; one field list for both physical searches; per-leg budgets set from 9.0's timings, with a `partial` answer that is never cached and never reads as zero results; no import-date years on print; fair cross-collection ranking (a pure rule, applied in 9.2); parallel autocomplete | Benchmark: no regression overall, physical recall up |
| **9.2 Unified UI** | Scope control (All · Digital · Physical); the blended list; cards and badges; unified facets (Format, Subject by DDC class, Language, Availability, Year); one autocomplete for every search box | e2e, axe, phone + Khmer screenshots, benchmark |
| **9.3 Server-rendered first page** | `/search` answers with results in the HTML, so a phone sees them before the bundle | Same, plus a no-bundle e2e |

## Rules the code keeps

- No surface presents physical availability as live while the flag is off.
- A leg that failed or ran out of time is reported as `partial`, never as zero
  results, and a partial answer is never cached.
- Popularity and recency may reorder results within one collection, never
  across collections: print has no views or downloads by construction, so a
  cross-collection boost would bury it.
- `/search` and `/catalogs` match physical records on one field list.
- Search reads Koha's projection only — never Koha — and no search payload
  carries a barcode.
- Old URLs (`type=catalog`, `format=Print`, `types=`) keep working.

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
