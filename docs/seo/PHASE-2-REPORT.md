# Phase 2 report: hubs, titles and internal links

Branch `seo/phase-2-hubs`, stacked on `seo/phase-1-quick-fixes` (none of the
three SEO branches is merged or pushed). Verified against a local production
build (`rm -rf .next && SEO_INDEXING=on npm run build`, then `next start`)
reading the local Supabase stack, per decision D13.

## Phase 2 report

**Findings addressed:** F2 (hub content), F3 (record titles), F8 (author
pages), F12 (catalogue records, `llms.txt`), F16 (slug length), N5 (hub title
vs H1), and item 2.5 (record internal links).

**Changes**

| Commit | Finding | What changed |
|---|---|---|
| `feat(seo): F2 subject hubs list every book …` | F2 | Migration **0161** (additive): `categories.name_en`, `intro_en`, `intro_km`, `intro_status` (default `draft`). The subject page lists **every** book of the subject, most-downloaded first, at `?page=N` (self-canonical; `noindex` past the last page); it used to show 12 and send "Browse all" to the unfiltered `/books`. Title `{Subject} Books & Teaching Resources ({n} free e-books)`. An English page shows an approved English name with the Khmer one in parentheses, never a guessed translation. The approved intro replaces the generic line and the counts description. The page now renders per request, like `/books`; its two data reads are cached for an hour under the subject index's tags. |
| `feat(seo): F2 draft subject intros …` | F2 | `content/drafts/subject-intros.json`: English and Khmer drafts for all 35 production subjects, built only from counts, most-downloaded titles, sub-topics and learning paths. All `needs_review`, Khmer `TODO(km-review)`, English names are suggested translations marked `needs_review`. `scripts/seo-import-subject-intros.ts` imports approved entries only (dry run by default). |
| `feat(seo): F2 approved-only intros for the collection hubs` | F2 | `content/hub-intros.json` (approved only, empty) renders under the header of `/books`, `/theses`, `/journals`, `/posts`, `/authors`, `/catalogs`. Drafts for all six are in `content/drafts/hub-intros.json` (English 84–107 words, from existing site copy). No page reads the drafts file. |
| `feat(seo): F3 book titles …` | F3, 2.5 | `{title} — {subject}{, Grade N}{ (PDF)} · {brand}`, each part only when the record has it and the title does not already say it. Past the budget the parts drop in this order: brand, format, grade, subject. The title itself is never cut. `(PDF)` still needs `SEO_PDF_TITLE_SUFFIX=on` (rights review); an admin `seo_title` is kept as written. The visible book breadcrumb now matches its `BreadcrumbList` item for item. The subject hub, parent, sub-topics and related subjects use approved English names on English pages. |
| `feat(seo): F8 author pages index on depth …` | F8, D2 | Indexable with ≥ `SEO_AUTHOR_MIN_WORKS` works (default 3), or an approved biography and ≥ 1 work; otherwise `noindex, follow` and out of the sitemap. One function decides both, fed the directory's own figures. Migration **0162** (additive): optional `authors` fields (`bio_km`, `bio_status`, `affiliation`, `position_title`, `orcid`, `scholar_url`, `is_ptec_staff`) and `publication_authors.is_ptec_staff`. PTEC staff pages list the theses they advised. The journal-author form gets a "PTEC staff" switch. |
| `feat(seo): F12 catalogue records link to their e-book …` + `fix … surname-first` | F12 | A print record links "Also in the digital library — Read the e-book" when one published book has its ISBN, or its normalized title **and** author, and more than one match links nowhere. Such a record is `noindex` because the e-book is the page to rank. `llms.txt` no longer lists noindex catalogue records, no longer says the English URL is canonical for Khmer pages, and no longer implies books and theses carry a licence. |
| `feat(seo): F16 cap the slug …` | F16, D8 | A new record's title-derived slug keeps its first 8 words and at most 60 characters (ICU-segmented Khmer, never cut inside a cluster). It is applied only on create; `slugify()` is unchanged because it also identifies existing rows. A 101-character Khmer thesis title becomes a 46-character slug (414 characters encoded, from about 900). |
| `fix(seo): N5 …` | N5 | `/paths`: the pill that says "Teacher Learning Paths" is now the H1, and the slogan is a paragraph with the same classes, so nothing moves on screen. `/authors`: the `<title>` is the H1 with its section name. |
| `fix(seo): a subject page past its last page renders, noindex` | F2 | Found by the harness: PostgREST answers 416 for an offset past the end, and the page returned 500. It now renders the empty page. The harness gains `hub-title-h1` (phase 2, N5). |

**Evidence**

- `seo-check --phase 2` against the local build, local URL list: **0 failing in
  phases 0, 1 and 2**; 1,383 ok, 6 advisory warnings, 0 unchecked, 0 5xx. The
  first run aborted on a 500 (`/subjects/mathematics?page=999`); fixed, rebuilt,
  rerun.
- Rendering modes (build route tables, before vs after): the only change is
  `/[locale]/subjects/[slug]` ● → ƒ, as intended. The subject page renders in
  about 45 ms warm (it was about 19 ms as a cached page; load average was 140
  during that measurement).
- `scripts/seo-sitemap-counts.ts`: books 14/14, theses 4/4, articles 5/5,
  posts 2/2, paths 9/9.
- `tsc --noEmit` 0 errors; `npm run lint` 0 errors (172 warnings, the same
  count as before); `vitest run` **8,948 passed** (72 new tests); `next build`
  exit 0 from a clean `.next`.
- E2E against the build (Chromium; seo, learning-paths, catalogs,
  featured-books, journals, journal-article, subject-slug-redirect,
  mobile-shell): **135 passed**, 6 skipped, 2 failed. Both failures are the two
  `catalogs` data failures Phase 1 recorded: this machine's database holds the
  2,643-record PMB import, so a title search returns 18 rows where the seed
  expects 1.
- Importer end to end on the **local** database only: a throwaway approved
  intro was imported. The subject page used it as its body text and as its
  meta description, and the title followed the new pattern. The row was then
  reverted; the local database holds no approved intro or name.
- Production, read-only and sequential:
  - The catalogue matcher links **1 of 2,638** records (SPSS Survival Manual).
    No production catalogue record carries an ISBN, and 40 more pairs share a
    title but name different authors (`docs/seo/catalogue-twin-candidates.csv`).
  - The production sitemap lists **361** author URLs today.
  - The number that will stay indexable could not be measured: production
    REST reads timed out from here late in the session, so I stopped.

**Drafts awaiting review**

- `content/drafts/subject-intros.json` covers 35 subjects:
  - 32 English drafts are under 80 words, because the database holds no more
    facts, and each says so.
  - 35 English-name suggestions.
  - 2 Khmer spelling questions (កញ្ជប់ vs កញ្ចប់; វិទ្យសាស្ត្រ vs វិទ្យាសាស្ត្រ).
- `content/drafts/hub-intros.json`: 6 hubs.
- `docs/seo/KM-REVIEW.md`: 7 new composed Khmer strings (subject title
  patterns, "Theses advised", the catalogue e-book link, the `/authors` title).
- `docs/seo/catalogue-twin-candidates.csv`: 40 pairs for librarians.

**Runbook items added:** "Phase 2: publishing reviewed introductions and
names" in `docs/seo/RUNBOOK.md`. It covers the import procedure, hub
approval, author-biography approval, and the after-deploy checks.

**Risks and follow-ups**

- **Author pages (D2).** Most author pages will become `noindex, follow` and
  leave the sitemap: most authors here have one or two works and no approved
  biography. That is the approved decision. After deploy, compare
  `/sitemaps/authors.xml` with today's 361. Biographies approved later bring
  pages back with no deploy.
- **Book-author biography approval has no admin control yet.** Journal
  authors are covered by publishing the profile. For a book author it is one
  SQL row; an admin control is small and could join Phase 5's review queue.
- **Subject pages render per request.** The data reads are cached, so the
  added cost is the render. Phase 6's performance pass should include them.
- **Catalogue records with a real description** are still `index` (the #231
  gate) but, since Phase 1, are not in the sitemap. None exists in production
  today. See decision P2-1.
- **Migrations 0161/0162** are additive and the code reads around their
  absence, so deploy order does not matter. They are applied on the box after
  merge, like every migration.
- **Production verification** after deploy is in the runbook section above,
  plus `npx tsx scripts/seo-check.ts --base https://library.ptec.edu.kh --phase 2 --delay 1500`.

**Decisions needed**

- **P2-1.** A described catalogue record with no e-book is `index` but not in
  the sitemap. Choose one:
  - (a) make all catalogue records `noindex` (recommended; it matches the
    master prompt's "keep noindex, follow", and none are affected today);
  - (b) put described records back in the sitemap.
- **P2-2.** The 40 same-title pairs. Choose one:
  - (a) leave them unlinked (recommended until a librarian has checked them);
  - (b) add a librarian-set `catalog_books.digital_book_id` so confirmed pairs
    link (a migration, and it needs your approval).
