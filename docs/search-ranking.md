# PTEC Search Ranking

The global `/search` page uses `/api/search/native` for fast academic search across:

- E-books
- Theses
- Publications
- Physical catalog records
- News/posts
- Indexed PDF page text

## Ranking Signals

Results are collected from each public resource table, filtered for public visibility, then scored server-side.

Primary relevance weights:

- Exact title match: highest priority
- Title prefix/contains match: very high priority
- Author match: high priority
- Subject/category/program match: high priority
- Keywords/tags/subjects match: medium priority
- Abstract, description, excerpt, and body text match: medium-to-low priority
- PDF page-text match: meaningful boost when extracted text contains the query

Secondary ranking boosts:

- Views: small popularity boost
- Downloads: small popularity boost
- Real ratings: small boost, only when reviews exist
- Recency: small boost so new resources are discoverable without overwhelming relevance

Sort modes override the final ordering after relevance scores are computed:

- `relevance`
- `newest`
- `oldest`
- `title`
- `views`
- `downloads`
- `rating`

## Khmer And English

Search uses normalized Unicode text and trigram-backed `ILIKE` matching. It searches English and Khmer title/abstract fields where those fields exist, especially for publications. Khmer query analytics are detected by Khmer Unicode codepoints and reported in the admin dashboard.

## Typo Tolerance

If exact native matching returns no results and no filters are active, `/api/search/native` calls the PostgreSQL trigram RPC `search_library_fuzzy`. Migration `0080_advanced_search_engine.sql` extends that fallback to publications.

## PDF Text Indexing

`lib/pdf-page-index.ts` extracts text from uploaded PDFs using `pdfjs-dist` and stores per-page text in `book_pages`.

Indexed record types:

- `book`
- `research`
- `publication`

The search API always re-checks the parent resource is public before returning a page-text hit, so private/admin-only files are not exposed.

Index refresh points:

- E-book create and PDF replace
- Thesis create and PDF replace
- Publication create and PDF replace
- Delete actions remove stale `book_pages` rows
- `scripts/extract-pdf-text.ts` backfills or repairs existing rows

## Analytics

Public query logs are written to `search_queries`; result clicks are written to `search_result_clicks`.

The admin dashboard at `/admin/search-insights` reports:

- Top searched keywords
- No-result searches
- Most clicked results
- Click conversion rate
- Popular subject-like searches
- Missing book request signals from failed searches
- Khmer vs English usage
- Daily, weekly, and monthly trends
