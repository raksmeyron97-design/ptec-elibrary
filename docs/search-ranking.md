# PTEC Search Ranking (Search Intelligence 2)

The global `/search` page calls `/api/search/native`. The route only BUILDS
candidates; everything that decides how a result scores, how a list is
ordered and what "the same text" means lives in `lib/search/`, is pure, and
is exercised directly by the unit tests and by the benchmark:

| Module | Owns |
|---|---|
| `lib/search/normalize.ts` | the one normalization pipeline (text, tokens, ISBN, typo tolerance) |
| `lib/search/ranking.ts` | the relevance model (`searchScore`), every sort mode (`compareBySort`), `RANKING_WEIGHTS` |
| `lib/search/availability.ts` | the availability vocabulary and the language fold |
| `lib/search/facets.ts` | in-memory faceting over the candidate pool |
| `lib/discovery/related-score.ts` | "related resources" for detail pages |

`lib/search/ranking.test.ts` scans the route and fails if it grows a scorer,
sorter or normalizer of its own again.

## The relevance model

Strongest signal first. Weights are `RANKING_WEIGHTS` in `lib/search/ranking.ts`;
the numbers below are copied from there.

| Signal | Weight | Reported as |
|---|---|---|
| Exact title | 260 | `title` |
| Exact ISBN (query is an ISBN, any form) | 250 | `isbn` |
| Title starts with the query | 190 | `title` |
| Title contains the query | 145 | `title` |
| Exact author | 125 | `author` |
| Exact subject / category / program | 100 | `subject` |
| Author contains the query | 96 | `author` |
| Subject contains the query | 74 | `subject` |
| Keywords / tags contain the query | 60 | `keywords` |
| Abstract / description contains the query | 30 | `abstract` |
| Per-term partial credit (each term of a multi-word query) | title 22 · author 18 · subject 14 · keywords 10 · abstract 6 | same field |
| Term one typo from a title word (Latin only) | 16 | `title` |
| PDF page-text hit on this record | 42 | `pdf` |
| Whole query somewhere in the record, nothing else matched | 8 | `text` |

`matchedFields` on every result is the "why this result" list: the fields
above that fired, and `curated` for a librarian pin. No numeric score is shown.

Two rules are structural rather than tuning:

**Relevance dominates popularity.** Views (max 8), downloads (max 10),
rating (max 7.5) and recency (max 5) are summed and then capped at
`POPULARITY_CAP_RATIO` (25%) of the relevance score they ride on. A record
that matched nothing gets no boost at all; a heavily-viewed weak match can
reorder only within a narrow band of equally-weak matches and can never
overtake a stronger field match. Pinned by "never lets a popular weak match
overtake an unpopular strong match" in `ranking.test.ts`.

**Every sort is a total order.** `relevance` (the default) orders by score,
then views, then record id; `newest`/`oldest`/`title`/`views`/`downloads`/
`rating` order by their own key, then score, then id. Two requests for the
same page return the same page. The legacy aliases `most_viewed`,
`most_downloaded`, `top_rated` still parse.

## Normalization

`normalizeSearchText()` is `normalizeTitle()` from
`lib/books/duplicate-detection/normalize.ts` — the ingestion gate's own rule,
so a title the upload gate recognises is one the search box finds:

- NFKD, then only LATIN combining diacritics stripped ("Zoë" = "Zoe").
  Khmer vowel signs and subscripts are combining marks that carry meaning and
  survive untouched. Nothing is transliterated.
- Case-folded; every run of punctuation/whitespace collapses to one space
  ("Introduction-to-Psychology" = "introduction to psychology").
- Applied identically to the query and to every field, so the two sides
  always agree. The raw query is untouched for display and analytics.

A multi-word query is scored as a PHRASE (the whole-query rows above) and as
TERMS (per-term partial credit), whole query first, words of ≥ 2 characters,
capped at `MAX_QUERY_TOKENS` (8). Khmer has no word boundaries, so a Khmer
query is one token — the phrase path. Phrase credit always outranks the sum
of term credit for the same fields, so an exact phrase stays on top.

### ISBN

`queryIsbn()` recognises a query that IS an ISBN — hyphenated, spaced, bare,
ISBN-10 or ISBN-13 — and never a title that merely contains digits ("SPSS
16.0"). Matching canonicalises to ISBN-13 (`normalizeIsbn`, lenient on the
check digit, shared with the duplicate gate). The database is asked with a
loose pattern (a wildcard between every digit, so "978-1-4739-4629-3" and
"9781473946293" both hit) and every row it returns is confirmed in memory;
in ISBN mode, rows with no confirmed ISBN are not results. The advanced
search's ISBN field accepts a whole ISBN in any form or a partial one.

### Typos

Inside a non-empty result set, a Latin term of ≥ 4 characters that matched
nothing anywhere earns `termTitleFuzzy` when it is within
`typoTolerance()` edits (1 for 4–7 characters, 2 for ≥ 8) of a word in the
title. Khmer terms get no edit-distance credit — character distance between
Khmer "words" is noise. Separately, the trigram RPC `search_library_fuzzy`
(0059/0110) nominates up to 12 look-alike titles into the candidate pool on
every request (`fuzzyCandidateIds`), so a misspelt title is scored by the
same model as everything else instead of surfacing only when the whole
search came back empty. The zero-result fallback (synonyms, then the same
RPC as a replacement result list with `didYouMean`) is unchanged.

## Candidate pools

Each type's broad pool is the token `ilike` fan-out, ordered by popularity
and capped (80 on the all tab, 260 on a type tab). That order is what made an
unpopular EXACT title vanish: "research" matches most of the collection, and
the row the reader wanted was cut before scoring. A second pool of
whole-query matches on the decisive fields (title, author, subject, ISBN
keys, trigram seeds; `PHRASE_POOL_LIMIT` 40) is fetched in parallel and
merged by id. The exact count remains the broad query's, reconciled with
what was actually scored.

## Availability

One value per row, from `lib/search/availability.ts`, each derived from a
fact the row already carries — never inferred:

| Value | Source |
|---|---|
| `downloadable` | file present AND the same download decision the gated route makes (`bookDownloadAllowed`, `resolveDownloadAccess`) |
| `read_online` | file present, download refused by policy; posts and learning paths |
| `metadata_only` | no file |
| `physical_available` | `catalog_books.copies_total > 0` and `copies_available > 0` |
| `physical_unavailable` | copies exist, none available |
| `physical_record` | no copy counters |

Catalog results also carry `copiesAvailable`, `copiesTotal` and
`shelfLocation`, and the card shows "N of M copies · Shelf X" only when the
record states them. There is deliberately NO link between a digital book and
a physical catalog row: no such key exists in the schema, and a name match
would put the wrong shelf under the wrong book. Old links and the advanced
modal's umbrella `digital` map onto this vocabulary
(`canonicalAvailabilitySelection`). Language facet values are folded
(`canonicalLanguage`): the collection stores "English", "en", "Khmer", "kh"
and "khmer".

## Facets

`lib/search/facets.ts` is unchanged in shape: AND across dimensions, OR within
one, computed in memory over the candidate pool already fetched (no extra
queries), with a dimension's own counts ignoring its own selection. Wire
format: comma-separated values in `types`, `subject` (legacy alias
`category`), `lang`, `year`, `availability`.

## Related resources

`lib/discovery/related-score.ts`: same subject (40) > same author (35, exact
normalized identity via `personNameKey`) > shared tags (8 each, capped 24) >
same language (5) > same type (3). Popularity is a tie-break only; a resource
is never related because it is popular. Semantic similarity is deliberately
absent — it would cost an embedding per page view. The book page's rail draws
from two bounded pools (same department/category, same author) and captions
the rail with the signals that placed the books there.

## PDF text

`book_pages` (0066) holds per-page text; the route's `searchPageContent()`
finds verbatim hits and re-checks the parent is published before returning
them. A hit on a record's pages adds the `pdf` bump to that record; hits whose
parent matched no metadata are listed under "found inside". Semantic
passages (`book_chunks`, 0082) ride along when an embedding is available and
fail open on quota. Indexing state, staleness and the backfill runbook:
`docs/DISCOVERY-DATA-QUALITY.md`, `docs/INDEX-STATE-MODEL.md`.

## Benchmark

`npm run search:benchmark` (`scripts/search-benchmark.ts`) runs a fixed,
hand-labelled query set (`scripts/search-benchmark/queries.json`: English,
Khmer and mixed titles, authors, subjects, typos, ISBN forms, verbatim PDF
phrases — 90 queries over the real published collection) as a black-box HTTP
client and reports Recall@1/5/10, MRR, zero-result rate, fuzzy-fallback rate
and client latency per category. `--compare <file>` prints deltas;
`--base <url>` targets another server; `--category <name>` runs one
category. The User-Agent names a bot so the route's analytics filter keeps
benchmark traffic out of `search_queries`. Named runs are committed under
`scripts/search-benchmark/results/`; timestamped runs are ignored.

Do not claim a ranking change helped without running it.

## Analytics

Public query logs are written to `search_queries`; result clicks to
`search_result_clicks`. `/admin/search-insights` reports top keywords,
zero-result searches and their rate, most-clicked results, click conversion,
Khmer vs English usage, and daily/weekly/monthly trends. Analytics data never
changes ranking on its own: only librarian-authored `search_synonyms` (applied
on zero results) and `search_curated_results` (pinned ahead of organic hits)
do.
