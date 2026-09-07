# SEO 2.0 — audit, findings and repair

Audit date: **2026-09-07**. Target: `https://library.ptec.edu.kh` (live) and
the working tree on `perf/image-optimization`.

This is not a greenfield SEO build. The library already runs SEO V2 + V3
(`docs/SEO-ARCHITECTURE.md`, `docs/SEO-V2-FINAL-REPORT.md`,
`docs/SEO-V3-FINAL-REPORT.md`): centralized metadata builders, an environment +
admin indexing gate, three-layer robots enforcement, a validated sitemap,
`@id`-anchored entity graph, locale-correct breadcrumbs and hreflang. The task
here was to **audit that system against production and repair what is actually
broken** — not to rebuild it. §55 of the brief forbids a rewrite, and the
evidence agreed: coverage was already near-complete.

---

## 1. Method

- Full metadata/JSON-LD/breadcrumb coverage sweep over all 37 public page
  files.
- Live crawl of 35 representative production URLs — one per distinct route
  shape plus both locales, a filtered search URL, a private route, a legacy
  redirect and a 404 probe — extracting status, `X-Robots-Tag`, title,
  description, canonical, robots meta, `html lang`, Open Graph, Twitter, `h1`
  count and every JSON-LD block (parsed, not regex-matched).
- Every one of the 157 author URLs in the production sitemap fetched.
- Read-only queries against the production database to establish root cause.

Crawl and query scripts were scratch; nothing was written to production.

---

## 2. What was already correct

Recorded because a verification report that only lists faults is misleading.

| Area | Result |
|---|---|
| Metadata coverage | **PASS** — every public page has `generateMetadata` (or a layout that does). `/contact` is covered by `contact/layout.tsx`; `/dev-dashboard-preview` `notFound()`s in production. |
| Canonicals | **PASS** — all 28 HTML pages self-canonical, correct origin, no query, no trailing slash. `/search?q=khmer` correctly canonicalises to `/search`. |
| `html lang` | **PASS** — `en` unprefixed, `km` under `/km`. |
| JSON-LD | **PASS** — 0 invalid blocks across the sample. `Book`, `CollectionPage`, `BreadcrumbList`, `Event`, `FAQPage`, `EducationalOrganization`, `Library`, `WebSite` all present where expected and singly declared. |
| H1 | **PASS** — exactly one on every HTML page. |
| Redirects | **PASS** — `/home` → `/` (308), `/en` → `/` (301), single hop, no chains. |
| Private routes | **PASS** — `/dashboard` 307s to login; robots.txt disallows admin/auth/api/dashboard/profile/lists/offline-*. |
| 404 | **PASS** — unknown slug returns a real 404 with noindex, not a soft 200. |
| Sitemap | **PASS** on shape — 471 URLs, correct origin, hreflang alternates, validated at serve time. Contents: see F-1. |
| **Cloudflare `robots.txt` override** | **RESOLVED.** The invalid `Content-Signal:` line that `docs/SEO-V3-FINAL-REPORT.md` rated **P0** — costing 8 SEO points per page and reddening `lighthouse.yml` on every merge — is **gone**; the app's own robots.txt is being served. |

---

## 3. F-1 — CRITICAL: 154 of 157 author URLs answered 404

### Symptom (measured live)

- `app/sitemap.ts` advertised **157** `/authors/<slug>` URLs.
- **154 of them returned HTTP 404.** Only 3 resolved.
- The public `/authors` hub rendered the **same 157 links**, so 154 were dead
  internal links on a page that is itself indexable.

### Root cause

`public.authors.slug` (migration 0125) was populated by that migration's
one-time SQL backfill **and by nothing else**. The admin book save creates
authors with

```ts
.upsert({ name: author }, { onConflict: "name" })
```

— no slug. The `categories` and `departments` upserts on either side of it in
the same file both write `slug: slugify(name)`; authors was simply missed.
There is no column default and no trigger. So **every author created after 0125
ran kept `slug = NULL`**: 154 of 157 rows.

That NULL is load-bearing. Migration 0126 added
`author_profiles_public` — the view middleware's slug gate reads — as

```sql
select a.slug, true from public.authors a where a.slug is not null
```

so a slug-less author is invisible to the gate, and middleware **rewrites the
URL to a hard 404 at the edge**. The page itself would have resolved them:
`getAuthorProfile()` falls back to scanning names. It never ran.

Three components each held a different idea of which author URLs exist:

| Component | Rule | Result |
|---|---|---|
| `app/sitemap.ts` | `a.slug \|\| slugify(a.name)` | advertised 157 |
| `lib/authors/directory.ts` (hub) | `rawSlug \|\| slugify(cleanName)` | linked 157 |
| `author_profiles_public` (gate) | `slug is not null` | resolved 3 |

### Why the fix is a stored slug, not a smarter view

The obvious alternative — teach the view to derive a slug — was rejected. 0125's
SQL `author_slugify()` maps every non-`[:alnum:]` run to a hyphen, and Khmer
dependent vowels and signs are **combining marks, not alnum**, so it shreds
`ឡុង រក្សា` into `ឡ-ង-រក-ស`. Verified against production: of the 157 names,
**74 diverge** between the SQL function and the app's `unicodeSlug()` — every
one of them Khmer. That is the same defect `CLAUDE.md` already calls out for
titles ("Khmer combining marks are letters here"), and the same reason
migration 0130 refused to reproduce `normalizeTitle()` in SQL: two algorithms
drift, and the drift reads as "no such page".

So the repair keeps **one** algorithm, in TypeScript, and makes the stored
column always exist.

### The fix

1. **`lib/authors/slug.ts`** (new) — `authorSlug()` (= `unicodeSlug`) and
   `ensureAuthorSlug()`, which writes the slug **filtered on `slug is null`**
   so an admin's hand-corrected slug is never overwritten by a later book save.
2. **`app/(admin)/admin/(protected)/books/actions.ts`** — both author-upsert
   sites (upload path and edit path) now call `ensureAuthorSlug()`. New
   authors can no longer be created slug-less.
3. **`scripts/backfill-author-slugs.ts`** — **already existed** and needed no
   change. It was committed for exactly this purpose ("the SQL backfill is
   best-effort and THIS is the authority. Run it once after 0125 is applied")
   and was simply **never run**. It reconciles both author tables against
   `slugify()`, defaults to a dry report, and de-collides with the `-2` suffix
   rule 0125's own backfill used.
4. **`addressableAuthorSlug()`** — now the single rule used by *both*
   `app/sitemap.ts` and `lib/authors/directory.ts`, so the advertisers can no
   longer disagree with the gate. It distinguishes two cases deliberately:
   - `slug === undefined` (column absent, pre-0125) → name fallback, because
     the gate view does not exist either and fails open;
   - `slug === null` (column present, value missing) → **drop the URL**,
     because the gate *will* 404 it. This is the rule the subjects hub already
     keeps (`getIndexableSubjects`, SEO-V2 F-1): never advertise a URL the
     application will not serve.

### Why no live URL changes

The backfill derives with `unicodeSlug()`, which is exactly what the sitemap
and hub already emitted for a slug-less author. Verified against production
before applying: **154 rows to fill, 0 empty derivations, 0 collisions among
the new slugs, 0 clashes with the 3 existing stored slugs.** The 3 rows that
already have (mark-shredded) slugs are left untouched, because those 3 URLs
work today and may be indexed. Net effect: 154 URLs go 404 → 200, nothing is
renamed.

### Deploy ordering

Code first is safe, either order is monotonic. With the code deployed but the
backfill not yet run, the 154 unresolvable URLs simply stop being advertised
(they 404 today, so nothing is lost). Running the backfill restores all 154 as
working pages.

```bash
npx tsx scripts/backfill-author-slugs.ts                      # dry report (default)
npx tsx scripts/backfill-author-slugs.ts --apply --only-missing
```

`--only-missing` is the important flag: without it the script also "corrects"
slugs that merely disagree with `slugify()`, which would retire the 3 live URLs
described in §8.

---

## 4. F-2 — MEDIUM: five listing pages had no `og:image`

`/theses`, `/theses/summary`, `/catalogs`, `/publications` and `/paths`
shipped with **no `og:image` and no `twitter:image`** — a share of any of them
rendered as a bare link. `/books` had one only because it passed `image:`
explicitly; `buildListingMetadata()` treated the argument as optional and
emitted `undefined` when absent.

Fixed at the one place that owns listing metadata rather than at five call
sites: `image` now defaults to `LISTING_FALLBACK_OG_IMAGE`
(`/og-default.png`, the same asset every detail-page builder already falls
back to). A page that passes its own image is unaffected.

---

## 5. F-3 — LOW, reported not fixed: Khmer titles on English pages

`/about` and `/about/committee` serve `<html lang="en">` with Khmer `<title>`
values (`អំពីបណ្ណាល័យ — PTEC e-Library`, `គណៈកម្មការបណ្ណាល័យ`). The other
about-section pages are correctly English.

**Not fixed here on purpose.** `messages/en.json`, `messages/km.json` and
several `about/*` files are modified in the working tree by in-flight work;
editing the same strings risks conflicting with it. This needs an English
`title` for those two entries.

Khmer titles on `/books/<khmer-slug>`, `/posts/<khmer-slug>` and
`/subjects/<slug>` are **correct, not a defect** — a Khmer book's title is its
name and must not be translated.

---

## 6. Verification

| Check | Result |
|---|---|
| `npx vitest run` | see §7 |
| `npx tsc --noEmit` | see §7 |
| `npx eslint` (changed files) | see §7 |
| New unit tests | `lib/authors/slug.test.ts` (12), `lib/seo/listing-metadata.test.ts` (6) — **pass** |
| `npm run build` | **PASS** (clean `.next`; see §7 for the one caveat) |
| Production crawl | 35 URLs, evidence throughout §2–§4 |
| Post-fix production re-crawl | **157/157 author URLs 200.** Spot-checked `/authors/adrian-wallwork` and the Khmer `/authors/ឡុង-រក្សា`: correct title, self-referencing canonical, single H1, `index, follow`, and `Person` + `ProfilePage` + `BreadcrumbList` JSON-LD. |

`lib/authors/slug.test.ts` includes two **source-scanning invariants**, in the
style of the existing invariant suite: every author-URL advertiser must derive
through `addressableAuthorSlug()`, and neither may reintroduce a
`slug || slugify(name)` fallback of its own; and every `upsert({ name: author })`
in the admin book actions must be matched by an `ensureAuthorSlug()` call.

### Pre-existing failure, not caused by this work

`npx tsc --noEmit` — and therefore `npm run build`, which type-checks — fails on
**`scripts/repair-khmer-pages.ts:193`**
(`TS1501: This regular expression flag is only available when targeting
'es2018' or later'`). This was captured in the **baseline run before any change
was made**, and that file is modified in the working tree by unrelated in-flight
work. Left untouched. To prove the build is otherwise green, that file was
moved aside for one build run and restored byte-identically (SHA-256 verified):
`npm run build` then exited **0**.

---

## 7. Status

| Item | State |
|---|---|
| F-1 author URLs — code | **DONE** |
| F-1 author URLs — production backfill | **APPLIED 2026-09-07**, with the operator's go-ahead. 154 rows written, 0 skipped, 0 failed. |
| F-2 listing `og:image` | **DONE** |
| F-3 Khmer titles on `/about`, `/about/committee` | **REPORTED, NOT FIXED** (conflicts with in-flight work) |
| Post-backfill re-crawl of all 157 author URLs | **VERIFIED — 157/157 return HTTP 200**, 0 failures (was 3/157) |

---

## 8. Honest limits

- Every "verified live" figure describes production on **2026-09-07**, before
  these changes were deployed.
- No external validator (Rich Results Test, Search Console) was run; no Search
  Console access exists.
- No traffic, ranking or CTR figure appears anywhere in this document, because
  none was measured.
- **3 authors keep mark-shredded slugs**, written by 0125's SQL backfill:
  `សន-ស-យ-ម-...`, `ស-ង-គ-មស-រ-ន-...`, `ល-ក-ស-ល-នដ-...`. Running the backfill
  script WITHOUT `--only-missing` would rewrite them to the readable Khmer form
  — and thereby retire 3 URLs that work today and may already be indexed, with
  no redirect map for authors to catch the old ones. Left alone deliberately;
  correcting them is an editorial call, and if taken it should come with
  redirects.
- The e2e suite was **not** run for this change set.
