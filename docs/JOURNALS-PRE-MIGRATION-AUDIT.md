# Journals migration — pre-migration audit (Phase A)

Date: 2026-09-14. Branch `feat/journals-ia` off `main` @ `758e8a8`.
Nothing in this document was written to any database. Production was read with
the self-hosted service-role key, `SELECT` only, and over plain HTTP.

## 1. The finding that shapes everything else

**Production holds no scholarly articles at all.**

| Table / view (production, self-hosted `supabase.storage-ptec.online`) | Rows |
|---|---:|
| `publications` (published / all) | **0 / 0** |
| `publication_authors`, `publication_affiliations` | 0, 0 |
| `publication_authorships`, `publication_files`, `publication_figures`, `publication_reviews` | 0, 0, 0, 0 |
| `resource_contributors` where `resource_type = 'publication'` | 0 |
| `book_pages` / `book_chunks` / `resource_index_state` for `record_type = 'publication'` | 0 / 0 / 0 |
| `content_versions` where `table_name = 'publications'` | 0 |
| `publication_drafts` (private admin recovery snapshots) | 2 — one titled "Applying Science to Everyday Life", no journal/volume/issue fields; no `publication_id` |
| `public_resource_statistics.publications` | 0 |
| `journals`, `journal_volumes`, `journal_issues` | absent (PGRST205) |

The service key was confirmed to be working and privileged in the same run:
`books` = 727 rows (725 published per `public_resource_statistics`).

Consequences, each of which the rest of the plan relies on:

* **The data backfill is a no-op in production.** There is no journal name to
  normalize, no volume/issue to map and nothing that can be mis-mapped. The
  backfill still has to exist (any other database — a developer's local stack,
  a restore — may hold rows), and it still has to be deterministic, but its
  production blast radius is zero.
* **No article URL has ever been public in production.** `/publications/<slug>`
  has never resolved to a 200 there, so no search engine holds an article URL,
  no citation has been printed with one, and the legacy article redirect
  protects links from the seed/staging world and from anyone who guessed the
  shape — not indexed equity.
* **`/publications` itself is live but thin.** It answers 200 in both locales
  with `noindex, follow` (the `isEmpty` rule in `buildListingMetadata`), is
  absent from `sitemap.xml` (the `hub()` count gate; 1,013 URLs total), is
  allowed in `robots.txt` (`Allow: /publications/`, `Allow: /km/publications/`),
  and the homepage links it three times (mega-menu, collection grid, footer).
  Those links are the only equity the listing has.

The only article data anywhere is the local seed (`supabase/seed.sql` §11),
which CI's `e2e` job and every local `supabase db reset` load:

| Seed journal name (verbatim) | Rows (published) | Volumes / issues | ISSN on rows | `publisher` on rows |
|---|---:|---|---|---|
| `Cambodian Journal of Teacher Education` | 4 (3) | 7/2, 7/1, 6/3, and one draft with none | `2789-0001` ×3, NULL ×1 — **fails the ISSN check digit** | `PTEC Press` |
| `Journal of Chemical Education` | 1 (1) | 102/11 | `0021-9584` (valid) | `American Chemical Society` |
| `Southeast Asian Review of Education` | 1 (1) | 3/1 | NULL | `Southeast Asian Review of Education` |

No whitespace variants, no case variants, no blank names among the seed rows.
The seed CJTE ISSN is a fixture for the "invalid identifier is never
published" rule and must not be promoted onto a journal record.

## 2. Schema (read from the migration chain, not from docs)

`publications` — baseline (`00000000000000_initial_schema.sql` L610) plus
0056 (`publisher`, `isbn`, `subjects`, `table_of_contents`,
`learning_outcomes`, `faqs`), 0085 (`content_revision`), 0086 (`updated_by`),
0092 (`issn`, `metadata_verified*`, `metadata_source`,
`fulltext_redistributable`, `rights_source`), 0112 (`seo_title`,
`seo_description`, `og_image`), 0125 (`allow_download`,
`download_disabled_reason`). Journal facts live on the ARTICLE as free text:
`journal_name text`, `volume text`, `issue_no text`, `issn text`,
`publisher text`. There is no `status` column (verified: `42703` in
production); the lifecycle is `is_published` + `published_at`.

Load-bearing details for this migration:

* **`publications_with_stats` is `select p.*`**, and Postgres freezes that
  column list at CREATE time. 0114 and 0125 each had to drop/recreate it after
  adding a column. New FK columns are invisible to every view reader
  (`getPublications`, AI citation source, retrieval) until it is recreated.
* **`save_publication_atomic` (0085, replaced in 0125) names its columns
  explicitly.** A new column written by the admin workspace is silently
  dropped unless the function is replaced. The workspace writes
  `journal_name`/`volume`/`issue_no`; it cannot write an FK today.
* `publications_capture_version` (0086) snapshots every UPDATE into
  `content_versions` — a trigger that fires on any new column too.
* Contributor identity: `publication_authors` + `publication_authorships`
  (legacy, the read source) and the canonical `contributors` /
  `resource_contributors` graph (0105, `resource_type = 'publication'`).
  Journals must not add a third identity system.
* RLS: `publications` public-read where `is_published`; figures/files mirror
  their parent; writes are service-role after `requirePermission('publications', 'write')`.

## 3. URL inventory

Public routes today:

| Route | Files |
|---|---|
| `/publications` (+ `/km`) | `app/[locale]/(public)/publications/{page,loading}.tsx` |
| `/publications/[slug]` (+ `/km`) | `…/publications/[slug]/{page,loading,error}.tsx` |
| `/api/publications/[slug]/file` | rights-gated file proxy (`resolvePublicationDownloadAccess`) |
| `/api/publications/[slug]/cite` | citation export |
| `/admin/publications{,/new,/edit/[id],/authors}` | admin workspace, 4 route policies in `lib/admin/access-policy.ts` |

**~70 source sites build a `/publications…` URL by hand** (a template string,
not a helper). By area:

* SEO: `lib/seo/publication-seo.ts` (canonical, alternates, collection URL),
  `app/sitemap.ts`, `app/robots.ts`, `app/llms.txt/route.ts`,
  `lib/citations.ts` (`publicationUrl`, used inside printed citations),
  `lib/oai/records.ts` (OAI-PMH identifier URL), `lib/metadata-exports/works.ts`.
* Search: `app/api/search/native/route.ts` (5 sites incl. the fuzzy URL map
  and page hits), `app/api/search/route.ts`, `components/ui/search/useBookSuggestions.ts`.
* AI: `lib/ai/retrieval.ts` (3 sites), `lib/ai/citation-source.ts`.
* Cross-links: `lib/authors/profile.ts` (2), `lib/subjects/index.ts`,
  `app/[locale]/(public)/subjects/[slug]/page.tsx`, `app/actions/learning-paths.ts` (2),
  `app/actions/reading-lists.ts`, `app/actions/subscriptions.ts`,
  `lib/publications/admin-side-effects.ts` (push notification URL),
  `lib/admin/intelligence.ts`, `lib/cache/revalidate.ts`,
  `app/actions/publication-reviews.ts` (`revalidatePath` — English-only, a
  pre-existing no-op per CLAUDE.md).
* UI: `components/layout/digital-library-nav.ts`, `components/layout/Footer.tsx`,
  `components/ui/home/{FeaturedPublications,NewArrivals,RecentlyAdded,SignupCta}.tsx`,
  `components/ui/dashboard/LearningIntent.tsx`, `lib/about/content.ts`,
  `components/ui/publications/*` (card, list item, hero, filters, sidebar,
  related, more-from-journal, more-from-author, reviews login link).
* Admin: `PublicationsClient.tsx`, `PublicationForm.tsx`, `PublicationContext.tsx`
  ("view on site" / slug preview), `ZeroResultTable.tsx`.
* Tests/e2e: `e2e/{smoke,seo,focus-system,resource-stats,abstract-reader}.spec.ts`,
  `lib/seo/publication-seo.test.ts`, `lib/citations.test.ts`,
  `lib/seo/robots-sitemap-policy.test.ts`, `lib/cache/cache-safety.test.ts`,
  `lib/csp.test.ts`, `lib/sw-policy.test.ts`, `lib/about/content.test.ts`,
  `lib/seo/breadcrumbs.test.ts`, `lib/resource-slug-gate.test.ts`.

Journal-level URLs today: **none.** A journal is a filter,
`/publications?journal=<exact journal_name>` (hero chip, "More from this
journal", breadcrumb until SEO V3 D-5 removed it for advertising a filtered
URL). There is no journal, volume or issue page.

Middleware: `/publications/<slug>` is soft-404-gated by
`RESOURCE_GATES.publications` (`lib/resource-slug-gate.ts`). `next.config.ts`
`redirects()` runs before middleware and is where static 301s live
(`lib/seo/subject-slug-redirects.ts` is the precedent, `statusCode: 301`
because `permanent: true` means 308).

## 4. SEO inventory

* Detail: `buildPublicationMetadata` (title/description/OG/Twitter, admin
  overrides from 0112), `publicationJsonLd` (`ScholarlyArticle`, validated
  DOI/ISSN/license, `isPartOf: Periodical {name, issn}` built from the
  article's free text, contributor nodes through the 3.2 graph),
  `lib/seo/citation.ts` (Google Scholar `citation_*`, including
  `citation_journal_title`, `citation_volume`, `citation_issue`,
  `citation_firstpage`/`lastpage`, `citation_issn`, `citation_doi`,
  `citation_pdf_url` → the rights-gated API route), breadcrumbs.
* Listing: `buildListingMetadata` + `publicationsCollectionJsonLd`
  (`CollectionPage` + `ItemList`).
* Sitemap: one entry per published article + the hub, gated on count.
* Neither `Periodical`, `PublicationVolume` nor `PublicationIssue` exists as
  a node with its own `@id` anywhere in the graph.

## 5. Navigation inventory ("Publications" is used for five different things)

| Where | Current meaning | Target |
|---|---|---|
| Header mega-menu, mobile accordion, priority nav, homepage collection grid (`DIGITAL_LIBRARY_ITEMS`) | internal collection | **Journals** (internal) + **Publications ↗** (external, new) |
| Footer "Library" column | internal collection | Journals + Publications ↗ |
| Homepage `FeaturedPublications`, `NewArrivals`, `RecentlyAdded`, `SignupCta` stat | internal articles | Journals / journal articles |
| Search tabs/badges/groups (`search.*Publications`) | internal articles | Journal articles |
| Subjects/authors type labels | internal articles | Journal article |
| `nav.digitalLibraryPublicationsDescription` = "Journals, reports and articles" | internal | rewritten |
| `home.aboutPressTagline` "PTEC Library Press · 30+ Publications", `about.collection.digital.publications` | institutional output | audit individually |
| Admin sidebar, dashboard, roles, storage | admin collection | "Journals" / "Articles" labels; permission resource stays `publications` |
| Many strings using "publication" as a common noun ("Publication year", "Nothing blocks publication") | not the collection | **unchanged** |

The `external: true` flag already exists on `DigitalLibraryItem` (the SVA
Library link), so the external PTEC link needs no new abstraction.

## 6. Search / AI / rights

* Search facets filter on the article's free-text `journal_name`.
* AI evidence for articles: retrieval hydrates `publications_with_stats`; the
  APA citation (`publicationToCitationWork` → `apa()`) already renders
  `Journal, Volume(Issue), pages. DOI` from the legacy text columns. With 0
  articles indexed in production, the AI benchmarks contain no article
  questions; they cannot move either way from this change. Keeping the legacy
  text columns in sync with the canonical rows keeps every one of these
  consumers correct without touching them.
* Rights: `resolvePublicationDownloadAccess` (`lib/publications/access.ts`) is
  the only gate and lives behind `/api/publications/[slug]/file`. The file API
  path is not part of the information architecture and does not need to move;
  moving it would create a second gate path for no gain.

## 7. Risks and how the plan answers each

| Risk | Mitigation |
|---|---|
| Journal URL embedded in the article URL makes the article URL depend on a mutable assignment (a corrected journal mapping would move the article and chain redirects behind `/publications/x`) | Article canonical is `/journals/articles/<slug>`: the slug never changes, the hierarchy lives in breadcrumbs and JSON-LD `isPartOf`, and the legacy redirect is one static hop with no DB lookup |
| New columns invisible through `publications_with_stats` | Recreate the view in the same migration (the 0114/0125 precedent) |
| Admin workspace RPC cannot write FKs | FKs are **resolved by trigger** from the text the workspace already writes; the RPC is untouched |
| `created_at` ordering in migrations breaks hosted (`hosted-migration-chain-drift`) | No `order by`/filter on any `created_at` |
| Case/whitespace variants silently merged | Journal match key is trim + whitespace-collapse + case-fold only; two names that fold together but are not byte-identical after trim/collapse are **ambiguous**, never auto-created, and reported |
| `/publications` → `/journals` redirect chain through `/en` stripping | Explicit `/en/publications*` rules in `next.config` (which runs before middleware) |
| Orphan / cross-journal issues | Composite foreign keys `(volume_id, journal_id)` and `(issue_id, journal_id)`; issue pages only for issues with ≥1 published article |
| External "Publications" confused with the collection | Distinct label ("Publications ↗"), distinct description, `external: true`, never routed through `/publications` |

**Destructive ambiguity found: none.** Proceeding to Phase B.
