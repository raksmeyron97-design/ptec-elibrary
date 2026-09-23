# SEO Corpus Audit — September 2026

**Type:** audit and diagnosis only. No application code, data, configuration,
migration or deployment was changed. This file is the only repository change.

**Measured:** 2026-09-23, against `https://library.ptec.edu.kh`, at commit
`2bf0849` (`main` at the time of the audit).

**Scope:** the book corpus, author and subject entity quality, Google Search
Console readiness, and whether any of those findings conflict with the
existing SEO architecture (canonical, hreflang, metadata, Open Graph,
structured data, robots, sitemap, pagination, indexability, internal links,
EN/KM routing).

### Evidence labels

| Label | Meaning in this document |
|---|---|
| **VERIFIED_PRODUCTION** | Read from the live site with an HTTP GET on 2026-09-23 |
| **VERIFIED_CODE** | Read in the repository at `2bf0849`, with file:line |
| **VERIFIED_LOCAL** | The repository's own pure functions, run locally over production-derived data |
| **VERIFIED_DATA** | Not used. This audit had no database credentials; see §13 |
| **INFERRED** | Computed or reasoned from verified inputs, but not observed directly |
| **UNKNOWN** | Could not be established. Never counted as a failure |

Where two sources disagree, both are given and the disagreement is named.

---

## 1. Executive summary

The SEO **plumbing** is sound in production. All 2,267 sitemap URLs answer
200, `index, follow`, and a self-referencing canonical. Every one is reachable
by clicking from `/`. The EN/KM hreflang pairs are reciprocal and include
`x-default`. Every non-sitemap URL the crawl reached is `noindex`, except
`/books?page=N`, which is excluded by design.

The **content and entity layer** under that plumbing has four measured
problems. They are listed in order of value per unit of effort.

1. **The subject index and author directory are built from about half the
   library** (P1, VERIFIED_PRODUCTION). Several unpaged reads are silently
   clipped at PostgREST's 1,000-row `max_rows`.
   - **Subjects:** the e-book counts on all 34 subject pages add up to exactly
     **1,000**, but the books themselves carry **1,955** subject assignments.
     Mathematics shows 153 and holds 440; Health shows 18 and holds 68.
   - **Wrong indexing decisions:** the depth gate that picks subjects for the
     sitemap runs on these clipped counts. At least 4 subjects are held at
     `noindex`, and 1 is dropped from the hub, even though their real counts
     clear the ≥5-resource bar. The full-text half of the gate was not
     observable, so whether they would pass overall is UNKNOWN.
   - **Authors:** the same defect in the author directory leaves **223 author
     pages** answering `200 index, follow` while absent from the sitemap, from
     `/authors`, and from their own books. It also leaves **435 books (22%)**
     with a visible byline but no author link.
   - **Largest author page:** the Ministry of Education's page stops at
     exactly "1000 works shown" of 1,037.
   - **Homepage:** the "Browse by Subject" tiles are built the same way.
     Science reads "256 items" against 749 books; Mathematics reads 142
     against 369.
2. **76% of book descriptions are fill-in-the-blank templates** (P1,
   VERIFIED_PRODUCTION).
   - 1,483 of 1,956 descriptions are identical to at least one other once the
     title, the subject name and digits are masked. They fall into 62
     templates.
   - One template, "សៀវភៅ «…» គឺជាឯកសារជំនួយស្មារតី និងការសិក្សាស្រាវជ្រាវដ៏មានសារៈសំខាន់…"
     ("The book «…» is an important study aid and research resource…"),
     carries 1,043 books on its own.
   - These descriptions are the only per-book prose on the page, and 1,949 of
     the 1,956 meta descriptions are cut to them at 157 characters.
   - No rule in the codebase measures this. The catalogue
     "derived-description" rule would flag **0** of the 1,483 even if it were
     applied to books.
3. **Book pages publish `Person` entities the site's own trust rule rejects**
   (P1, VERIFIED_PRODUCTION + VERIFIED_LOCAL).
   - The repository's `assessContributorName()` rates 19 of the 495 byline
     names in the corpus as `invalid`, covering 90 book credits. Examples:
     `user` ×39, `Windows User`, `ASUS`, `CamScanner`, `Acer`, `PC`,
     `Administrator`.
   - The indexable book pages still emit each of these as a JSON-LD
     `"@type": "Person"` author, print "by user", and link to author pages
     that the same rule sets to `noindex`.
   - Another 80 books type an organisation as a `Person`, for example
     `សាលាឌីជីថល` ("Digital School") ×40.
   - 4 books publish two people joined by the Khmer "and" (`និង`) as one
     Person. Three of them are the college's own ISBN-registered press books.
4. **Series volumes collapse into duplicates** (P1, VERIFIED_PRODUCTION).
   - 191 titles are exactly 65 characters and cut mid-word, dropping the grade
     number.
   - 127 books share an H1 with another book (47 groups), and 108 share a
     byte-identical description (41 groups).
   - The chemistry self-study series (`…-ថ្-3`, `-4`, `-5`, …) shows how this
     looks: six different volumes with one title, one description and one meta
     description.

**No P0 was found.** Nothing blocks indexing, and nothing advertised is
contradicted by its own page.

**Google Search Console is NOT IMPLEMENTED** as an integration. Ownership
verification is live through an HTML file, which answers 200 (VERIFIED_PRODUCTION).
There is no API client, no ingestion, no storage, no schedule, no dashboard and
no alerting (VERIFIED_CODE). No Search Console data was available to this audit.

---

## 2. Production facts (VERIFIED_PRODUCTION, 2026-09-23)

### 2.1 Method

1. Fetched `robots.txt` and `sitemap.xml`.
2. Ran a breadth-first, GET-only crawl of the English tree. It was seeded
   with `/` and every sitemap URL, and followed same-origin anchors. It used
   the repository's own URL policy, `normalizeCrawlUrl()` from
   `lib/verify/crawl-policy.ts`: it honours `robots.txt`, keeps only
   `?page=N` of any query, and never follows private prefixes or assets.
   Concurrency was 3. It fetched **4,388 URLs with 0 transport errors**.
3. Ran a second crawl without link-following over 119 seeds:
   - Khmer hubs;
   - 40 random `/km/books/*`, 15 `/km/authors/*` and all 25 `/km/subjects/*`;
   - pagination edge cases;
   - redirect probes.
4. Ran a third crawl without link-following over 251 author URLs. These
   are the slugs that `authorSlug()` gives for byline names found on book
   pages, where the slug was in neither the sitemap nor the crawl.
5. Every page's `<head>`, JSON-LD, anchors and visible text were parsed
   offline.

`next.config.ts:69` sets `htmlLimitedBots: /.*/`, so metadata arrives
blocking in `<head>` for every user agent. The crawler therefore saw the same
head a search engine sees.

The crawler and the parsers were ad-hoc scripts kept outside the repository.
They wrote nothing to the site.

### 2.2 Inventory

| Surface | Count | Status / robots / canonical |
|---|---:|---|
| `sitemap.xml` URLs | **2,267** (1.376 MB, one file, no index) | all 200 · all `index` · all self-canonical |
| — books | 1,956 | equals `/books`' own "Browse 1956 free educational books" and 108×18+12 listing rows |
| — authors | 238 | |
| — subjects | 25 | |
| — about (6 pages + 12 team profiles) | 18 | |
| — learning paths | 9 | |
| — journals: 1 journal + issues list + 1 issue + 1 article | 4 | |
| — theses: `/theses/summary` + 1 thesis | 2 | |
| — posts | 2 | |
| — static hubs | 13 | |
| Crawled URLs outside the sitemap | 2,121 | |
| — `/books/<slug>/read` | 1,956 | 200 · `noindex` · canonical → book page |
| — `/books?page=2…109` | 108 | 200 · indexable · self-canonical (sitemap excludes them by design) |
| — author pages linked but not in the sitemap | 41 | all `noindex` (27 composite, 14 junk-name) |
| — subject pages linked but not in the sitemap | 9 + **1 × 404** | `noindex` / 404 |
| — `/catalogs/<slug>` | 6 | all `noindex` (the whole physical catalogue is 6 records) |
| Author slugs probed outside sitemap and crawl | 251 | **223 × 200 `index, follow`**, 13 × `noindex`, 15 × 404 |

### 2.3 Status, redirects and pagination probes

| Request | Result |
|---|---|
| `/home` | 308 → `/` |
| `/km/home` | 308 → `/km` |
| `/en` | 301 → `/` |
| `/en/books` | 301 → `/books` |
| `/books/` | 308 → `/books` |
| `/Books` | 404 (case-sensitive). The 404 page emits **two** robots metas, `noindex` and `index, follow`. Harmless under a 404 status (P3) |
| `/books?page=2` … `?page=109` | 200, indexable, canonical `?page=N`, title "… — Page N" |
| `/books?page=110`, `?page=9999` | 200, `noindex, follow` (out of range), canonical `?page=N` |
| `/books?page=0`, `abc`, `-1` | 200, canonical `/books` |
| `/books?page=2.5` | 200, canonical `/books?page=2` |
| `/books?sort=…`, `?language=…`, `?q=…` | 200, `noindex, follow`, canonical `/books` |
| `/books?category=x` (not a recognised param) | 200, indexable, canonical `/books` |
| `/authors?page=2`, `/subjects?page=2` | 200, canonical to the unpaginated hub (the param is ignored) |
| `/km/books?page=2`, `/km/books?page=109` | 200, indexable, self-canonical `/km/books?page=N` |
| `/googlee89036a09f36e87d.html` | 200 (Search Console HTML-file verification) |
| `google-site-verification` meta on `/` | absent |

### 2.4 Khmer parity (VERIFIED_PRODUCTION, sample of 80 entity pages)

All 40 `/km/books/*`, 15 `/km/authors/*` and 25 `/km/subjects/*` pages
checked:

- answer 200;
- carry the same robots value as their English twin;
- self-canonicalise to the `/km/…` URL;
- carry reciprocal `en` / `km` / `x-default` hreflang.

Book pages carry the same title and meta description in both locales,
because the record's own text is monolingual. Author and subject pages
localise their chrome. The Khmer hubs (`/km`, `/km/books`, `/km/subjects`,
`/km/authors`, `/km/paths`, …) behave the same way.

One small gap: `/km/catalogs` is titled "Books In Library", which is English.

### 2.5 Response headers and weight (VERIFIED_PRODUCTION)

Every detail route (`/books/*`, `/authors/*`, `/subjects/*`, `/paths/*`,
`/journals/*`, `/theses/*`, `/posts/*`, `/catalogs/*`) and the `/books`,
`/theses`, `/journals`, `/posts` and `/catalogs` listings are served
`private, no-cache, no-store`. Each one is rendered at the origin on every
request. Only `/`, `/km`, the `/subjects` and `/authors` hubs and `/about/*`
are CDN-cacheable (`s-maxage`).

| Family | n | median HTML | max | flight-payload share | inline SVG |
|---|---:|---:|---:|---:|---:|
| `/books/*` | 1,956 | 458 KB | 497 KB | 55% | 44 KB |
| `/books/*/read` | 1,956 | 331 KB | 344 KB | 62% | 31 KB |
| `/authors/*` | 279 | 327 KB | **2,842 KB** | 60% | 35 KB |
| `/books?page=N` | 108 | 526 KB | 537 KB | 47% | 41 KB |
| `/subjects/*` | 34 | 397 KB | 427 KB | 59% | 39 KB |
| `/` | 1 | 817 KB | | 47% | 82 KB |
| `/authors` | 1 | **1,271 KB** | | 56% | 151 KB |

Sizes are uncompressed documents. Flight share and SVG are medians over up to
25 sampled pages per family.

---

## 3. Repository facts (VERIFIED_CODE)

| Concern | Where it is decided |
|---|---|
| Sitemap | `app/sitemap.ts`. One file, `MAX_SITEMAP_ENTRIES = 50_000` (:140), silent `slice` past it (:634-640). Books, posts, theses, catalogue, articles and paths are paged by `fetchAllRows` (:92-104). Subjects come from `getIndexableSubjects()`. Authors come from `fetchAuthorRows` ∩ `getListedAuthors()` (`lib/authors/sitemap-filter.ts`) |
| Robots | `app/robots.ts`; `lib/seo/indexing.ts` (`$`-anchored private paths, so `/auth` does not block `/authors`) |
| Book metadata | `lib/seo/book-seo.ts` `buildBookMetadata` (:189-247). The description is `seo_description` → own description ≥70 chars → own <70 plus a generated sentence → the generated sentence alone, truncated at 157 code units (:107-153). No book-level noindex rule exists apart from not-found |
| Book JSON-LD | `bookJsonLd` (:266-342). Authors come from `getPublicResourceContributors` → `resolveContributors` → `contributorNodesFromViews` |
| Listing metadata | `lib/seo/listing-metadata.ts`. Self-canonical `?page=N`. `noindex` only when filtered, out of range or empty (:104-105). Otherwise `robots: undefined` |
| Subject gate | `lib/subjects/indexability.ts`: `total ≤ 1` is suppressed; `total < 5` or `fullText < 3` is noindex; otherwise index. The sitemap, the page robots and the hub all read one cached index, `loadSubjectIndex` in `lib/subjects/index.ts:146-235` |
| Author gate | Page: `app/[locale]/(public)/authors/[slug]/page.tsx:46-120` is noindex if composite, unidentified, or has zero works (per-author query). Sitemap and hub: `getListedAuthors()` = directory `workCount > 0 && identified` (`lib/authors/directory.ts`). Book-page links: `resolveAuthorLinks` = directory `workCount > 0` only (`lib/resources/connections.ts:72-96`) |
| Contributor read policy | `lib/resources/contributor-view.ts`. `viewsFromCanonical` (:189-260) takes `source = 'manual'` rows "exactly as stored, name included" |
| Catalogue thin-description rule | `lib/catalogs/indexability.ts` and `lib/catalogs/derived-description.ts`. Used only by `/catalogs/[slug]`, `app/sitemap.ts` and `lib/catalog-import.ts`. **Nothing under `/books` uses it** |
| Search Console | Verification only: the `public/googlee89036a09f36e87d.html` file, plus an optional `metadata.verification.google` driven by System Settings (`app/[locale]/layout.tsx:24,38-45`). No `googleapis` Search Console client; `googleapis` is used only by `lib/gmail.ts` |
| Row cap | `supabase/config.toml:18` `max_rows = 1000`; `infra/supabase/docker-compose.yml:294,404` `PGRST_DB_MAX_ROWS: "1000"` |

---

## 4. SEO corpus statistics

### Table A — Book corpus (N = 1,956 published books)

All counts are VERIFIED_PRODUCTION: parsed from each book page's `<head>`,
JSON-LD and visible text.

| Metric | Count | % | Evidence / note |
|---|---:|---:|---|
| Published books | 1,956 | 100 | sitemap = `/books` count = listing rows |
| Indexable (`index, follow`, 200, self-canonical) | 1,956 | 100.0 | |
| Missing description (fallback sentence shown) | 2 | 0.1 | "…is a public resource in the PTEC Library collection." |
| Very short own description (<70 chars) | 0 | 0.0 | median 242 chars, p10 212, p90 276 |
| Own description <200 chars | 90 | 4.6 | |
| **Templated description** (identical skeleton after masking title/subject/digits) | **1,483** | **75.8** | 62 templates. Khmer books 1,431 of 1,665 (86%); English 52 of 291 (18%) |
| — the single largest template | 1,043 | 53.3 | "សៀវភៅ «T» គឺជាឯកសារជំនួយស្មារតី និងការសិក្សាស្រាវជ្រាវដ៏មានសារៈសំខាន់ …" (22 variants of its second sentence) |
| Byte-identical description shared with another book | 108 | 5.5 | 41 groups |
| Byte-identical meta description | 108 | 5.5 | 41 groups |
| Description script ≠ `inLanguage` | 67 | 3.4 | e.g. English prose on `km` records (heuristic: majority script) |
| Meta description truncated with "..." at 157 chars | 1,949 | 99.6 | cut mid-word, and mid-cluster in Khmer |
| Duplicate H1 title | 127 | 6.5 | 47 groups |
| H1 exactly 65 characters (upstream truncation) | 191 | 9.8 | cut mid-word |
| Slug with collision suffix `-N` | 219 | 11.2 | |
| JSON-LD author present | 1,956 | 100 | none missing |
| — Organization-typed author | 1,287 | 65.8 | MoEYS alone is 1,037 |
| — Person-typed author | 661 | 33.8 | |
| — institution `@id` reference | 8 | 0.4 | the correct pattern for PTEC's own works |
| Author the repo's trust rule rates **invalid**, still published as Person | 90 credits / 19 names | 4.6 | VERIFIED_LOCAL over production names |
| Author rated **suspicious** (single-token handle etc.) | 42 credits / 15 names | 2.1 | e.g. `kan` ×14, `dell` ×12 |
| Organisation typed as Person (school/office/department/programme words) | 80 | 4.1 | heuristic keyword list, see §6.3 |
| Two people joined by `និង` published as one Person | 4 | 0.2 | 3 are PTEC Press books with ISBNs |
| Multi-author books | 50 | 2.6 | |
| Byline visible, **no author link** | 435 | 22.2 | §6.2 |
| Subject hub in breadcrumb / subject chip | 1,956 / 1,955 | 100 / 99.9 | the one book without a chip is in a 1-book category; its breadcrumb falls back to its department's hub |
| Missing ISBN | 1,816 | 92.8 | |
| Missing publisher | 1,941 | 99.2 | |
| Missing publication year | 0 | 0 | but see the next two rows |
| — `datePublished` stored as `YYYY-01-01` | 1,956 | 100 | a year entered as a date. The day and month are invented |
| — claims publication year **2026** | 948 | 48.5 | 26 of the 31 books whose own title names a year ≥3 years earlier say 2026 (§5.4) |
| Missing language | 0 | 0 | `km` 1,665 · `en` 291 |
| Missing page count | 0 | 0 | |
| "Not yet verified by library staff" notice shown | 1,941 | 99.2 | 15 verified books in the whole corpus |
| "Topics covered" block (derived from the book's own text) | **0** | 0.0 | §5.5 |
| Extracted full text available | UNKNOWN | — | not public. `CLAUDE.md` documents 1,695 books with page text; not re-verified |
| Learning-path block shown | 29 | 1.5 | matches the documented 29 books in 9 paths |
| Related-books rail | 1,956 | 100 | 6 cards on 1,881 |
| OG image = real cover | 1,956 | 100 | |

### 4.1 Where the book pages are strong (VERIFIED_PRODUCTION)

- Every book has a unique canonical URL and reciprocal hreflang.
- Every page has an `index, follow` robots tag, a `Book` JSON-LD node with
  `inLanguage`, `numberOfPages`, `datePublished`, `about`, `image` and
  `provider → #library`, a `BreadcrumbList` through a subject hub, and a
  cover image in OG and Twitter.
- Every book sits in the sitemap with a `lastmod`.
- Books reach one another through the related-books rail: 6 related books
  on 1,881 pages.

---

## 5. Book-quality findings

### F-B1 · P1 · Boilerplate descriptions dominate the corpus

- **Evidence.** VERIFIED_PRODUCTION (all 1,956 pages). The method masks the
  «quoted title», every badge label (department and category) and all
  digits, then counts identical skeletons.
- **Affected.** 1,483 books (75.8%) in 62 templates. The three largest
  skeletons alone cover 860 books:
  - **408 science books:** "…ក្នុងមុខវិជ្ជា{S}។ ខ្លឹមសាររួមមានការពន្យល់ទ្រឹស្តី{S} ការពិសោធន៍ និងការអនុវត្តរូបមន្តសំខាន់ៗ…"
    ("its content includes explanation of {S} theory, experiments and key formulas…").
  - **328 mathematics books:** "…ផ្តោតលើទ្រឹស្តី{S} រូបមន្តគន្លឹះ និងលំហាត់អនុវត្ត…"
    ("focuses on {S} theory, key formulas and practice exercises…").
  - **124 books:** "…ក្នុងវិស័យ{S}។ ខ្លឹមសារចម្បងរួមមានទ្រឹស្តីសំខាន់ៗ ឧទាហរណ៍ជាក់ស្តែង…".
  - The next three skeletons add 56, 42 and 20 books.
  - The templates follow the subject: every "experiments and formulas" book
    is filed under science, and every "formulas and exercises" book under
    mathematics. So the text is not wrong about the subject. It says nothing
    about the particular book.
- **Why it matters.** The description is the only per-book prose on the
  page (median 242 of ~2,255 visible characters, the rest being chrome and
  metadata). It is also the meta description on 1,954 pages. A search engine
  sees 1,043 pages whose distinguishing text is the title plus one of 22
  sentences. That is the pattern "scaled, low-value content" heuristics are
  built to cluster.
- **Root cause.** INFERRED. The descriptions were machine-drafted at bulk
  import. The tight length distribution (p10 212, p90 276) and the fixed
  skeletons fit a generator run per category, not per book.
  `CLAUDE.md § Book Ingestion` says Gemini drafts metadata as a draft. Here
  the drafts were published unreviewed: 1,941 books still carry the
  "not yet verified" notice.
- **Why nothing caught it.** VERIFIED_CODE + VERIFIED_LOCAL.
  `bookMetaDescription()` only checks length (≥70). The catalogue
  derived-description rule (`isDerivedDescription`) was run over all 1,956
  book descriptions with the same fields a catalogue record would pass. It
  flags **0 of 1,483** templated descriptions. The boilerplate is generic
  prose, not a restatement of fields, so a per-record test cannot see it.
  Only a cross-corpus measure can.
- **Recommended fix.** Editorial and data. Code only for measurement.
  - **Do not** generate replacement prose with a model.
  - Prioritise librarian-written or publisher-supplied descriptions for the
    highest-traffic books (needs GSC, §11).
  - Surface the book's own text as content (F-B5).
  - Add a corpus-level duplication metric to `/admin/data-quality` so the
    template share is visible and trends down.

### F-B2 · P1 · Truncated titles make series volumes indistinguishable

- **Evidence.** VERIFIED_PRODUCTION.
- **Affected.** 191 H1s of exactly 65 characters. 127 books in 47
  duplicate-H1 groups. 108 books in 41 identical-description groups. In
  almost every one, the identical description exists *because* the title,
  which is the only variable in the template, is identical.
- **Examples.**
  - `/books/ឯកសារបណ្ដាញចំណេះដឹងសម្រាប់សិស្សស្វ័យសិក្សា-មុខវិជ្ជាគីមីវិទ្យា-ថ្-3`, `-4`, `-5`
    (and three siblings): six chemistry self-study volumes, all titled
    "…មុខវិជ្ជាគីមីវិទ្យា ថ្". The grade "ថ្នាក់ទី…" is cut to "ថ្". They share
    one description and one meta description.
  - `/books/អត្រាកំណែរតេស្តគណិតវិទ្យាសម្រាប់ខែមិថុនា-3` … `-5`: six copies of one title.
- **Root cause.** VERIFIED_CODE (documented). Titles were truncated at 65
  characters upstream of this repository (`CLAUDE.md § duplicate queue`). The
  missing tail is the grade or volume.
- **Recommended fix.** Editorial: retitle, never retire. Retiring one archives
  a real textbook and 301s its URL onto a different book. The duplicate
  queue's comparison strip already shows the page-count evidence.
  - **Kind of fix:** data/editorial.

### F-B3 · P2 · Publication year is not trustworthy

- **Evidence.** VERIFIED_PRODUCTION for the values. INFERRED for the cause.
- **Affected.**
  - All 1,956 `datePublished` values are `YYYY-01-01`. The same value
    goes to `citation_publication_date` and `article:published_time`.
  - 948 books (48.5%) claim 2026.
  - Of the 85 books whose title names a year, 31 carry a `datePublished` ≥3
    years later than that year, and 26 of those say 2026.
    - `/books/កំណែលំហាត់គីមីវិទ្យាថ្នាក់ទី12-ឆ្នាំ-1998` ("…year 1998") → 2026.
    - `/books/វិញ្ញាសាប្រឡងបាក់ឌុប-២០០៣ដល់២០២៣` ("…2003 to 2023") → 2026.
- **Root cause.** INFERRED. For bulk-imported rows, `books.published_at` holds
  the import year, not the edition's year. `mapRowToBook` reads it as the
  publication year (`lib/books/index.ts:62`).
- **Recommended fix.**
  - **Data:** correct the year where it is known. Otherwise leave the field
    blank.
  - **Code, small:** emit year precision (`"2023"`) rather than a fabricated
    `-01-01`.
  - A wrong `citation_publication_date` is read by Google Scholar.

### F-B4 · P2 · Bibliographic identifiers are nearly absent

- **Evidence.** VERIFIED_PRODUCTION.
- **Affected.** ISBN is missing on 1,816 books (92.8%) and publisher on 1,941
  (99.2%). No `Publisher` fact appears on any book page.
- **Note.** 57 MoEYS-credited books have Latin-only titles. Some are
  clearly not MoEYS works: `/books/mathematics-education-in-singapore` (ISBN
  9789811335723) is credited to `ក្រសួងអប់រំ យុវជន និងកីឡា`. Others,
  such as "Term of Use", are not books at all. INFERRED: MoEYS was the bulk
  importer's default byline.
- **Recommended fix.** Editorial and data. ISBN and publisher are the fields
  that let an engine reconcile a record with its own book entity. Do not
  invent them.

### F-B5 · P2 · The per-book "Topics covered" block renders on no page

- **Evidence.** VERIFIED_PRODUCTION: 0 of 1,956 book pages contain
  `book-topics-heading`. VERIFIED_CODE: `BookTopics` renders only when
  `getPublicTopics()` finds a `resource_semantic_insights` row whose
  `status = ok` at the current `SEMANTIC_VERSION`
  (`lib/semantic/insights.ts:84,119-125`).
- **Context.** `docs/SEO-SEMANTIC-CHUNKS-ROLLOUT.md §4` measured a dry run on
  2026-09-05 at 81 `ok` of 215 records. The collection has since grown ninefold.
- **Root cause.** UNKNOWN. Either no production write run has happened, or
  the stored rows are at an older `SEMANTIC_VERSION` and are ignored.
- **Why it matters.** This is the one content block in the codebase that is
  per-book, factual, and drawn from the document itself. It is the antidote
  to F-B1 that does not need a model to write prose.
- **Recommended fix.** Data operation: a dry run, then a write run of
  `scripts/build-semantic-insights.ts`, with the before/after measurement that
  the rollout doc prescribes. **Kind of fix:** data. It needs production
  credentials this audit did not have.

### F-B6 · P3 · The meta description is cut at 157 code units

- **Evidence.** VERIFIED_CODE: `truncate()` in `lib/seo/book-seo.ts:113-115`.
  VERIFIED_PRODUCTION: 1,949 of 1,956 meta descriptions end in `...`.
- **Why it matters.** Khmer is cut mid-cluster. For example, "…មុខវិជ្ជាគីមីវិទ្យ..."
  drops the final vowel of វិទ្យា.
- **Recommended fix.** Code: cut on a word or grapheme boundary
  (`Intl.Segmenter`). Low value on its own, because search engines rewrite
  snippets anyway.

### 5.6 Description classes (§5 of the brief)

| Class | Count | How identified |
|---|---:|---|
| Editorial (librarian or publisher text, per-book) | UNKNOWN (≤ 473) | Not separable from the page. 473 descriptions have a skeleton no other book shares |
| Metadata-derived / field restatement | 0 | `isDerivedDescription` over every book |
| Duplicate (byte-identical) | 108 | exact match after whitespace normalisation |
| Near-duplicate / templated | 1,483 | shared skeleton |
| Empty / thin (fallback sentence) | 2 | visible fallback text |
| Useful factual summary | UNKNOWN | needs a human reader. The 15 staff-verified books below are the only ones with a positive signal |

**Five good books.** Non-templated description, ISBN, a valid linked author.
None of them is staff-verified.

- `/books/pisa-2022-results-creative-minds-volume-iii` (OECD, ISBN 9789264889538)
- `/books/pisa-2022-results-learning-during-disruption-volume-ii` (OECD, 9789264498976)
- `/books/pisa-2022-results-learning-and-equity-volume-i` (OECD, 9789264997967)
- `/books/education-in-eastern-partnership-findings-from-pisa` (OECD, 9789264571457)
- `/books/technology-in-education` (UNESCO, 9789231006098)

**Staff-verified books with their own description** (7 of the 15 verified in
the whole corpus), for example:

- `/books/action-research-series-volume-1`, `-2`, `-3`, credited to the
  institution by `@id` (the correct pattern)
- `/books/គុណភាពទឹក-សម្រាប់វិទ្យាសាស្ត្រគីមីវិទ្យា-និងបរិស្ថានវិទ្យា` (ISBN 978-9924-627-14-2, PTEC Library Press). Its author credit is broken; see F-A2

**Five weak books.** Templated description, no ISBN, and an author the trust
rule rejects.

- `/books/វិញ្ញាសាគីមីវិទ្យាត្រៀមប្រឡងបាក់ឌុប`: Person "user"
- `/books/លំហាត់គណិតវិទ្យាមានរូប-៣៦០`: Person "user"
- `/books/ចម្លើយ៥វិញ្ញាសាត្រៀមប្រឡងបាក់ឌុបផ្សេងៗធ្វើដំណោះស្រាយ`: Person "user"
- `/books/កម្រងវិញ្ញាសា-ប្រលងសិស្សពូកែគណិតវិទ្យាថ្នាក់ទី១២`: Person "Administrator"
- `/books/វិញ្ញាសាត្រៀមប្រឡង-គណិតវិទ្យា-ថ្នាក់ទី៩`: Person "Author"

In total, 125 books are templated, lack an ISBN, and credit an invalid or
suspicious name.

**Five duplicate or derived descriptions.** Byte-identical text on different
URLs.

- `/books/ឯកសារបណ្ដាញចំណេះដឹងសម្រាប់សិស្សស្វ័យសិក្សា-មុខវិជ្ជាគីមីវិទ្យា-ថ្-3` = `-4` = `-5` (6 books)
- `/books/ឯកសារបណ្តាញចំណេះដឹងស្វ័យសិក្សាសម្រាប់សិស្សមុខវិជ្ជាគណិតវិទ្យា-ថ្ន-3` = `-4` = `-5` (6)
- `/books/អត្រាកំណែរតេស្តគណិតវិទ្យាសម្រាប់ខែមិថុនា-3` = `-4` = `-5` (6)
- `/books/ឯកសារ-បណ្ដាញ-ចំណេះដឹង-សម្រាប់-សិស្ស-ស្វ័យ-សិក្សា-ជីវវិទ្យា-ថ្នាក់-2` = `-3` = `-4` (5)
- `/books/ឯកសារ-បណ្ដាញ-ចំណេះដឹង-សម្រាប់-សិស្ស-ស្វ័យ-សិក្សា-គីមីវិទ្យា-ថ្នាក-2` = `-3` = `-4` (5)

**Noindex-worthy.** None of the books is proposed for `noindex` here. Every
one is a real document with a real cover, language, page count and subject.
The defect is the description and the title, not the existence of the page.
See "DO NOT FIX YET".

---

## 6. Author entity findings

### Table B — Authors

| Metric | Count | Evidence |
|---|---:|---|
| Distinct byline names on book JSON-LD | 495 | VERIFIED_PRODUCTION |
| Author pages answering 200 (all sources) | 515 | VERIFIED_PRODUCTION |
| — typed Person (indexable pages) | 403 | |
| — typed Organization (indexable pages) | 58 | |
| — composite (disambiguation page) | 27 | `noindex`, in `/authors`, not in sitemap |
| — junk / unidentified / zero-works | 27 | `noindex` |
| Indexable author pages | **461** | |
| — in sitemap and `/authors` | 238 | |
| — **indexable but in neither** | **223** | VERIFIED_PRODUCTION. Orphans: no internal link reaches them |
| One-work indexable profiles | 360 | "1 works shown" |
| Multi-work indexable profiles | 101 | |
| Zero-work profiles | 10 | all `noindex` (correct) |
| Thin profiles (≤2 works, no bio, photo, identifier or affiliation) | 394 | of 461 indexable |
| Profiles with a bio | 1 | `/authors/set-seng` |
| With a photo | 1 | same |
| With ORCID / Scholar / sameAs | 1 | same |
| With affiliation or jobTitle | 4 | |
| Author slugs that 404 though the name is on a book | 15 | e.g. `danuta-gabryś-barker`, `raymond-serway` |
| `/authors` hub entries | 265 | 238 single + 27 composite. The listed "works" sum to 1,050 |

### F-A1 · P1 · The author directory counts from about half the books

- **Evidence.**
  - **VERIFIED_CODE.** `loadAuthorDirectory()` reads `books` unpaged
    (`lib/authors/directory.ts:92`). It asks for `resource_contributors`
    with `.limit(10000)` and `contributors` / `authors` with
    `.limit(5000)`. All are clipped at `max_rows = 1000`.
  - **VERIFIED_PRODUCTION.**
    - The `/authors` hub says MoEYS has **652 works**. Its own page shows
      **1000 works shown**. The books credit it **1,037** times.
    - `dell`: hub says 1, page says 12. `UNESCO`: 7 vs 10. `OECD`: 3 vs 7.
      `Catherine Dawson`: 3 vs 5.
- **Consequences** (VERIFIED_PRODUCTION).
  1. **251 byline names have no entry in the directory.**
     - For 223 of them, `/authors/<slug>` answers `200 index, follow`
       with 1–40 works.
     - All 223 are missing from the sitemap and from `/authors`, and they
       are not linked from their own books. `resolveAuthorLinks` needs a
       directory `workCount > 0`, which they do not have.
     - Examples: `/authors/សាលាឌីជីថល` (40 works), `/authors/vanntha-hak`
       (15), `/authors/បណ្ឌិតសភាចារ្យ-ហង់ជួន-ណារ៉ុន` (12), `/authors/hang-chuon-naron`
       (7), `/authors/ការិយាល័យអប់រំ-យុវជន-និងកីឡា-នៃរដ្ឋបាលស្រុកសំឡូត` (12).
  2. **435 books (22.2%) show "by X" with no link to X.**
  3. **The MoEYS page is truncated** at 1,000 of 1,037 works. `PER_TYPE_LIMIT`
     is 5000 (`lib/authors/profile.ts:77`), but the row cap wins. That page
     is also 2.84 MB of HTML.
  4. **Treatment of suspicious names is arbitrary.** The directory decides
     which of them get listed, so which suspicious names are advertised
     depends on row order. `dell` (suspicious) is in the sitemap; `kan`
     (suspicious, 14 works) is not.
- **Why nothing caught it.**
  - `lib/db/paginated-sweep.test.ts` scans only `.range()` loops in a
    fixed file list.
  - `scripts/verify-subject-indexability.ts` and the sitemap filter check
    that two readings of the same clipped cache agree with each other. They do.
- **Root cause.** VERIFIED_CODE. Unpaged whole-table reads under a 1,000-row
  cap.
- **Recommended fix.** Code, small. Page every whole-table read in
  `loadAuthorDirectory`, `loadSubjectIndex` and `getAuthorProfile` works, or
  replace them with a counting SQL view/RPC. Then add a parity check: directory
  credits must equal published credits.

### F-A2 · P1 · Invalid and mistyped identities published as `Person` on indexable book pages

- **Evidence.** VERIFIED_PRODUCTION + VERIFIED_LOCAL. The repository's
  `assessContributorName()` and `normalizeByline()` were run over all 495
  production byline names.
- **Invalid by the site's own rule** (19 names, 90 book credits). All of
  these are published as `{"@type":"Person","name":…}`:

  | Name | Credits | Reason |
  |---|---:|---|
  | `user` | 39 | software_default |
  | `Windows User` | 8 | software_default |
  | `ASUS` | 8 | software_default |
  | `CamScanner` | 7 | software_or_device |
  | `Author` | 5 | placeholder |
  | `Acer` | 5 | software_default |
  | `PC` | 4 | software_default |
  | `admin`, `Administrator` | 2 each | software_default |
  | … | … | 10 more |

  - 79 of these books also link to the author page. That page answers
    `noindex` because of the very same rule.
  - Example: `/books/វិញ្ញាសាគីមីវិទ្យាត្រៀមប្រឡងបាក់ឌុប` shows "by user", publishes
    `Person "user"`, and links to `/authors/user`, which is `noindex`.
- **Organisation typed as Person** (80 books):
  - `សាលាឌីជីថល` ("Digital School") ×40
  - `ការិយាល័យអប់រំ យុវជន និងកីឡា នៃរដ្ឋបាលស្រុកសំឡូត` (a district education office) ×12
  - `SEA-PLM` (an assessment programme) ×5
  - `Dell-Cambodia` ×4
  - `សាលា អេឌូផ្លើស Edu Plus` ×4
- **Composite names published as one Person** (the case the brief asked for):

  | Book | Published as one Person |
  |---|---|
  | `/books/សុខភាពនៅក្នុងដៃរបស់យើង-សម្រាប់វិទ្យាសាស្ត្រជីវវិទ្យា` (ISBN 978-9924-627-15-9, PTEC Library Press, staff-verified) | "លុក សូលីនដា និង ជន សុគន្ធារី" |
  | `/books/គុណភាពទឹក-សម្រាប់វិទ្យាសាស្ត្រគីមីវិទ្យា-និងបរិស្ថានវិទ្យា` (978-9924-627-14-2) | "សៀង គឹមស៊្រុន និង ឈាង សុភា" |
  | `/books/អន្តរកម្មសម្រាប់វិទ្យាសាស្ត្ររូបវិទ្យា-សៀវភៅសម្រាប់សិស្ស-ភាគ៣` (978-9924-627-13-5) | "សន សុយៀម ស៊្រុន សៀងហួរ និង ឈឺន ឈាន" (three people) |
  | a fourth book | "យ៉េង ធី និង នយ យ៉េហ៊ាង" |
  | one more, no separator at all | "Pramualchai Ketkhao Sukanya Thongratsakul Pariwat Poolperm Chaithep Poolkhet" (four people) |

  These are the college's own ISBN-registered publications, which makes them
  the most valuable records in the library. Each one asserts a single
  fabricated human. `normalizeByline()` splits them into **0** extra parts,
  because `និង` is not a separator it recognises.
- **LaTeX / markup residue as Person names** (10 books). Examples:
  - `-0.6cmបណ្ឌិត មាស ឡេន0.7cm សាស្រ្តាចារ្យរង`
  - `Yun Chornny Master of Math Student at RUPP [3mm] [width=1.5cm]RUPP`
  - `បង្រៀនដោយ : [Scale=1 Script=Khmer]Khmer Mool1សន ពៅ`
  - `sotharykim789@hotmail.com`
- **Root cause.** VERIFIED_CODE + INFERRED.
  - `viewsFromCanonical()` takes every `source = 'manual'` canonical row
    "exactly as stored, name included" (`lib/resources/contributor-view.ts:189-230`).
    It applies no trust check.
  - INFERRED: these rows were written before the trust rule (#224) existed,
    or through a path that did not apply it. So "the write path refuses
    unresolvable bylines" did not hold for them.
  - `normalizeByline()` has no Khmer conjunction separator.
- **Recommended fix.**
  - **Code, small:** apply `assessContributorName()` to manual rows at read
    time, as the legacy path already does. Add `និង` as a byline separator,
    with a test pinned against the four production strings above.
  - **Data:** repair the canonical rows through the existing
    `/admin/data-quality` queue.
  - **Never** auto-merge or auto-rename people.

### F-A3 · P2 · One entity, several pages (identity collisions)

- **Evidence.** VERIFIED_PRODUCTION for the pages. The identity claims below
  are INFERRED and must stay UNKNOWN until a librarian confirms them.
- **Candidates.**

  | Pages | Works | Likely identity |
  |---|---|---|
  | `/authors/ក្រសួងអប់រំ-យុវជន-និងកីឡា` and `/authors/ministry-of-education-youth-and-sport` | 1,037 and 17 | the same ministry, in Khmer and English |
  | `/authors/បណ្ឌិតសភាចារ្យ-ហង់ជួន-ណារ៉ុន` and `/authors/hang-chuon-naron` | 12 and 7 | Academician Hang Chuon Naron |
  | `/authors/វិទ្យាស្ថានជាតិអប់រំ` and `/authors/វិទ្យាស្ថានជាតិអប់រំ-nie` | | the National Institute of Education |
  | `/authors/dell` and `/authors/dell-cambodia` | | |

- **Recommended fix.** Editorial. Use `sameAs` or alias curation after
  confirmation. **Do not merge automatically.**

### F-A4 · P2 · Thin author profiles are indexed by policy

- **Evidence.** VERIFIED_PRODUCTION.
  - 394 of 461 indexable author pages hold ≤2 works and no bio, photo,
    identifier or affiliation. 360 hold exactly one work.
  - Only `/authors/set-seng` carries a bio, photo and external identifier.
- **Assessment.** The current policy indexes any identified name with ≥1 work,
  and it applies that policy consistently. See "DO NOT FIX YET" before
  changing it: whether one-work author pages earn impressions is a Search
  Console question.

### 6.1 Author profile groups (VERIFIED_PRODUCTION)

| Group | Definition (heuristic) | Count | Indexable | In sitemap | Linked internally |
|---|---|---:|---|---|---|
| Strong | ≥3 works and ≥2 of {bio, photo, identifier, affiliation} | 1 | yes | yes | yes |
| Medium | ≥3 works, or 1 profile signal | 66 | yes | **32 of 66** | 32 of 66 |
| Thin | the rest | 394 | yes | **205 of 394** | 205 of 394 |
| Composite | byline names several people | 27 | no | no | yes (hub) |
| Invalid / zero-work | trust `invalid` or no works | 27 | no | no | 14 from books |

The thresholds are heuristic. They exist to sort the roster for review, not
as a proposed indexing rule.

**Five strongest author profiles.** Only one clears the "strong" bar. The
next four are the strongest by works.

- `/authors/set-seng`: bio, photo, an external profile link, affiliation, 4 works
- `/authors/ក្រសួងអប់រំ-យុវជន-និងកីឡា`: Organization, 1,037 works (page truncated at 1,000)
- `/authors/នាយកដ្ឋានបច្ចេកវិទ្យាព័ត៌មាន`: Organization, 101 works
- `/authors/unesco`: Organization, 10 works
- `/authors/ក្រុមប្រឹក្សាជាតិភាសាខ្មែរ`: Organization, 10 works

**Five thin author profiles** (all in the sitemap and `index, follow`, one
work, no profile signal):

- `/authors/kristina-henriksson`
- `/authors/richard-l-scheaffer`
- `/authors/tiarith`
- `/authors/indavy` (trust: suspicious)
- `/authors/ក្រសួងសាធារណការ-និងដឹកជញ្ជូន`

**Five composite-author problems:**

- The three PTEC Press books in F-A2, plus `យ៉េង ធី និង នយ យ៉េហ៊ាង`. All four
  publish one Person for two or three people.
- `Pramualchai Ketkhao Sukanya Thongratsakul Pariwat Poolperm Chaithep Poolkhet`
  is four people with no separator. It is one Person on the book, and its
  author page 404s.

For contrast, the comma-separated composites work as designed.
`/authors/louis-cohen-lawrence-manion-keith-morrison` is a `noindex`
disambiguation page, and the three individuals have their own pages.

### 6.2 Does the identity model agree across surfaces?

| Surface | MoEYS (KM) | "user" | "Vanntha Hak" | "លុក សូលីនដា និង ជន សុគន្ធារី" |
|---|---|---|---|---|
| Visible byline | yes | "by user" | yes | one name |
| Book JSON-LD | Organization | **Person** | Person | **one Person** |
| Author page | 200 index, 1,000 of 1,037 works | 200 **noindex** | 200 **index** | 404 |
| `/authors` hub | "652 works" | absent | **absent** | absent |
| Sitemap | yes | no | **no** | no |
| Linked from its books | yes | **yes** | **no** | no |

All four columns disagree somewhere. No single identity model governs these
surfaces yet.

---

## 7. Subject entity findings

### Table C — Subjects

| Metric | Count | Evidence |
|---|---:|---|
| Subject pages reachable by links | 34 + 1 broken | VERIFIED_PRODUCTION |
| Categories in the whole taxonomy | UNKNOWN (≥ 35) | the taxonomy is not public; one 1-book category is linked from nowhere |
| With resources | ≥ 35 | |
| Empty (0 resources) | UNKNOWN | never linked, so not observable |
| Indexable (in sitemap) | 25 | the verifier passes, 5/5 checks |
| `noindex`, linked from the `/subjects` hub | 5 | `ភាសា`, `កម្មវិធី-pisa`, `ចំណេះដឹងទូទៅ`, `ច្បាប់`, `វិញ្ញាសាប្រឡង` |
| Suppressed (≤1 by displayed count), linked only from books | 4 + 1 unlinked | `វប្បធម៌` (**3 real**), `អប់រំសិល្បៈ`, `ភាសាបារាំង`, `បំណិនជីវិត`, `វិធីសាស្ត្របង្រៀនរូបវិទ្យា` |
| With a stored description | **0** | VERIFIED_CODE: `categories` has no description column. Every page shows the generic "Everything the library holds on this subject." |
| With an English name | 0 | names are Khmer only, even on English URLs (`0146` declined to translate) |

### F-S1 · P1 · Subject counts and the depth gate run on 1,000 of 1,955 books

- **Evidence.** VERIFIED_PRODUCTION: the e-book counts on the 34 subject pages
  sum to **1,000**. The books' own subject badges sum to **1,955**.
  VERIFIED_CODE: `lib/subjects/index.ts:153` reads
  `books.select("id, category_id")` unpaged, and the `resource_index_state`
  read at :164-170 is also unpaged.

  | Subject | Shown | Real | Gate today |
  |---|---:|---:|---|
  | គណិតវិទ្យា | 153 | 440 | index |
  | វិទ្យសាស្ត្រ | 165 | 401 | index |
  | គីមីវិទ្យា | 38 | 119 | index |
  | រូបវិទ្យា | 30 | 101 | index |
  | សុខភាព | 18 | 68 | index |
  | **កម្មវិធី PISA** | 3 | **8** | **noindex** |
  | **វិញ្ញាសាប្រឡង** | 3 | **8** | **noindex** |
  | **ចំណេះដឹងទូទៅ** | 3 | **7** | **noindex** |
  | **ច្បាប់** | 3 | **5** | **noindex** |
  | **វប្បធម៌** | 1 | **3** | **suppressed** (dropped from the hub) |

  - The same wrong numbers are published in each page's meta description, for
    example "153 e-books about គណិតវិទ្យា in the PTEC Library."
  - The four `noindex` rows clear the ≥5-resource bar on real counts.
    Whether they also clear the ≥3 full-text bar is UNKNOWN, because
    `resource_index_state` is not public and its read is clipped too.
- **Root cause.** VERIFIED_CODE. The same as F-A1.
- **Recommended fix.** Code, small: page the reads. Then re-run
  `scripts/verify-subject-indexability.ts` and
  `scripts/check-subject-graduation.ts`. Expect some hubs to graduate.

### F-X1 · P1 (class) · The same row cap elsewhere

A code sweep for unpaged whole-table reads that feed public surfaces found
the following on the same pattern. The full list is in the appendix.

- **Homepage department tiles** (`lib/home-data.ts:81-84`).
  VERIFIED_PRODUCTION: "Browse by Subject" shows
  - វិទ្យាសាស្ត្រ **256** items against **749**;
  - Primary Education 154 against 238;
  - គណិតវិទ្យា 142 against 369;
  - ស្រាវជ្រាវ 92 against 171;
  - គរុកោសល្យ 79 against 105.
- **The hourly index reconciler** (`lib/indexing/reconcile.ts:98`, `:221-223`).
  VERIFIED_CODE: it lists published books unpaged, and reads
  `resource_index_state` with no filter and no paging.
  - INFERRED: the cron sees at most 1,000 books and 1,000 state rows. Books
    past the cut are neither scheduled for extraction nor recognised as
    already done.
  - That feeds straight into the subject gate's full-text criterion and into
    AI retrieval coverage.
  - UNKNOWN: how much text extraction has actually been lost. Backfill
    scripts that page correctly may have covered the gap.
- **`/books` and `/search` facet lists** (`app/actions/filters.ts:7-51`,
  `app/actions/departments.ts:14-17`,
  `app/api/departments/trending/route.ts:19-22`). VERIFIED_CODE. They are
  distinct-value lists, so clipping drops rare languages, categories, formats
  and departments rather than skewing counts.
- **The `/books?format=` filter** (`lib/books-data.ts:128-131`) and
  **`/api/search/native` format filter** (`route.ts:530`, capped at 500).
  VERIFIED_CODE: both return an incomplete result set when the filter is
  applied.

### F-S2 · P2 · The science hierarchy points at a 404

- **Evidence.** VERIFIED_PRODUCTION.
  - `/subjects/គីមីវិទ្យា`, `/subjects/រូបវិទ្យា` and `/subjects/ជីវវិទ្យា` link
    their parent as `/subjects/វិទ្យាសាស្ត្រ` in three places: the
    breadcrumb, the "Subtopic of" chip, and the JSON-LD
    `BreadcrumbList` and `isPartOf`. That URL answers **404**.
  - The real science hub is `/subjects/វិទ្យសាស្ត្រ` (note the missing `ា`). It
    is in the sitemap, and its own `hasPart` correctly lists the three
    children.
  - The misspelled category name is what 401 science books display as their
    category badge.
- **Root cause.** VERIFIED_CODE + INFERRED.
  - `0146` built the tree from the name `'វិទ្យាសាស្ត្រ'`
    (`supabase/migrations/0146_subjects_canonical_backfill.sql:58-60`).
  - The `categories` row now carries the slug and name `វិទ្យសាស្ត្រ`.
  - `subjects.slug` is a copy, and the migration's own comment calls it "a
    copy that stopped being maintained". It has drifted from its source again.
- **Recommended fix.** Data: correct the category name and slug, and re-sync
  `subjects`, or re-sync only. Add a redirect from the stale slug if it was
  ever public. Add a check that every hierarchy slug resolves.
  **Kind of fix:** data + code (check).

### F-S3 · P2 · Subject pages are collection lists, not landing pages

- **Evidence.** VERIFIED_PRODUCTION + VERIFIED_CODE.
  - Every subject page renders a generic one-line intro, up to 12 items per
    resource type (`ITEMS_PER_TYPE`), a subtopic rail and a related rail.
  - Mathematics and Khmer also show their learning paths (5 and 4).
  - There is no editorial description, no English label, and no author
    section.
- **Strong subjects (depth + structure).**
  - `/subjects/គណិតវិទ្យា`: 440 books, 5 learning paths, 1 subtopic
  - `/subjects/វិទ្យសាស្ត្រ`: 401 books, 3 subtopics
  - `/subjects/ស្រាវជ្រាវ`: 109 books, 3 subtopics
  - `/subjects/អំណានកុមារ`: 128 books
  - `/subjects/ភាសាខ្មែរ`: 41 books, 4 learning paths
- **Weak subjects.**
  - `/subjects/ភាសា`: 4 books; its paths are the Khmer-reading ones already
    under ភាសាខ្មែរ, so it overlaps.
  - `/subjects/អប់រំ` (9) vs `/subjects/គរុកោសល្យ` (106) vs `/subjects/ទស្សនវិជ្ជាអប់រំ` (8):
    overlapping "education" labels.
  - `/subjects/ទស្សនវិជ្ជា` (7) and `/subjects/បច្ចេកវិទ្យា` (7) vs `/subjects/បច្ចេកវិទ្យាព័ត៌មាន` (34):
    near-duplicates.
  - `/subjects/វិញ្ញាសាប្រឡង` ("exam papers") is a document *type*, not a
    subject.
- **Recommended fix.** Editorial: a short librarian-written scope note and an
  English label for the top ~10 hubs. These already have the depth to be
  landing pages. The code change is small, but the rows need a
  `description` / `name_en` source, which is a schema decision.

---

## 8. Internal-link findings (VERIFIED_PRODUCTION)

| Question | Answer |
|---|---|
| Sitemap URLs with no click path from `/` | **0** |
| Book click depth from `/` | min 1 · median 3 · max 8 |
| Books at ≥4 clicks / ≥6 clicks | 405 / 158 |
| Books whose only inbound links are `/books?page=N` | 395 |
| Books with exactly one inbound linking page | 340 |
| Indexable pages reachable by no link at all | **223 author pages** (F-A1) |
| Links to a 404 | 1 URL, from 3 subject pages (F-S2) |
| Links to `noindex` pages, by design | `/books/*/read` from every book page; 27 composite authors from `/authors` (and its ItemList); 5 thin subjects from `/subjects` |
| Links to `noindex` pages, not by design | 14 junk-name author pages linked from 79 books (F-A2); 4 subjects noindexed by clipped counts, linked from books and the hub (F-S1) |
| Links to filtered URLs | `/books?dept=` ×2,187 (breadcrumb/badge fallback), `/contact?category&subject` ×1,957, `/?action=deposit\|request` on every page. All are `noindex` or canonicalised |
| Links to redirecting URLs | none observed |

Median depth 3 comes mostly from the MoEYS author page, which links 1,000
books at depth 2. Paging F-A1 would lift the remaining 37 MoEYS books too.

**Crawl-budget note (P3).** Each book page links its own `/read` URL several
times. `/read` is `noindex` with a canonical to the book, which is correct.
The side effect is that the crawlable URL space is twice the indexable one,
and every `/read` fetch costs a 331 KB origin render (§2.5).

---

## 9. Sitemap findings

### Table D — Indexability consistency (VERIFIED_PRODUCTION)

| URL type | In sitemap | Robots | Canonical | Internally linked | Status |
|---|---|---|---|---|---|
| Books | 1,956 / 1,956 | all `index` | all self | all | ✅ consistent |
| Authors (listed) | 238 | `index` | self | yes | ✅ |
| Authors (unlisted) | **0 of 223** | **`index`** | self | **no** | ❌ indexable orphans (F-A1) |
| Authors (junk-name) | 0 | `noindex` | self | **from 79 books** | ⚠️ page right, book JSON-LD wrong (F-A2) |
| Authors (composite) | 0 | `noindex` | self | from the hub | ✅ by design |
| Subjects | 25 | `index` | self | yes | ✅ with each other, ❌ with reality (F-S1) |
| Subjects (thin) | 0 | `noindex` | self | yes | ⚠️ 4 held back by clipped counts |
| Subject parent `/subjects/វិទ្យាសាស្ត្រ` | 0 | — (404) | — | from 3 pages | ❌ (F-S2) |
| Journals / article | 4 | `index` | self | yes | ✅. P3: 4 indexable URLs around one article |
| Theses, posts, paths | 2 / 2 / 9 | `index` | self | yes | ✅ |
| `/books?page=N` | 0 (by policy) | `index` | self | yes | ✅ |
| `/books/*/read` | 0 | `noindex` | → book | yes | ✅ |
| Catalogue records | 0 | `noindex` | self | yes | ✅ (all 6 records fail the derived-description rule; see §9.2) |

### 9.1 Size, limits and truncation

| | |
|---|---|
| CURRENT_SIZE | 2,267 URLs, 1.376 MB (≈607 bytes per URL including alternates) |
| CURRENT_SAFE_LIMIT | **50,000 URLs** per file (Google's per-file limit). The 50 MB limit binds later, at ≈86,000 URLs at today's bytes per URL. `app/sitemap.ts:140` caps at 50,000 and silently slices past it (:634-640) |
| CURRENT_RISK | **Low for size.** Headroom is 22×. **Real, and already present, for completeness:** the sitemap's author and subject membership is computed from clipped reads (F-A1, F-S1). Also: `fetchAllRows` ignores `error`, so a failed page mid-sweep ends the loop and returns a partial list with no warning (`app/sitemap.ts:92-104`, VERIFIED_CODE). The `journals` and `journal_issues_public` reads are unpaged (1 journal today, so no effect) |
| WHEN_CHUNKING_BECOMES_NECESSARY | At ~50,000 URLs. Today's collection would need to grow ~22-fold. Split well before that, at ~10,000 URLs per file, to keep a single fetch small and keep `lastmod` churn attributable |
| RECOMMENDED_ARCHITECTURE | A sitemap **index** at `/sitemap.xml`, with child files per resource family (`books-1.xml`, `books-2.xml` …, `authors.xml`, `subjects.xml`, `static.xml`) cut by stable id ranges. That keeps the `robots.txt` reference unchanged, which was the objection to `generateSitemaps()` noted at :135-139. Not needed now |

Other sitemap observations (P3):

- `<loc>` values are raw IRIs (Khmer unescaped), while the page canonicals
  are percent-encoded. Both resolve to the same resource. Google's guidance
  only requires entity-escaping.
- Sitemap alternates carry `en` and `km` but no `x-default`. The pages do
  carry `x-default`.
- Every book `lastmod` falls in 2026-09-07 … 09-23, from the September bulk
  work. That is accurate, but it tells an engine all 1,956 changed this month.

### 9.2 The recent anti-thin-description rule, measured

- **Scope.** The derived-description rule (#231) applies only to the
  physical catalogue (`/catalogs/*`).
- **Effect in production.** The catalogue holds **6 records**. All 6
  descriptions are field restatements, for example "Social sciences by Martin
  Ann M. DDC call number: 300 MAR.". All 6 are correctly `noindex` and absent
  from the sitemap. The rule works as designed.
- **Reach.** Its corpus is 6 pages. It does not touch the 1,956 books, and
  it would not catch the book corpus's actual problem (F-B1, 0 of 1,483).
- The catalogue listing shows "#3 THE BABY-SITTERS CLUB" twice, which looks
  like a duplicate record (P3, data).

---

## 10. Pagination findings (VERIFIED_PRODUCTION + VERIFIED_CODE)

- **Behaviour.**
  - `/books` has 109 pages of 18. Pages 2–109 are indexable, self-canonical,
    titled "… — Page N", and reachable through crawlable `<a>` pagination
    links.
  - There are no `<link rel=prev/next>` tags. Google no longer uses them.
    The `rel` values sit on the anchors (`components/ui/core/Pagination.tsx:199,256`).
  - Pages past the end answer 200 `noindex, follow`. Filtered and sorted
    variants answer `noindex, follow` and canonicalise to `/books`.
  - `/km/books?page=N` mirrors all of this.
- **Assessment.** Self-canonical deep pages are the right choice here. Every
  page lists different books, and 395 books are linked from nothing *but*
  these pages. Canonicalising them to page 1 would cut those books' only
  crawl path.
- **Duplicate-content risk.** Low. Titles differ, and the meta description is
  identical across all pages (it states the total count). That is acceptable
  for listing pages.
- **Minor defects (P3).**
  - `?page=2.5` canonicalises to `?page=2` while the body parses 2.5
    differently (`books/page.tsx:114` vs `parsePageParam`). No crawler
    reaches it through a link.
  - An out-of-range page still emits `CollectionPage` JSON-LD.
- **Sitemap policy.** Deep pages are correctly left out.

---

## 11. Search Console readiness

| Capability | State | Evidence |
|---|---|---|
| Property verification | **Live via HTML file**. The meta tag is empty | VERIFIED_PRODUCTION (200 on the file, no meta on `/`). VERIFIED_CODE (`public/googlee89036a09f36e87d.html`, `app/[locale]/layout.tsx:24,38-45`) |
| Search Console / Search Analytics API client | **NOT IMPLEMENTED** | VERIFIED_CODE. `googleapis` is used only by `lib/gmail.ts` (Gmail send) |
| URL Inspection API | **NOT IMPLEMENTED** | VERIFIED_CODE |
| OAuth / service account for GSC | **NOT IMPLEMENTED**. No env var names exist for it | VERIFIED_CODE (`.env.example`) |
| Scheduled collection | **NOT IMPLEMENTED** | VERIFIED_CODE (`.github/workflows/*`, `app/api/cron/*`) |
| Database tables | **NOT IMPLEMENTED**. `search_queries` / `search_result_clicks` are the site's *own* search box | VERIFIED_CODE (migrations 0080, 0087, 0121) |
| Admin reporting / alerts | **NOT IMPLEMENTED**. `/admin/search-insights` covers on-site search only | VERIFIED_CODE |
| Search Console data itself | **UNKNOWN — credentials not available to this audit** | |

The documentation agrees with the code (`docs/SEO-3.0-FINAL-REPORT.md:149`,
`docs/SEO-V3-AUDIT.md` D-12, `docs/SEO-SEARCH-CONSOLE-CHECKLIST.md`). GSC
has been used by hand only; one manual Live Inspection is recorded, on
2026-09-10.

### 11.1 Minimum architecture (proposal, not implemented)

1. **Auth.** A Google Cloud service account, added as a *restricted user* on
   the `sc-domain:` or URL-prefix property, with the read-only
   `webmasters.readonly` scope.
   - Credentials go in the server environment as a JSON key reference.
   - They are never exposed to the client and never committed.
2. **Collector.** `/api/cron/gsc-sync`, Bearer `CRON_SECRET`, scheduled
   daily by `.github/workflows/cron.yml` like the other crons.
   - It calls `searchanalytics.query` for the date `today − 3` (GSC data lags
     2–3 days).
   - Dimensions: `date,page,query,country,device`. `rowLimit` 25,000, paged
     with `startRow` to completion. Use `dataState: final`.
   - Re-pull the last 3 days to absorb late revisions.
3. **Aggregates without the query dimension.** Pull `date,page,country,device`
   separately. Google drops anonymised queries from query-level rows, so
   page totals must come from a page-level pull and not from summing query
   rows.
4. **URL Inspection.**
   - Budget: 2,000 inspections per property per day, and 600 per minute.
   - Run a rotating sample, for example the top 200 pages by impressions,
     plus 50 new books a day, plus every sitemap URL once a month. That is
     enough to track coverage state (`indexed`, `crawled – not indexed`,
     `duplicate – Google chose different canonical`) for the families in
     Table D.
   - The Index Coverage *report* itself has no API. Only per-URL inspection
     does.
5. **Storage.** Tables in §12, RLS-enabled and revoked from `anon` and
   `authenticated`, per `docs/RLS-MATRIX.md`.
6. **Reporting.** A tab in `/admin/search-insights`, split by page type × locale.
7. **Alerts.** Reuse the security-monitoring Telegram path at Sev 4.
   Example alert: "indexed share of `/books/*` fell >10% week-on-week". It
   must never fail CI (the `subject-gate.yml` principle).

---

## 12. Proposed internal SEO reporting model (proposal, not implemented)

**`gsc_search_daily`** holds one row per (date, page_url, query, country,
device).

| Column | Source |
|---|---|
| `date` | **Google** |
| `page_url` | **Google**: the canonical URL Google attributes clicks and impressions to |
| `query` | **Google**. Anonymised queries are absent by design |
| `country` (ISO-3166 alpha-3) | **Google** |
| `device` (DESKTOP / MOBILE / TABLET) | **Google** |
| `clicks`, `impressions` | **Google** |
| `ctr` | **Google**. Recompute for any aggregate as Σclicks / Σimpressions; never average it |
| `position` | **Google**. An average, so aggregate weighted by impressions |
| `search_type` | **Google** (web / image / …) |
| `locale` (`en` / `km`) | **PTEC-derived**: `/km` prefix of `page_url` |
| `page_type` (book / author / subject / journal / article / thesis / path / post / listing / static) | **PTEC-derived**: route pattern (`routeFamily()` in `lib/verify/crawl-policy.ts` already does this) |
| `resource_type`, `resource_id` | **PTEC-derived**: slug → id through the slug tables, including `book_slug_redirects` and subject-slug redirects, so a renamed slug keeps its history |
| `book_slug` / `author_slug` / `subject_slug` / `journal_slug` | **PTEC-derived**: one of these, from the path |
| `query_script` (km / latin / mixed) | **PTEC-derived**: the same script test as `lib/ai/query.ts` |

**`gsc_page_daily`** holds one row per (date, page_url, country, device) and
carries the true page totals (§11.1 step 3).

**`gsc_url_inspection`** holds one row per (inspected_at, url):
`coverage_state`, `indexing_state`, `google_canonical`, `user_canonical`,
`last_crawl_time`, `robots_txt_state`, `page_fetch_state`, all from Google.
PTEC derives `page_type`, `locale` and `canonical_matches` (Google canonical
= ours).

The derived columns should be computed at read time in a view. If they are
stored, they should be recomputable, because the slug maps change.

---

## 13. Performance findings

These are VERIFIED_PRODUCTION unless marked otherwise.

- **F-P1 · P2 · Every detail page renders at the origin on every request.**
  - All `/books/*`, `/authors/*`, `/subjects/*`, `/paths/*`, `/journals/*`
    pages, and the `/books` listing, are served `private, no-cache, no-store`.
  - Median full-download time through the audit proxy is ~450 ms (book
    pages), and 1.6 s for `/books`.
  - Googlebot's fetch of 1,956 book pages plus 1,956 `/read` pages is ~3,900
    origin renders per full crawl.
  - The cause of the dynamic rendering was not traced. It is UNKNOWN whether
    it is inherent: book pages have a signed-in reader section.
- **F-P2 · P2 · Unbounded entity pages.**
  - The MoEYS author page is 2.84 MB of HTML with 1,000 book links. It would
    be larger once F-A1 is fixed.
  - `/authors` is 1.27 MB, with 151 KB of inline SVG, rendering all 265
    entries.
  - Neither page paginates.
  - A works list of 1,000+ items should be paginated or capped with a
    "browse all" link *after* F-A1. It must not be done by re-introducing a
    cap that hides works, which is the failure `profile.ts:77` documents.
- **F-P3 · P3 · Payload composition.**
  - The flight payload is 47–62% of every document, and inline SVG is
    31–82 KB per page.
  - These remain the two largest items, as SEO 5.0 §6 predicted.
  - SEO5-09's card-field fix: the production book page is 458 KB against a
    budget page of 442 KB. The comparison is not like-for-like, because
    **the budget's reference book, `/books/assessment-for-learning`, now
    answers 404** (VERIFIED_PRODUCTION). `scripts/page-weight-budget.json`
    needs a live slug before `measure-page-weight.ts --compare` can be
    trusted (P3).
- Duplicated book data and repeated description text: each book's description
  appears in `<meta>`, OG, Twitter, JSON-LD, visible text, and again in the
  flight payload. It adds ~1–2 KB per page. That is not material.

---

## 14. Risks

- **The verifiers pass while the data is wrong.**
  `verify-subject-indexability.ts` (run 2026-09-23: 5/5 passed), the
  sitemap filter and the invariant tests assert that surfaces agree *with
  each other*. They never check that surfaces agree with the database total.
  Nothing detects a clip: F-A1 and F-S1 were invisible to every existing check.
- **Fixing F-A1 and F-S1 will change the sitemap.** Author and subject URLs
  will be added, some hubs will graduate, and counts will jump. That is
  correct, but it will look like a large unexplained change unless it is
  announced with the fix.
- **Rewriting descriptions at scale (F-B1) with a model would repeat the
  cause.** It must be editorial, or grounded in the book's own text (F-B5).
- **Auto-merging identities (F-A3) or auto-splitting names (F-A2) could
  attribute works to the wrong real person.** Merges and splits need
  librarian confirmation.
- **Retiring truncated-title "duplicates" (F-B2)** would archive real,
  distinct textbooks.
- **No Search Console data exists in this audit.** Every priority here is
  ranked on correctness and scale, not on observed search demand.

---

## 15. Recommended next steps

### Top 10 findings

| # | Finding | Severity | Evidence | Fix type |
|---:|---|---|---|---|
| 1 | Subject index and author directory built from ~1,000 of 1,956 books (F-S1, F-A1) | P1 | VERIFIED_PRODUCTION + VERIFIED_CODE | code |
| 2 | 223 indexable author pages orphaned (not in sitemap, hub or book links); 435 books unlinked from their author (F-A1) | P1 | VERIFIED_PRODUCTION | code |
| 3 | 75.8% of book descriptions are templates; 53.3% use one template (F-B1) | P1 | VERIFIED_PRODUCTION | editorial / data |
| 4 | 90 book credits publish `Person` for names the site's own rule rejects; 80 organisations typed Person; 4 Khmer composites as one Person, on PTEC Press books (F-A2) | P1 | VERIFIED_PRODUCTION + VERIFIED_LOCAL | code + data |
| 5 | 191 truncated titles make series volumes identical: 127 duplicate H1s, 108 identical descriptions (F-B2) | P1 | VERIFIED_PRODUCTION | editorial |
| 6 | Science hierarchy parent is a 404 in the breadcrumb and JSON-LD of 3 subject pages (F-S2) | P2 | VERIFIED_PRODUCTION | data + check |
| 7 | Publication year: 948 books claim 2026; every date is a fabricated `-01-01` (F-B3) | P2 | VERIFIED_PRODUCTION / INFERRED cause | data + small code |
| 8 | "Topics covered" block renders on 0 books (F-B5) | P2 | VERIFIED_PRODUCTION | data op |
| 9 | ISBN missing 92.8%, publisher 99.2%; MoEYS credited on foreign books (F-B4) | P2 | VERIFIED_PRODUCTION | editorial |
| 10 | All detail pages rendered per request; 2.84 MB author page (F-P1, F-P2) | P2 | VERIFIED_PRODUCTION | code |

### Proposed next implementation phase ("SEO 6.0 — truth in the entity layer")

1. **Page every whole-table read** that feeds a public surface.
   - At least `lib/subjects/index.ts:151-170` and
     `lib/authors/directory.ts:73-108`, plus the works queries in
     `lib/authors/profile.ts`, through the existing paged-sweep pattern with
     an `id` tiebreak.
   - Extend `lib/db/paginated-sweep.test.ts` to fail on an unbounded
     whole-table `.select()` in public loaders, not only on `.range()` loops.
   - The other reads that feed public surfaces are listed in the appendix
     on unpaged reads, and include the homepage tiles and the index
     reconciler.
2. **Add a parity verifier.**
   - Σ subject book counts = the published book total.
   - Directory credits = the published credits.
   - Every hierarchy slug resolves.
   - Run it next to `verify-subject-indexability.ts`.
3. **Apply the contributor trust rule on the canonical read path** for
   `source = 'manual'` rows. Add `និង` as a byline separator. Pin both
   against the production strings in F-A2.
4. **Emit year-precision `datePublished`.**
5. **Data operations, by the owner with production credentials:**
   - fix the science slug;
   - a semantic-insights dry run, then a write run;
   - the retitle queue for the 191 truncated titles.

Items 1–4 are small, local and testable offline. Item 5 is operational.

---

## Final recommendation

**NOW**

- **Highest-value issue:** the 1,000-row truncation in the subject index and
  author directory (F-S1 / F-A1). One class of bug makes subject counts,
  subject indexability, author listing, author sitemap membership, book → author
  links and the largest author page all wrong at once. The fix is paging plus a
  parity check.
- **Second issue:** stop publishing rejected and mistyped identities in book
  JSON-LD (F-A2). Apply the existing trust rule to manual canonical rows. Split
  on `និង`. Queue the 90 invalid credits and 80 organisation-as-Person credits
  for librarian repair.
- **Third issue:** start the description programme for the 1,483 templated
  books (F-B1).
  - First, make it measurable: a template-share metric in data quality.
  - Second, make genuine per-book content visible: populate semantic topics
    (F-B5).
  - Third, begin librarian descriptions on the books with the most demand.
    That list needs Search Console data (§11).

**NEXT**

- Retitle the 191 truncated titles, series first (F-B2).
- Repair the science hierarchy slug and add a check that every hierarchy
  link resolves (F-S2).
- Emit year-precision dates. Correct years the import stamped as 2026
  (F-B3).
- Build the Search Console collector and reporting model (§11–12).
- Paginate the MoEYS author page and `/authors` after the truncation fix
  (F-P2).
- Replace `page-weight-budget.json`'s 404 reference book (F-P3).

**LATER**

- English labels and scope notes for the ~10 deep subject hubs (F-S3).
- A sitemap index with per-family child files, well before 50,000 URLs (§9.1).
- Investigate why detail pages cannot be cached, and whether book pages can
  be partly prerendered (F-P1).
- ISBN and publisher enrichment from authoritative sources (F-B4).
- Grapheme-safe meta description truncation (F-B6).

**DO NOT FIX YET**

- **Noindexing thin author profiles (F-A4) or templated books (F-B1).** These
  pages are real records. Whether they earn impressions is a Search Console
  question, and withdrawing 394 author pages or 1,483 book pages on a
  heuristic would be larger than any defect measured here.
- **Merging suspected duplicate identities** (MoEYS KM/EN, Hang Chuon Naron
  KM/EN, NIE, Dell) without librarian confirmation (F-A3).
- **Model-written replacement descriptions**, or any synthetic landing pages
  for departments, programmes or years. The departments are a mix of Khmer
  and one English label ("Primary Education", 238 books) and overlap the
  subjects. The data does not yet support a separate department or programme
  page family.
- **Chunking the sitemap now.** It is at 4.5% of the file limit.
- **Changing the subject depth gate thresholds.** First fix the data the gate
  reads (F-S1). Then re-measure with the gate unchanged.
- **Journal hub thinness** (4 URLs for 1 article). Leave it until more
  articles exist or the rights position of the one hosted article is settled.

---

## Appendix — commands used (all read-only)

```sh
curl https://library.ptec.edu.kh/robots.txt
curl https://library.ptec.edu.kh/sitemap.xml
# ad-hoc GET-only crawler (outside the repo) using lib/verify/crawl-policy.ts
#   normalizeCrawlUrl(); concurrency 3; 4,388 + 119 + 251 URLs
npx tsx scripts/verify-subject-indexability.ts             # 5/5 passed
# repository pure functions over production-derived inputs:
#   lib/resources/contributor-trust.ts   assessContributorName()
#   lib/resources/contributor-identity.ts normalizeByline()
#   lib/authors/slug.ts                  authorSlug()
#   lib/catalogs/derived-description.ts  isDerivedDescription()
#   lib/catalogs/indexability.ts         assessCatalogIndexability()
```

Nothing here wrote to production, and no secret was read or printed.

## Appendix — unpaged whole-table reads under the 1,000-row cap

These come from a code sweep of public, SEO, API and cron paths.

- **CLIPPED today** means the table is known to exceed 1,000 rows (books
  1,956), and the read neither pages nor narrows to a record.
- **UNKNOWN** means the table's production size could not be established.
- **VERIFIED_PRODUCTION** means the undercount was also observed on the live
  site.

| file:line | Table | Feeds | Verdict |
|---|---|---|---|
| `lib/subjects/index.ts:153` | books | `/subjects`, `/subjects/*`, sitemap subject set, book → subject links, AI subject list | **CLIPPED** · VERIFIED_PRODUCTION (Σ = 1,000) |
| `lib/subjects/index.ts:164-170` | resource_index_state | subject full-text criterion | CLIPPED once >1,000 records are indexed (documented 1,695) · INFERRED |
| `lib/subjects/index.ts:154-159` | research_reports, publications, catalog_books | subject counts | UNKNOWN (small today) |
| `lib/authors/directory.ts:92` | books | `/authors`, sitemap author set, book → author links, AI | **CLIPPED** · VERIFIED_PRODUCTION |
| `lib/authors/directory.ts:104-108` | resource_contributors (`.limit(10000)`) | same | **CLIPPED** (≥1 credit per book) |
| `lib/authors/directory.ts:73-78,103` | publication_authors, authors, contributors (`.limit(5000)`) | same | UNKNOWN (<1,000 per docs) |
| `lib/authors/profile.ts:207,254,285,315` | per-author works (`PER_TYPE_LIMIT` 5000) | `/authors/<slug>` | **CLIPPED for MoEYS only** · VERIFIED_PRODUCTION (1,000 of 1,037) |
| `lib/home-data.ts:81-84` | books → departments | homepage "Browse by Subject" tiles | **CLIPPED** · VERIFIED_PRODUCTION (256 vs 749) |
| `lib/indexing/reconcile.ts:98` | books (+book_files) | hourly index reconciler | **CLIPPED** · VERIFIED_CODE |
| `lib/indexing/reconcile.ts:221-223` | resource_index_state (no filter) | same | **CLIPPED** (one row per indexed resource) · VERIFIED_CODE |
| `app/actions/filters.ts:7-51` | books, book_files | `/books` and `/search` language/category/format facet lists | **CLIPPED** (rare values lost) · VERIFIED_CODE |
| `app/actions/departments.ts:14-17`, `app/api/departments/trending/route.ts:19-22` | books → departments | `/search` department list | **CLIPPED** · VERIFIED_CODE |
| `lib/books-data.ts:128-131` | book_files by format | `/books?format=` | **CLIPPED** · VERIFIED_CODE |
| `app/api/search/native/route.ts:530` | book_files by format (`.limit(500)`) | native search format filter | **CLIPPED at 500** · VERIFIED_CODE |
| `lib/books/restricted.ts:65-68` | books, catalogue-only ids | AI and native-search restriction list | UNKNOWN. 46 books are not free to read today, so safe until >1,000 are catalogue-only. It is a security boundary, so page it anyway |
| `app/sitemap.ts:518-532` | journals, journal_issues_public | sitemap | UNKNOWN (1 journal today) |
| `app/sitemap.ts:92-104` | `fetchAllRows` | sitemap | PAGED-OK, but a mid-sweep `error` ends the loop silently |
| `lib/oai/records.ts`, `lib/metadata-exports/works.ts` | — | OAI-PMH, exports | PAGED-OK | The
Supabase anon key embedded in the public bundle was deliberately not used, so
every data claim rests on rendered pages, not on direct table reads.
