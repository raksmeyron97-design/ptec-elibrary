# SEO 3.0 — Phase 0 Audit

**Date:** 2026-09-12
**Method:** repository inspection + live production verification against
`https://library.ptec.edu.kh`. Every number below was measured, not inferred.

Companions: [SEO-V3-FINAL-REPORT.md](SEO-V3-FINAL-REPORT.md) ·
[SEO-V3-PARAMETER-POLICY.md](SEO-V3-PARAMETER-POLICY.md) ·
[SEO-3.0-FINAL-REPORT.md](SEO-3.0-FINAL-REPORT.md)

---

## 0. The finding that reframes the brief

The SEO 3.0 brief is written for a library that needs a technical SEO
foundation built. **That foundation already exists and is, on measurement,
correct.** The brief's Phase 1 (canonical bugs, hreflang bugs, robots bugs,
sitemap bugs, redirect chains, 404s in the sitemap) found **zero** defects.

What changed since SEO V3 (2026-08-31) is not the code — it is the *collection*.
V3 was audited against a production site publishing **3 books**. It therefore
gated most content work as "would be thin/doorway pages at current volume".

Production today publishes **287 book URLs, 158 author URLs, 25 subject URLs —
497 sitemap URLs in total.** V3's central premise has expired. The gates it
wrote were right then; the content has since arrived, and the defects that
matter now are **entity-truth defects that only became visible at volume**.

---

## 1. Verified-correct (do not rewrite — §0.3)

Each line was confirmed against live production HTML on 2026-09-12.

| Area | Evidence |
|---|---|
| **Sitemap integrity** | `scripts/audit-sitemap-links.ts` crawled all **497** URLs: **497 × 200**. No 404, no redirect, no 5xx. |
| **Canonicals** | Self-canonical, absolute, locale-correct; Khmer slugs percent-encoded correctly. |
| **hreflang** | Reciprocal `en` / `km` / `x-default` on every page type sampled. |
| **Robots policy** | `robots.txt` uses `$`-anchored `Disallow: /auth$` + `/auth/`, so the historical `/auth` ↔ `/authors` prefix collision is closed. All 158 `/authors/*` URLs are crawlable and return 200. |
| **Cloudflare override** | Gone. No invalid `Content-Signal:` line remains. |
| **Parameter policy** | Implemented exactly as documented: `?dept=` → `noindex, follow` + canonical to base; `?sort=` → same; `?q=` → `noindex` + canonical `/search`; `?page=2` → indexable self-canonical; `?page=999` (out of range) → `noindex`. Locale-correct (`/km/books?dept=` → canonical `/km/books`). |
| **Unknown parameters** | Ignored and canonicalised to the clean listing — they cannot open an indexable URL space. |
| **Subject indexability gate (§5)** | Already exists, at **both** layers: `getIndexableSubjects()` (`counts.total > 0`) filters the sitemap, and the page itself emits `robots: noindex` when `counts.total === 0`. |
| **Khmer as first-class (§0.6)** | Genuinely localized, not a translated shell: Khmer `<title>`, meta description, `<h1>`, intro prose and resource counts, with a locale-correct canonical. |
| **Khmer subject slugs** | The F-10 migration shipped; subject URLs are real Khmer (`/subjects/គណិតវិទ្យា`). |
| **Author slugs** | Repaired. The prior "slug NULL → sitemap advertises 404s" defect is gone. |
| **Redirects** | `/en` → `/` and `/en/books` → `/books` in **one** 301 hop; `/km/home` → `/km` 308. No chains. |
| **Unknown slugs** | Real 404 (not a streamed 200). |
| **Institution graph** | One `EducationalOrganization` at `#organization` carrying the institution's own URL (`www.ptec.edu.kh`), one `Library` at `#library`, `@id`-referenced. |
| **No fabrication in builders** | The author builder omits `bio`/`affiliation`/`jobTitle` when unknown rather than inventing them. |

**Consequence:** the brief's Phases 1 and 2 are substantially already delivered.
Re-implementing them would be SEO theatre (§0.4).

---

## 2. Defects found

### F-1 — The library asserts PTEC is a `Person` *(Severity: High)*

**Issue.** `/authors/phnom-penh-teacher-education-college` emits, in the *same
document* that declares the institution correctly:

```jsonc
// the site graph — correct
{ "@type": "EducationalOrganization",
  "@id": "https://library.ptec.edu.kh/#organization",
  "name": "Phnom Penh Teacher Education College",
  "url": "https://www.ptec.edu.kh" }

// the author layer — a second, contradictory entity for the same institution
{ "@type": "ProfilePage",
  "mainEntity": { "@type": "Person",
    "@id": ".../authors/phnom-penh-teacher-education-college#person",
    "name": "Phnom Penh Teacher Education College" } }
```

**Why it matters.** This is precisely the duplicate-institution defect SEO V3
eliminated in `RootShell` — resurfacing through a different door. `lib/seo/
entity-graph.test.ts` cannot see it because it guards *declaration sites*, not
the author/byline builders.

**Root cause.** Every byline in the library is typed `Person` unconditionally,
at **8 call sites**: `lib/seo/book-seo.ts:220`, `thesis-seo.ts:256,343`,
`publication-seo.ts:238,347`, `app/[locale]/(public)/authors/[slug]/page.tsx:108`,
`authors/page.tsx:93`, `catalogs/[slug]/page.tsx:216`.

---

### F-2 — Corporate bodies are typed as `Person` *(Severity: High)*

At least **7 of 157** author entities are organizations asserted as people —
and this undercounts, because the detector is English-keyword based while the
collection is largely Khmer:

```
american-psychological-association
capacity-development-partnership-fund-cdpf-iii
department-for-education-and-skills-dfes-united-kingdom
lovely-professional-university
ministry-of-education-youth-and-sport
phnom-penh-teacher-education-college          ← also F-1
សាកលវិទ្យាល័យ-អាសុី-អឺរ៉ុប-asia-euro-university
```

Confirmed on a book page too: `ក្រសួងអប់រំ យុវជន និងកីឡា` (the Ministry of
Education, Youth and Sport) is emitted as `{"@type":"Person"}` in `Book.author`.

---

### F-3 — Several people collapsed into one `Person` *(Severity: High)*

**47 of 157 (30%)** author entities are multi-person bylines stored and
asserted as a single human; **16** carry a role word inside the person's name:

```
Bert P.M. Creemers, Leonidas Kyriakides, Pam Sammons (Editors)   ← one "Person"
Alan Crawford, Wendy Saul, Samuel R. Mathews, James Makinster    ← one "Person"
Bill Atweh, Stephen Kemmis, Patricia Weeks (Editors)             ← one "Person"
```

**Root cause is structural.** `books.author_id` is a **singular FK**, and
`app/(admin)/admin/(protected)/books/actions.ts:448` does
`.upsert({ name: author }, { onConflict: "name" })` with the *entire byline
string*. The library already owns the correct splitter —
`parseAuthorNames()` in `lib/resources/author-names.ts`, the one migration
0105's contributor backfill uses — but the book ingestion path never calls it.

This is V3's deferred D-11 ("a three-author thesis renders as one `Person`
whose name is all three"). At 3 books it was a curiosity. At 287 it is 30% of
the entity layer.

---

### F-4 — One timestamp subject slug survived the F-10 migration *(Severity: Medium)*

`/subjects/book-1781239299098` is live, `index, follow`, self-canonical, and
titled `កញ្ជប់គណិតវិទ្យា`. §17 forbids timestamp slugs explicitly. The F-10
migration converted nine such slugs to Khmer; this one escaped it.

It holds 18 real resources, so it is **not** a thin page — the defect is the
URL, and fixing it therefore requires a 301 (§18/§35), not a deletion.

---

### F-5 — No author indexability threshold *(Severity: Low)*

§8 asks for one; there is none. `authors/[slug]/page.tsx` emits `noindex` only
when the author does not resolve at all. An author row whose every work is
unpublished renders an empty profile and stays `index, follow`. Subjects have
this gate (§5); authors do not.

---

### F-6 — `/subjects/<unknown>` is a soft 404 *(Severity: Medium)*

**Issue.** Every nonexistent subject URL answers **HTTP 200**, not 404:

```
/subjects/definitely-not-real-xyz   → 200   ("Nothing here yet")
/books/nonexistent-slug-xyz         → 404   (correct)
/authors/nonexistent-xyz            → 404   (correct)
```

**Correction to this audit.** §5's route inventory initially recorded "unknown
slug → 404". That was measured on `/books/` and `/authors/` and generalised;
`/subjects/` disproves it. The table above is corrected.

**Root cause.** `RESOURCE_GATES` (`lib/resource-slug-gate.ts`) covers theses,
publications, posts, catalogs, `about/team`, authors and paths — and books have
their own gate — but there is **no `subjects` entry**, so middleware never gates
it. Every public route streams its `loading.tsx` shell before the page can call
`notFound()`, so the 200 is already sent. This is the exact defect CLAUDE.md
describes and `lib/resource-slug-gate.test.ts` exists to prevent; subjects was
simply never added to the registry.

**Why it was invisible.** The page *is* correctly `noindex`, so the URLs are not
indexed and no ranking symptom ever appeared. The cost is crawl budget against
an unbounded 200-returning URL space, plus the `/subjects/` ↔ `/subjects/`
soft-404 signal itself.

**Why it could not be gated before this pass.** `ResourceGateConfig.published-
Column` was **required**, and `categories` has no publication column — a
category is public by existing. Gating it on a column that does not exist would
have produced `&undefined=eq.true`, a filter PostgREST rejects, which fails the
gate *open* on every request.

---

## 3. Deliberately NOT implemented, with reasons (§39)

| Brief section | Decision | Reason |
|---|---|---|
| §14 Topic/guide landing pages (`/learn/*`) | **Refused** | The corpus supports the *resources*, but there is no authored prose for these topics and none may be invented (§0.5). A `/learn/*` page built today would aggregate links under a generated heading — a doorway page (§15), forbidden by the same brief. The prerequisite is editorial content, not code. |
| §15 Programmatic filter//subject/language landing pages | **Refused** | Would be the thin-page explosion §15 forbids. The existing facet policy (`noindex, follow` + canonical to base) is already correct. |
| §25/§7 Search Console ingestion | **Not built** | No Search Console property is connected to this repository. Building an ingestion pipeline with no data would produce a dashboard of zeros, and §25 forbids inventing metrics. |
| Faculty / department / lecturer pages | **Still refused** | Unchanged from V3: no trustworthy cross-system person mapping exists between the library and `www.ptec.edu.kh`. Matching on names alone would fabricate identities. |
| Splitting composite authors into separate rows + URLs | **Deferred, deliberately** | See §4. |

---

## 4. Why F-3 is fixed in schema, not by a data migration

Splitting the 47 composite `authors` rows into real people is the *correct*
long-term fix, and it is **not** attempted in this pass:

1. It is a **URL-destroying change**. Those 47 slugs are live, indexed and
   return 200. §18/§35 require a 301 for every one, and the target is
   ambiguous — one old URL maps to 2–5 new ones, which has no single 301 target.
2. `books.author_id` is singular, so splitting requires either a new join table
   or a cutover to the canonical `resource_contributors` model (0104–0109) that
   already exists but is **not** the app's read source.
3. Comma-splitting is unsafe on `Last, First` bylines and would mangle names —
   inventing a person is worse than the defect (§0.5).

**What is safe and true right now:** stop *asserting* the false claim. A byline
that is demonstrably not one person must not be published as one `Person`.
Omission is honest; fabrication is not (§0.5).

The data migration is specified as the follow-on in the final report.

---

## 5. Route inventory (measured, production, 2026-09-12)

| Route | Status | Robots | Canonical | hreflang | In sitemap |
|---|---|---|---|---|---|
| `/`, `/km` | 200 | index | self | en/km/x-default | yes |
| `/books`, `/km/books` | 200 | index | self | ✓ | yes |
| `/books/[slug]` | 200 | index | self | ✓ | 287 |
| `/subjects/[slug]` | 200 | index (noindex when empty) | self | ✓ | 25 |
| `/authors/[slug]` | 200 | index | self | ✓ | 158 |
| `/theses`, `/publications`, `/catalogs`, `/posts`, `/paths` | 200 | index | self | ✓ | yes |
| `/about/*`, `/contact`, `/policy`, `/privacy` | 200 | index | self | ✓ | yes |
| `/search?q=` | 200 | **noindex, follow** | `/search` | — | no |
| `/books?dept=`, `?sort=` | 200 | **noindex, follow** | `/books` | — | no |
| `/books?page=2` | 200 | index | self `?page=2` | — | no |
| `/books?page=999` | 200 | **noindex, follow** | self | — | no |
| `/admin`, `/dashboard` | 307 → login | noindex, nofollow | — | — | no |
| `/en`, `/en/books` | 301 (1 hop) | — | — | — | no |
| unknown `/books/`, `/authors/`, `/theses/`, … slug | **404** | — | — | — | no |
| unknown `/subjects/` slug | **200 (soft 404)** — see F-6 | noindex, follow | self | — | no |

---

## 6. Metrics

```
sitemap URLs                      497
  └ returning 200                 497   (100%)
  └ broken / redirecting            0
book URLs                         287
author URLs                       158
subject URLs                       25
author entities                   157
  └ composite (multi-person)       47   (30%)
  └ role word inside name          16
  └ corporate body as Person        7+  (English-detectable only)
timestamp slugs remaining           1   (F-4, blocked — see below)
public detail routes gated          7 of 8  (subjects missing → F-6)
```
