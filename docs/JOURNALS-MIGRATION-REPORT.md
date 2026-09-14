# Journals migration — report

Branch `feat/journals-ia`. Architecture: `docs/JOURNALS-ARCHITECTURE.md`.
Audit: `docs/JOURNALS-PRE-MIGRATION-AUDIT.md`. Every number below was measured
on 2026-09-14; where a number could not be measured it says so.

## Status

| Stage | State |
|---|---|
| Code, tests, docs | done on the branch |
| Local stack (migration + seed) | applied and verified |
| Production database (0148) | **NOT applied** — applied on the box by `infra/supabase/scripts/migrate.sh` during deploy, after merge |
| Production deploy | **NOT done** — no production HTTP verification of the new routes has been performed |

## Before → after

### Production data (self-hosted DB, read-only)

| | Before | After |
|---|---:|---:|
| `publications` rows (published) | 0 (0) | — not deployed |
| journals / volumes / issues | tables absent | — |
| `scripts/journals-mapping-report.ts` | `0148: absent`, 0 articles, 0 distinct journal names | — |

Because production holds no articles, the 0148 backfill will create 0
journals and map 0 articles there. The first production journal will be one
an admin creates in `/admin/journals`.

### Local stack (seed data + 0148)

| | Value |
|---|---:|
| Backfill on the pre-seeded DB | 3 journals created, 6 of 6 articles mapped |
| Re-run of the whole migration | 0 created, 0 mapped (idempotent) |
| Fresh DB → migration → seed (CI's order) and pre-seeded DB → migration → seed | identical end state: 4 journals (3 published), 4 volumes, 6 issues, 5 public issues |
| `journal_mapping_report` | mapped 6 / partial 0 / invalid 0 / ambiguous 0 / unmapped 0 |
| Integrity (article FK missing, volume in other journal, issue in other journal, issue in other volume, orphan volume, orphan issue, issue-volume in other journal, public issue with no published article) | all **0** |
| Rejected by the database, tested in a rolled-back transaction | issue from another journal (`publications_volume_in_journal`), issue from another volume (`publications_issue_in_volume`), alias colliding with another journal's title (`23505`) |

### Live production HTTP (before)

| URL | Status | Notes |
|---|---|---|
| `/publications`, `/km/publications` | 200 | `noindex, follow` (empty collection) |
| `/publications/<slug>` | 404 | edge gate — no article has ever been public |
| `/journals` | 404 | |
| sitemap | 1,013 URLs, none under `/publications` | hub gated on count |
| robots.txt | `Allow: /publications/`, `Allow: /km/publications/` | |
| homepage links to `/publications` | 3 | menu, collection grid, footer |

### Branch HTTP (production build, `next start`, local stack)

| URL | Status |
|---|---|
| `/publications`, `/en/publications` | 301 → `/journals` |
| `/km/publications` | 301 → `/km/journals` |
| `/publications/<slug>`, `/en/publications/<slug>` | 301 → `/journals/articles/<slug>` |
| `/km/publications/<slug>` | 301 → `/km/journals/articles/<slug>` |
| `/publications?journal=<name>` | 301, query kept; the name still filters |
| `/journals/articles` | 301 → `/journals` |
| `/journals`, `/journals/<j>`, `/…/issues`, `/…/issues/<i>`, `/journals/articles/<slug>` (both locales) | 200 |
| empty issue, unpublished journal, draft article, unknown journal/issue/article | **404** (real, from the edge gate) |

Every redirect is one hop to a 200 (asserted in `e2e/journals.spec.ts`).
`robots.txt` now allows `/journals/` and `/km/journals/`. The sitemap
advertises the journal, issues list, issue and article URLs and no
`/publications` URL; the empty issue and the unpublished journal are absent.

### SEO (branch, article page)

Canonical `…/km/journals/articles/<slug>`, reciprocal `en`/`km`/`x-default`
hreflang; every `citation_*` tag present with unchanged values
(`citation_journal_title`, `_volume`, `_issue`, `_firstpage`, `_lastpage`,
`_doi`, `_publisher`, `_pdf_url` → the unchanged rights-gated API route); the
fixture ISSN that fails its check digit is still withheld. JSON-LD
`ScholarlyArticle.isPartOf` = `PublicationIssue (#issue)` →
`PublicationVolume (#volume-7)` → `Periodical (#periodical)`, ids equal to
those the journal and issue pages declare. Breadcrumb: Home › Journals ›
Journal › Vol. 7, No. 2 › article.

## Tests

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `eslint` on every changed file | 0 errors (15 `no-explicit-any` warnings, all in pre-existing lines of files touched) |
| `npx vitest run` | **6,482 passed**, 89 skipped, 0 failed (308 files) |
| `npm run build` (from `rm -rf .next`) | passes; one pre-existing Edge-runtime warning |
| `e2e/journals.spec.ts` + `smoke` | 28 / 28 (dev); with `digital-library-nav` + `seo`: 50 passed, 1 pre-existing skip (production build) |
| wider e2e (`seo`, `a11y`, `overflow`, `resource-stats`, `focus-system`, `search-facets`, `abstract-reader`, `digital-library-nav`) | first run at load average 52–67: 65 passed, 14 failed — 13 timeouts / closed contexts; re-run serially: all pass except one real failure, `resource-stats` `/journals` count, caused by the new journal shelf's "3 articles" text matching the count parser first. The assertion now reads the toolbar's live count region; suite 10 passed, 1 pre-existing skip |

New invariant tests: `lib/journals/urls.test.ts` (source scan for hand-written
`/publications` URLs over 1,400+ files, one-hop redirects, nav/footer/grid
external link), `lib/journals/mapping.test.ts` (SQL/TS match-key parity,
migration additive/no `created_at`/composite FKs/no journal creation in the
trigger/no orphan issue), `lib/journals/order.test.ts`,
`lib/journals/sitemap.test.ts`, `lib/seo/journal-seo.test.ts`. Existing
invariant tests extended: `cache-safety` (an EXACT exemption for `/journals`
so the journal and issue pages must stay shared-cached), `resource-slug-gate`,
`authorization-boundary`, `ui-capabilities`.

## Search / AI

| Benchmark | main | branch |
|---|---|---|
| `npm run ai:benchmark` (offline, deterministic) | baseline run | identical to main excluding timing |
| `npm run retrieval:benchmark` (live corpus, read-only; 98 questions) | R@5 81%, top-1 73%, isolation 100%, no-evidence 100%, citation 70% | **identical** (JSON equal excluding timing) |
| `npm run search:benchmark` | not run | not run — its 90 queries run over books; the only search code changed is the article leg's candidate filter (`doi`, `issn`), which runs over the 0 articles production holds |

Search: a DOI (`10.5281/zenodo.9000001`) and an ISSN (`0021-9584`) now find
their article (measured on the branch only; not compared against main). The answer-benchmark contains no
journal-article questions (production has none), so it cannot move.

## Known warnings

* **The mobile-glass branch** (`feat/mobile-glass-ui-wt`, unmerged) adds a
  tab bar and sheets; any `/publications` link it adds will fail
  `lib/journals/urls.test.ts` after this merges — the fix is `articlePath()` /
  `JOURNALS_PATH`.
* The `/journals` listing still facets all published articles in memory (the
  pre-existing design, institutional scale). Journal and issue pages are
  bounded.
* The global `/search` page has no journal facet; journal filtering lives on
  `/journals`.
* Admin copy in `/admin/publications` is English-only, as it was.
* The local Supabase stack used by every checkout on this machine now has
  0148 applied (additive).

## Rollback

See `docs/JOURNALS-ARCHITECTURE.md` §9: revert the app commits (0148 is
inert to the old code — the trigger keeps the text columns exactly as it
expects); drop the schema only via the commented block in the migration.
