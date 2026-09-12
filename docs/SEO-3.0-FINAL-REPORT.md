# SEO 3.0 — Final Report

**Date:** 2026-09-12
**Branch:** `feat/ai-brain-2-2-page-intelligence`
**Companion:** [SEO-3.0-AUDIT.md](SEO-3.0-AUDIT.md) (Phase 0, with the evidence)

---

## 1. Executive summary

The brief asks for a technical SEO foundation to be built. **Measurement says it
already exists and is correct**, so this pass did not rebuild it.

`scripts/audit-sitemap-links.ts` crawled **all 497 production sitemap URLs:
497 × 200, zero broken, zero redirecting.** Canonicals, reciprocal hreflang,
`$`-anchored robots rules, the documented parameter policy (including
out-of-range pagination), the subject indexability gate and genuinely
first-class Khmer all verified correct against live HTML. The brief's Phase 1
found **no defects to fix**.

What had changed since SEO V3 was not the code but the **collection**. V3 was
audited against a site publishing **3 books** and therefore gated most content
work as "thin at current volume". Production now publishes **287 book URLs, 158
author URLs, 25 subject URLs**. That growth did not create new technical debt —
it made an existing, invisible **entity-truth** defect measurable:

> The library asserted that **PTEC is a `Person`** — on
> `/authors/phnom-penh-teacher-education-college`, in the same document whose
> site graph declares that exact name as an `EducationalOrganization` at
> `#organization`. One document, one institution, two entity types, two `@id`s.

That was one symptom of one root cause: **every byline was typed `Person`,
unconditionally, at eight call sites.** A byline here is free text off a title
page, and 30% of the time it is not one person.

Two defects were fixed and verified; two were fixed in code and await deploy;
one is specified and deliberately **not** attempted.

---

## 2. Findings

### F-1 · PTEC asserted as a `Person` — **High — fixed**

| | |
|---|---|
| **Evidence** | `/authors/phnom-penh-teacher-education-college` emitted `ProfilePage → mainEntity → {"@type":"Person","name":"Phnom Penh Teacher Education College"}` beside the correct `EducationalOrganization` at `#organization`. |
| **Root cause** | No byline builder consulted the site's own identity; `entity-graph.test.ts` guards *declaration* sites, not byline builders, so it could not see this. |
| **Fix** | A byline naming the institution now resolves to a bare `@id` reference to `#organization` — a second institution node is **unrepresentable** from a byline, not merely avoided. |
| **Files** | `lib/seo/contributor.ts`, `app/[locale]/(public)/authors/[slug]/page.tsx` |
| **Tests** | `lib/seo/contributor.test.ts` — "NEVER emits a Person carrying the institution's name" |

### F-2 · Corporate bodies typed as `Person` — **High — fixed**

At least 7 of 157 author entities (English-detectable only; the collection is
largely Khmer) and `Book.author` on Khmer titles: `ក្រសួងអប់រំ យុវជន និងកីឡា`
— the Ministry of Education, Youth and Sport — was emitted as a `Person`.

Now classified as `Organization` via vocabulary in **both scripts**. An
English-only word list would have left every Khmer ministry and university
typed as a human, which is the failure mode the Khmer list exists to prevent.

### F-3 · Several people collapsed into one `Person` — **High — fixed**

47 of 157 (30%) author entities were multi-person bylines published as one
human; 16 carried a role word inside the person's name.

Bylines are now split into one correctly-typed node each, with role markers
removed:

```
before  {"@type":"Person","name":"Bert P.M. Creemers, Leonidas Kyriakides, Pam Sammons (Editors)"}
after   [{"@type":"Person","name":"Bert P.M. Creemers"},
         {"@type":"Person","name":"Leonidas Kyriakides"},
         {"@type":"Person","name":"Pam Sammons"}]
```

**Splitting is deliberately conservative.** A comma also inverts a single name,
so a comma-delimited byline splits only when *every* resulting segment is a full
name (≥2 tokens): `"Smith, John"` stays whole. Where a byline is demonstrably
several people but cannot be separated safely, **no claim is published at all**
— omission is honest, fabrication is not (§0.5). Being wrong by refusing costs
a less granular but true node; being wrong by splitting invents a person.

### F-4 · A tenth `book-<epoch>` subject slug — **Medium — fixed, awaiting deploy**

`/subjects/book-1781239299098` (`កញ្ជប់គណិតវិទ្យា`, 18 resources) was live,
indexed and self-canonical. Its timestamp is ~1,176 s later than the latest of
the nine migration 0142 handled: a category created after that set was
enumerated, so 0142 could not see it.

It holds real resources, so the **URL** is the defect — it is renamed and 301'd,
never deleted. Migration `0143` mirrors 0142's structure (idempotent,
collision-safe, name-drift tolerant); the redirect table gains the tenth pair.

*Note:* the target slug appeared to be occupied — `/subjects/កញ្ជប់គណិតវិទ្យា`
answered 200 — which would have been a collision. It was not: that 200 was F-6.

### F-5 · No author indexability threshold — **Low — not implemented, deliberately**

§8 asks for one; there is none. An author whose every work is unpublished
renders an empty profile at `index, follow`.

**Not implemented because no such author was demonstrated to exist.** Every
author row in this library originates from a resource, and all 158 sitemap
author URLs returned 200 with works. Adding a gate against a hypothesis risks
noindexing real profiles to fix a condition not observed. The prerequisite is a
count against the production `categories`/`authors` tables, which this
environment cannot reach (see §5). Specified in §4 as ready-to-build.

### F-6 · `/subjects/<unknown>` was a soft 404 — **Medium — fixed, verified locally**

```
before   /subjects/definitely-not-real-xyz → 200   ("Nothing here yet")
after    /subjects/definitely-not-real-xyz → 404
         /subjects/education               → 200   (unchanged)
         /subjects                         → 200   (unchanged)
```

**This independently corrected the Phase 0 audit**, which had recorded
"unknown slug → 404" after measuring `/books/` and `/authors/` only.

`RESOURCE_GATES` covered seven public detail routes; `subjects` was the eighth
and was missing, so middleware never gated it and the streamed `loading.tsx`
shell sent 200 before the page could call `notFound()`.

It could not have been added before this pass: `publishedColumn` was
**required**, and `categories` has no publication column — a category is public
by existing. Gating on a column that does not exist would emit
`&undefined=eq.true`, a filter PostgREST rejects, failing the gate *open* on
every request. `publishedColumn` is now optional and one `publishedFilter()`
helper builds the clause, so that shape cannot recur.

**The dependency that makes it safe:** the gate reads with the **anon** key
while subject pages read with the service client. A table RLS hid from anon
would return zero rows — indistinguishable from "no such slug" — and would 404
all 25 real subject pages. `categories` is anon-readable (RLS "Categories are
viewable by everyone" + `grant select` in `0117`), verified before shipping and
recorded in the config comment.

---

## 3. What was deliberately NOT built (§39)

| Asked for | Decision | Why |
|---|---|---|
| §14 `/learn/*` topic & guide landing pages | **Refused** | The corpus supports the *resources*; there is no authored prose for these topics and none may be invented (§0.5). Built today they would aggregate links under a generated heading — the doorway page §15 forbids. The blocker is editorial content, not code. |
| §15 programmatic filter/subject/language URLs | **Refused** | The thin-page explosion §15 forbids. The existing facet policy (`noindex, follow` + canonical to base) is already correct and verified. |
| §25/§7 Search Console ingestion | **Not built** | No Search Console property is connected to this repository. §25 forbids inventing metrics, and an ingestion pipeline with no source produces a dashboard of zeros. |
| §26/§27 single SEO score + admin panel | **Not built** | `getMetadataQualityReport()` already scores metadata completeness and drives a repair queue. A second scoring surface would be the duplicate-source-of-truth this codebase repeatedly removes. |
| Faculty / department / lecturer pages | **Still refused** (unchanged from V3) | No trustworthy person mapping exists between the library and `www.ptec.edu.kh`. Matching on names alone fabricates identities. |
| Splitting composite `authors` **rows** (data migration) | **Deferred — specified below** | See §4. |

---

## 4. The one deferred migration, and why

Fixing F-3 in *schema* stops the false claim immediately. Splitting the 47
composite `authors` **rows** is the correct long-term fix and was not attempted:

1. **It destroys live URLs.** Those 47 slugs are indexed and return 200. §18/§35
   require a 301 for each — but one old URL maps to 2–5 new ones, which has **no
   single 301 target**. That needs a product decision (keep the composite as a
   canonical "work group", or 301 to the first contributor), not a script.
2. **The schema blocks it.** `books.author_id` is a singular FK. Splitting needs
   either a join table or a cutover to the canonical `resource_contributors`
   model (0104–0109), which exists but is not yet the app's read source.
3. **The ingestion path must be fixed first**, or the defect regenerates:
   `app/(admin)/admin/(protected)/books/actions.ts:448` still does
   `.upsert({ name: author })` with the entire byline. The library already owns
   the right splitter (`parseAuthorNames()`, used by 0105's backfill) and simply
   never calls it here.

**Order when it is taken up:** fix ingestion → backfill `resource_contributors`
→ decide the 301 policy → cut the read path over → retire the composite rows.

---

## 5. Honest limits of this report

- **`.env.local` points at the LOCAL stack** (`127.0.0.1:54331`), not
  production. Every production fact here came from **HTTP**, not SQL. Counts of
  rows that are not exposed over HTTP (e.g. authors with zero published works,
  F-5) could not be measured.
- **Khmer corporate-body detection is a vocabulary, not a parser.** Khmer has no
  word boundaries and there is no segmenter here, so the ten Khmer org terms are
  matched as substrings. A Khmer institution using none of them is still typed
  `Person`. The list is extended by adding a term, not by changing logic.
- **The "7 corporate bodies" figure is a floor, not a count** — it was derived
  from English keywords over Latin-script slugs.
- **F-1/F-2/F-3 are verified by unit test and local render, not on production**,
  because they are not deployed from this branch.
- **`/subjects` gating is verified locally** against a real Supabase stack
  (real slug 200, garbage slug 404, hub 200) — not on production.
- **`npm run build` was run from a wiped `.next`** (a warm webpack cache hides
  build errors here), and succeeded.
- **No e2e run.** `npm run test:e2e` boots a full stack and was not run; the
  machine was already at load average 125–199 during this work, which produced
  two phantom unit-test failures that passed on re-run under normal load.

---

## 6. Status by tier (§0.2)

| Change | Implemented | Unit-tested | Verified locally | Verified in production |
|---|:--:|:--:|:--:|:--:|
| F-1 institution referenced, never re-minted | ✅ | ✅ | ✅ render | ❌ not deployed |
| F-2 corporate bodies as `Organization` | ✅ | ✅ | — | ❌ |
| F-3 composite bylines split / omitted | ✅ | ✅ | — | ❌ |
| F-4 tenth slug migration + 301 | ✅ | ✅ | ❌ needs DB apply | ❌ |
| F-6 `/subjects` slug gate | ✅ | ✅ | ✅ 404/200 proven | ❌ |
| F-5 author indexability gate | ❌ specified only | — | — | — |

---

## 7. Metrics

```
PRODUCTION, MEASURED 2026-09-12
sitemap URLs                        497
  └ returning 200                   497   (100%)
  └ broken / redirecting              0
book / author / subject URLs    287 / 158 / 25

ENTITY TRUTH (before → after)
author entities                     157
  └ composite, as one Person     47 → 0
  └ role word inside name        16 → 0
  └ corporate body as Person      7+ → 0   (floor; Latin-detectable)
  └ institution as Person          1 → 0

COVERAGE
public detail routes gated      7/8 → 8/8
byline sites deciding type alone  8 → 0   (one classifier, scan-enforced)

VERIFICATION
unit tests                    4720 passed, 89 skipped, 0 failed
lint                          0 errors (172 pre-existing warnings)
tsc --noEmit                  clean
next build (clean .next)      succeeded, 115 static pages
```

---

## 8. Architecture added

**`lib/seo/contributor.ts`** — pure, the single answer to "what kind of entity
is this byline?", consumed by all eight sites that previously each decided
alone. Three rules, in order:

1. **The institution is referenced, never re-minted** → `@id` → `#organization`.
2. **A corporate body is an `Organization`** — vocabulary in Latin *and* Khmer.
   Organisation is decided **before** splitting, deliberately: an institution's
   name is a unit that often contains the delimiters a list uses, and splitting
   first turns "Ministry of Education, Youth and Sport" into three fabrications.
3. **A byline that is not one entity is not published as one** — split where
   safe, otherwise omit.

Protected by `lib/seo/contributor.test.ts`, which ends with a **source scan**
asserting that only the team pages (real, individually catalogued staff) may
write `"@type": "Person"` by hand. The scan was verified to fail when an
allow-listed file is removed — a guard that cannot fail is not a guard. It
exists because the defect was a *new call site*, which no unit test on the
module itself can see.
