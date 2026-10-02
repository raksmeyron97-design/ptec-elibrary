# Journals redesign (2026-10)

The journal page (`/journals/<journal>`) and the admin journal workspace
(`/admin/journals`), rebuilt from a research brief that compared ThaiJO/OJS,
RUPP's CJBAR, Springer journal homepages and PubMed against DOAJ, COPE/OASPA,
Crossref, Google Scholar and schema.org expectations. Architecture of the
underlying model: `docs/JOURNALS-ARCHITECTURE.md`.

## Owner decisions (2026-10-02)

1. **PTEC Library is an index of journals, never their publisher.** No
   editorial board, submissions or peer-review system here; the page links out
   to the publisher for policies (author guidelines, editorial board).
2. **No journal print runs in Koha**, so the page has no holdings block.
3. **Khmer titles of foreign journals stay, flagged as library translations.**
4. **Crossref and the ISSN Portal may prefill journal records.**
5. **PTEC research published elsewhere is recorded as article records.**

## What a journal page answers, in order

| Block | Source | Shown when |
|---|---|---|
| Masthead: title, other official title, translated title + label, publisher · since · frequency, labelled ISSN chips, access chip | `journals` | each fact is present |
| Current issue + its table of contents (`IssueToc`, shared with the issue page) | newest public issue | an issue exists |
| Earlier issues | public issues | more than one |
| More articles | newest articles NOT in the current issue | any remain |
| About + aims and scope | `description`, `aims_scope` | present |
| PTEC authors in this journal | `publication_authors.is_ptec_staff` on published articles | any |
| Rail: At a glance · Quality and access · At the publisher · How to read · On this page | `journals` (0166) and the listed articles' access badges | each fact is present |

ONE grid from the breadcrumb: the rail starts level with the masthead (the
defect #209 fixed on the article page).

## Rules that must keep holding

- **A Khmer title is a name of the journal only when the publisher uses it**
  (`title_km_source = 'official'`). `officialTitleKm()` /
  `translatedTitleKm()` in `lib/journals/types.ts` are the only readers: a
  translation (or an unstated source) is shown with a "Library translation"
  label and is never the H1, the `<title>`, a filter label or a JSON-LD
  `alternateName`.
- **Unknown is not false.** Every 0166 column is nullable or an empty array;
  the page hides a block whose fact is unknown. Only an `open` journal is
  claimed `isAccessibleForFree`.
- **An issue title that only restates its numbering is not shown**
  (`titleRestatesNumbering()`); the admin flags it as it is typed.
- **A DOI is a full `https://doi.org/` link** wherever an article is listed.
- **Prefill is a suggestion.** `lookupJournal()` asks both registries through
  `lib/journals/lookup-server.ts` (fixed hosts, 8 s budget, "unavailable" kept
  distinct from "no record"); the form pre-ticks only values that fill an
  EMPTY field, and nothing is saved until the librarian saves. The ISSN in a
  request URL is rebuilt from parsed digits and a recomputed check digit,
  never copied from input (`issnForRequest()`).
- **One readiness function** (`lib/journals/readiness.ts`) drives both the
  editor's Readiness panel and the list's completeness column.
- **Table-of-contents order is curation.** `publications.issue_position` is set
  only by `set_issue_article_order()` — atomic, refuses a stale page (40001),
  and excluded from `content_versions` like `featured_position`. A librarian's
  position outranks the printed order in `compareArticlesInIssue()`.
- **Covers upload on save, never on pick**, to `publications/journals`; a failed
  upload keeps the existing cover.
- **The deploy window is safe.** Reads retry without the 0166 columns
  (`isMissingColumn()`); a save that sets a 0166 field before the migration
  lands says so (`errorSchemaPending`) instead of dropping it.

## Verification

- Unit: `lib/journals/{types,lookup,readiness,vocab,order}.test.ts`,
  `lib/seo/journal-seo.test.ts`.
- e2e: `e2e/journals.spec.ts` → "journal page: identity, contents and trust".
