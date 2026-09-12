# Historical Contributor Migration — the report, not the migration

**Status: NOT EXECUTED. Nothing in this document has been applied to any
database.**

**Evidence:** production (`https://supabase.storage-ptec.online`), read-only,
2026-09-12, via `scripts/audit-contributors.ts` with the institution identity
resolved from published System Settings.

Regenerate:

```bash
npx tsx scripts/audit-contributors.ts \
  --identity <identity.json> \
  --markdown docs/SEO-3.2-HISTORICAL-CONTRIBUTOR-MIGRATION.generated.md \
  --json reports/seo/composite-authors.json
```

---

## 1. What the rows are

`public.authors` holds one row per *contributor expression* — the byline string
as it was catalogued. `books.author_id` is a **singular** foreign key, so a book
with three authors stored the whole byline as one row, and that row was given a
slug and a public URL.

157 expressions, classified deterministically:

| Category | Count | Share |
| --- | --- | --- |
| `SAFE_SINGLE` | 85 | 54.1% |
| `SAFE_MULTIPLE` (composite) | **43** | 27.4% |
| `ORGANIZATION` | 27 | 17.2% |
| `INSTITUTION` | 2 | 1.3% |
| `AMBIGUOUS` | 0 | 0.0% |
| `EMPTY` | 0 | 0.0% |

All 157 have a populated `slug` and therefore a routable, indexable
`/authors/<slug>` URL. 16 carry a role marker inside the stored name.

## 2. Why splitting is unsafe

Three reasons, in order of weight.

**A composite URL has no single 301 target.** `/authors/bert-p-m-creemers-
leonidas-kyriakides-pam-sammons-editors` denotes three editors. Splitting the
row mints three new URLs and retires one. Redirecting the old URL to any one of
the three asserts that the work is that person's — the same fabrication this
whole line of work exists to remove, dressed as a redirect. Leaving it as a 404
discards an indexed URL that currently serves a real page with real works.

**The work counts are small and real, not thin-page noise.** 42 of the 43
composites are credited on at least one published book (39 × 1 book, 2 × 2
books, 1 × 3 books; 1 has none). These are live pages carrying real content, so
"delete and forget" is not on the table.

**`books.author_id` cannot express the result.** Splitting one `authors` row
into three leaves the book pointing at one of them. Correctly crediting all
three requires the book's credits to live in `resource_contributors` — which,
in production, is **empty** (`docs/SEO-3.2-AUDIT.md` §0). Splitting the author
table before the graph carries the credits would lose authorship, not normalise
it.

**Therefore the order is fixed: backfill the graph first, verify coverage, and
only then consider the URL question.** SEO 3.2 does the first half — it makes
the graph the preferred read with an explicit legacy fallback, so a backfill
changes what pages say without any code change.

## 3. Categories used

| Category | Meaning | URL consequence |
| --- | --- | --- |
| `SAFE_KEEP` | one person — nothing to decide | none |
| `SAFE_SPLIT` | several people, deterministically separable | **high** — 1 URL becomes N, no single 301 target |
| `ORGANIZATION` | a corporate body; the row is correct as one entity | none — retype only |
| `INSTITUTION` | PTEC itself; resolves to `#organization` | none — already handled at render time |
| `AMBIGUOUS` | names several entities, not safely separable | review |
| `HUMAN_REVIEW` | no deterministic disposition | review |

`SAFE_SPLIT` means **"the string can be separated deterministically"**. It does
not mean "these are the right people", and it never authorises a redirect
target.

## 4. Safe now, without touching a URL

Two of the six categories need no URL decision at all and are already handled
by rendering:

* **27 `ORGANIZATION` rows** are typed `Organization` in JSON-LD today
  (verified live: `/authors/ministry-of-education-youth-and-sport` →
  `{"@type":"Organization"}`).
* **2 `INSTITUTION` rows** resolve to a bare `@id` reference to the site's own
  `#organization` node (verified live:
  `/authors/phnom-penh-teacher-education-college` →
  `{"@id":"https://library.ptec.edu.kh/#organization"}`).

And as of SEO 3.2, **the 43 composites assert no identity at all** rather than
publishing their first name as a `Person`. That removes the untrue claim
without moving a single URL — which is exactly the point of deferring.

## 5. A possible later URL strategy — not adopted

Recorded so the deferral is a decision rather than an absence. If the split is
ever taken up:

1. Backfill `resource_contributors` from `books.author` so every author of a
   multi-author book is credited individually. No URL moves.
2. Verify with `scripts/audit-contributor-graph.ts` that coverage is complete
   and conflicts are zero.
3. Give each *new* contributor its own `/authors/<slug>` URL, created fresh.
4. **Keep the composite URL alive** as a page that lists its constituent
   contributors and links to them — a real disambiguation page, `noindex,
   follow`. That is the only shape with no false 301 in it: no visitor is sent
   to the wrong person, no link equity is asserted onto one of three, and
   Search Console gets no submitted-URL-404s.
5. Retire the composite `authors` row only once nothing references it.

Step 4 is what makes the whole thing safe and is also what makes it a project
rather than a migration. It is not in scope here.

## 6. The rows

The generated table is below. It asserts no identity: `Contributors` is how
many entities the deterministic splitter finds, not a claim about who they are.

### The 43 composite rows

| # | Name | Slug | Works | Classification | Contributors | URL risk | Recommended |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Alan Crawford, Wendy Saul, Samuel R. Mathews, James Makinster | `alan-crawford-wendy-saul-samuel-r-mathews-james-makinster` | 1 | SAFE_MULTIPLE | 4 | high | SAFE_SPLIT |
| 2 | Bert P.M. Creemers, Leonidas Kyriakides, Pam Sammons (Editors) | `bert-p-m-creemers-leonidas-kyriakides-pam-sammons-editors` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 3 | Bill Atweh, Stephen Kemmis, Patricia Weeks (Editors) | `bill-atweh-stephen-kemmis-patricia-weeks-editors` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 4 | David Evans, Paul Gruba, Justin Zobel | `david-evans-paul-gruba-justin-zobel` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 5 | David Scott, Marlene Morrison | `david-scott-marlene-morrison` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 6 | Donald Ary, Lucy Cheser Jacobs, Chris Sorensen | `donald-ary-lucy-cheser-jacobs-chris-sorensen` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 7 | Donna Kalmbach Phillips, Kevin Carr | `donna-kalmbach-phillips-kevin-carr` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 8 | Ernest T. Stringer, Lois McFadyen Christensen, Shelia C. Baldwin | `ernest-t-stringer-lois-mcfadyen-christensen-shelia-c-baldwin` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 9 | Geoffrey E. Mills, L. R. Gay | `geoffrey-e-mills-l-r-gay` | 2 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 10 | Geoffrey R. Marczyk, David DeMatteo, David Festinger | `geoffrey-r-marczyk-david-dematteo-david-festinger` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 11 | Gloria Ladson-Billings, William F. Tate (Editors) | `gloria-ladson-billings-william-f-tate-editors` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 12 | Jack R. Fraenkel, Norman E. Wallen, Helen H. Hyun | `jack-r-fraenkel-norman-e-wallen-helen-h-hyun` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 13 | John Flowerdew, Pejman Habibie | `john-flowerdew-pejman-habibie` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 14 | John W. Creswell, Cheryl N. Poth | `john-w-creswell-cheryl-n-poth` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 15 | K. B. Everard, Geoffrey Morris, Ian Wilson | `k-b-everard-geoffrey-morris-ian-wilson` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 16 | Kenneth N. Berk, Patrick Carey | `kenneth-n-berk-patrick-carey` | 0 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 17 | L. R. Gay, Geoffrey E. Mills, Peter Airasian | `l-r-gay-geoffrey-e-mills-peter-airasian` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 18 | Leonard A. Jason, David S. Glenwick (Editors) | `leonard-a-jason-david-s-glenwick-editors` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 19 | Louis Cohen, Lawrence Manion, Keith Morrison | `louis-cohen-lawrence-manion-keith-morrison` | 3 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 20 | Maree Gosper, Dirk Ifenthaler (Editors) | `maree-gosper-dirk-ifenthaler-editors` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 21 | Marguerite G. Lodico, Dean T. Spaulding, Katherine H. Voegtle | `marguerite-g-lodico-dean-t-spaulding-katherine-h-voegtle` | 2 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 22 | Matthew B. Miles, A. Michael Huberman, Johnny Saldaña | `matthew-b-miles-a-michael-huberman-johnny-saldaña` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 23 | Oon-Seng Tan, Woon-Chia Liu, Ee-Ling Low (Editors) | `oon-seng-tan-woon-chia-liu-ee-ling-low-editors` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 24 | Pat Bazeley, Kristi Jackson | `pat-bazeley-kristi-jackson` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 25 | Perry R. Hinton, Charlotte Brownlow, Isabella McMurray, Bob Cozens | `perry-r-hinton-charlotte-brownlow-isabella-mcmurray-bob-cozens` | 1 | SAFE_MULTIPLE | 4 | high | SAFE_SPLIT |
| 26 | R. Burke Johnson, Larry Christensen | `r-burke-johnson-larry-christensen` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 27 | Richard L. Scheaffer, William Mendenhall III, R. Lyman Ott, Kenneth G. Gerow | `richard-l-scheaffer-william-mendenhall-iii-r-lyman-ott-kenneth-g-gerow` | 1 | SAFE_MULTIPLE | 4 | high | SAFE_SPLIT |
| 28 | Robert H. Carver, Jane Gradwohl Nash | `robert-h-carver-jane-gradwohl-nash` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 29 | Ron White, Andy Hockley, Julie van der Horst Jansen, Melissa S. Laughner | `ron-white-andy-hockley-julie-van-der-horst-jansen-melissa-s-laughner` | 1 | SAFE_MULTIPLE | 4 | high | SAFE_SPLIT |
| 30 | Ronghuai Huang, J. Michael Spector, Junfeng Yang | `ronghuai-huang-j-michael-spector-junfeng-yang` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 31 | Sara Efrat Efron, Ruth Ravid | `sara-efrat-efron-ruth-ravid` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 32 | Stephen D. Lapan, MaryLynn T. Quartaroli, Frances Julia Riemer (Editors) | `stephen-d-lapan-marylynn-t-quartaroli-frances-julia-riemer-editors` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 33 | Stephen Gorard, Chris Taylor | `stephen-gorard-chris-taylor` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 34 | Stephen Howe, Kristina Henriksson | `stephen-howe-kristina-henriksson` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 35 | Stephen Kemmis, Robin McTaggart, Rhonda Nixon | `stephen-kemmis-robin-mctaggart-rhonda-nixon` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 36 | Steven J. Taylor, Robert Bogdan, Marjorie L. DeVault | `steven-j-taylor-robert-bogdan-marjorie-l-devault` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 37 | Suzanne Choo, Deb Sawch, Alison Villanueva, Ruth Vinz (Editors) | `suzanne-choo-deb-sawch-alison-villanueva-ruth-vinz-editors` | 1 | SAFE_MULTIPLE | 4 | high | SAFE_SPLIT |
| 38 | Valerie Hill-Jackson, Chance W. Lewis (Editors) | `valerie-hill-jackson-chance-w-lewis-editors` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 39 | Young Hoan Cho, Imelda S. Caleon, Manu Kapur (Editors) | `young-hoan-cho-imelda-s-caleon-manu-kapur-editors` | 1 | SAFE_MULTIPLE | 3 | high | SAFE_SPLIT |
| 40 | ខាំ សុមករា, គង់ ប៊ុនធី, ប៊ុន ស្រុង, លីន ញ៉ក់, ឡាយ រតនា, ឡាយ ណូរ៉ា | `ខាំ-សុមករា-គង់-ប៊ុនធី-ប៊ុន-ស្រុង-លីន-ញ៉ក់-ឡាយ-រតនា-ឡាយ-ណូរ៉ា` | 1 | SAFE_MULTIPLE | 6 | high | SAFE_SPLIT |
| 41 | ង៉ែត រ៉ាប៊ី, នាង សារិន | `ង៉ែត-រ៉ាប៊ី-នាង-សារិន` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
| 42 | ផេង ពង្សរ៉ាស៊ី, ដេវីដ ឆេនដល័រ, គ្រីស្តូហ្វ័រ ឌៀរីង, សុភ័ក្ត្រ ភាណា | `ផេង-ពង្សរ៉ាស៊ី-ដេវីដ-ឆេនដល័រ-គ្រីស្តូហ្វ័រ-ឌៀរីង-សុភ័ក្ត្រ-ភាណា` | 1 | SAFE_MULTIPLE | 4 | high | SAFE_SPLIT |
| 43 | វង់ សុធារ៉ា, ណុប សុខា | `វង់-សុធារ៉ា-ណុប-សុខា` | 1 | SAFE_MULTIPLE | 2 | high | SAFE_SPLIT |
