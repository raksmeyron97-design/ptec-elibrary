# SEO V2 — Final Report

**Date:** 2026-08-31
**Branch:** `feat/roles-workspace-and-paths-explorer`
**Scope:** the public surface of PTEC e-Library, plus the SEO layer that serves it.

Companion documents:
[SEO-V2-AUDIT.md](SEO-V2-AUDIT.md) ·
[SEO-V2-URL-POLICY.md](SEO-V2-URL-POLICY.md) ·
[SEO-V2-CONTENT-STRATEGY.md](SEO-V2-CONTENT-STRATEGY.md) ·
[SEO-ARCHITECTURE.md](SEO-ARCHITECTURE.md) (unchanged, still accurate)

---

## 1. Executive summary

The existing SEO foundation was **strong and has been preserved**. `lib/seo/`
was already a well-factored, unit-tested layer with a real accuracy discipline —
omit unknown facts rather than default them, PTEC as `provider` and never
`publisher`, honest `lastmod`, a validated single origin, reciprocal hreflang,
and an opt-in indexing gate enforced at three layers. None of that was rewritten.

The gap was **structural, not tag-level**. The site published resources and
listings but had no topic or entity layer connecting them: `/subjects/*` and
`/authors/*` were advertised in `sitemap.xml` with **no internal link from
anywhere on the site**, their breadcrumbs pointed at unrelated routes, and the
Khmer subject pages served English.

Live production also revealed two things invisible from the repository: ten
indexable empty subject pages submitted for indexing, and an edge-injected
`robots.txt` contradicting the app's own rules.

**What V2 did:** closed the two P0 code defects, built the missing topic and
entity hubs, made Khmer genuinely first-class on subject pages, wired the
resource→subject→author link graph into the HTML, and added a validator layer
plus 76 new tests so these classes of failure become loud instead of silent.

**What V2 did not do:** write editorial content, rename category slugs, or
change a Cloudflare setting. Those are called out in §7 with reasons.

---

## 2. Before / after

| Dimension | Before | After |
|---|---|---|
| Private-path source of truth | **two** lists, already drifted (`/login` disallowed but nonexistent; `/km/auth`, `/km/admin` missing) | **one** — `PRIVATE_PATH_PREFIXES` derives header, meta, robots.txt and sitemap exclusion |
| Empty subject pages | 10 live, HTTP 200, indexable, **in the sitemap** | excluded from the sitemap; `noindex, follow` if reached |
| Sitemap validation | none | every entry validated before serving; bad entries dropped |
| `/subjects` hub | **did not exist** | real page, `CollectionPage` + `ItemList`, in the sitemap when populated |
| `/authors` hub | **did not exist** | real page, `CollectionPage` + `ItemList` of `Person` nodes |
| Subject/author page reachability | orphans — sitemap only | linked from the footer of every public page, and from every resource that belongs to them |
| Subject breadcrumb | read "Subjects", linked `/books` (nav **and** JSON-LD) | reads "Subjects", links `/subjects`, both agree |
| Author breadcrumb | read "Authors", linked `/publications` | reads "Authors", links `/authors` |
| `/km/subjects/*` | English title, description **and** body under `hreflang="km"` | fully localized, 37 message keys per locale |
| Subject page content | one flat grid, one English sentence | grouped by type, real counts, per-type listing links, related subjects |
| Resource → subject/author links | **none on any detail page** | books, theses and publications all link to their hubs |
| Subject queries per request | bundle run **twice** (metadata + body, no dedup) | React-cached, once |
| `Book` publication date field | `uploadedAt` (held `published_at` — a permanent misreading trap) | `publicationDate` |
| SEO validators | none | 8 exported, deterministic, unit-tested |

---

## 3. Fixed issues

### P0

**F-1 · Ten indexable empty subject pages in the sitemap.**
`/subjects/book-1781238023578` and nine siblings returned 200 with *"No public
resources are attached to this subject yet"*, self-canonical, `index, follow`,
all ten in `sitemap.xml` — soft-404s submitted for indexing, two-thirds of the
subject namespace.
*Fix:* `getIndexableSubjects()` (`lib/subjects/index.ts`) counts each subject's
public resources with the same rules the page itself uses, so the sitemap cannot
advertise a URL the page will render empty. A subject that is empty anyway
renders `noindex, follow`.

**F-3 · Two drifted private-path lists.**
`app/robots.ts` hand-maintained a copy of `PRIVATE_PATH_PREFIXES` that had
already diverged.
*Fix:* `getPrivateSeoPaths()` / `getLocalizedPrivateSeoPaths()` in
`lib/seo/indexing.ts`; `app/robots.ts` now derives its `Disallow` list. Six tests
pin the derivation, including one asserting `URL_LOCALE_PREFIXES` matches
`i18n/routing.ts` (the constant is hard-coded there so `next.config.ts`'s
transpiler never has to resolve `next-intl`).

**F-2 · Cloudflare overrides `robots.txt`** — documented, escalated, **not**
changed. See §7.

### P1

**F-4 · Two orphaned URL families.** `/subjects` and `/authors` hub pages
created; both linked from the footer of every public page.

**F-5 · Breadcrumbs pointing at routes that did not match their labels.** Both
corrected in the visible `<nav>` and the emitted `BreadcrumbList`, now that
truthful destinations exist.

**F-6 · `/km/subjects/*` served English under `hreflang="km"`.** New `subjects`
namespace, 37 keys in each of `messages/{en,km}.json`; every string on the hub
and the detail page localized.

**F-7 · Subject pages were filters, not landing pages.** Now: resource counts,
a factual localized breakdown, per-type grouping with a link to each type's full
listing, evidence-backed related subjects, and an `ItemList` covering exactly
what is rendered.

**F-8 · `/paths/[slug]` is `force-dynamic`** — assessed, **not** changed. See §7.

### P2

**F-9 · `Book.uploadedAt` held the publication date.** Renamed to
`publicationDate` across its three call sites. The value was always correct; the
name asserted the opposite and made the detail page's `publishedAt:
book.uploadedAt` line read like a live bug.

### Found while implementing

**Boundary-free duplicate of the locale-scope rule in
`lib/routing/locale-scope.test.ts`.** Not in the audit — it surfaced when the
new `/authors` footer link tripped the invariant. The test re-spelled the
unscoped-prefix rule as a regex without a segment boundary, so any public route
beginning with `auth`, `admin` or `api` would have been flagged. Fixed by having
the test call `isLocaleScoped()`, the function that already owns the rule.

---

## 4. New capabilities

**Topic hub — `/subjects`, `/km/subjects`.** Every subject with public
resources, ordered by depth, each tile carrying a real count and a breakdown of
only the types actually present.

**Entity hub — `/authors`, `/km/authors`.** Backed by a new
`lib/authors/directory.ts` that reconciles the two author tables
(`publication_authors` for academic profiles, `authors` for e-book authors) by
slug — the same reconciliation `app/sitemap.ts` performs — and counts works from
exact foreign keys where they exist (`books.author_id`,
`publication_authorships`) and name matching where the schema only stores a
byline. Because the count is approximate by construction for theses and catalog
records, the hub shows one "works" figure rather than a per-type breakdown it
cannot stand behind.

**Subject landing pages.** Grouped, counted, localized, linked onward.

**Internal link graph in HTML.** `components/seo/ResourceConnections.tsx` +
`lib/resources/connections.ts` add subject and author links to book, thesis and
publication detail pages — reading the caches that already back `/subjects` and
`/authors`, so this costs **zero additional database round trips**. A link is
emitted only when the target hub has resources; an unresolvable byline renders as
plain text rather than a dead link.

**SEO validator layer — `lib/seo/validate.ts`.** `validateCanonicalUrl`,
`validateAlternateUrls`, `validateSitemapEntry`, `validateSitemap`,
`validateSeoMetadata`, `validateStructuredData`, `isIndexableRoute`,
`isPrivateSeoRoute`. Pure and deterministic; `app/sitemap.ts` runs
`validateSitemap()` on every request and **drops** offending entries rather than
serving a sitemap known to be wrong.

**One count→phrase mapping — `lib/subjects/labels.ts`.** The hub and the detail
page both render "8 e-books · 2 theses". `subjectBreakdown()` is the single pure
implementation, and its test asserts that every derived message key
(`countBook`, `groupBook`, `typeBook`, `browseAllBook`, …) exists in **both**
catalogues — so renaming a key in `messages/*.json` fails a test instead of
rendering a raw key in production.

**Shared PostgREST filter sanitizer — `lib/postgrest-filter.ts`.** PostgREST
parses `.or()` as a comma-separated mini-language, so a subject named
"Maths, Science" silently re-partitions the filter instead of erroring. The rule
existed inline in three files; it now has one tested home, used by the new code.

---

## 5. Test results

Real numbers, from this working tree.

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **PASS** — 0 errors |
| Lint | `npm run lint` | **PASS** — 0 errors, 157 warnings (pre-existing `no-explicit-any` style; V2 adds 1, matching the codebase's untyped-Supabase-row convention) |
| **Production build** | `npm run build` | **PASS** — exit 0. Prebuild gates (`check:hero`, PWA `--check`) passed, compiled in 58 s, TypeScript clean inside the build, **111/111 static pages generated**. Run on the settled tree, after the final refactor — an earlier green build that overlapped an edit was discarded rather than reported |
| Unit — SEO validators | `npx vitest run lib/seo/validate.test.ts` | **PASS** — 50/50 |
| Unit — subject matching + labels | `npx vitest run lib/subjects/` | **PASS** — 22/22 |
| Unit — filter sanitizer | `npx vitest run lib/postgrest-filter.test.ts` | **PASS** — 6/6 |
| Unit — indexing (incl. 6 new derivation tests) | `npx vitest run lib/seo/indexing.test.ts` | **PASS** — 42/42 |
| Unit — locale scope (regex fix + 2 new tests) | `npx vitest run lib/routing/locale-scope.test.ts` | **PASS** — 8/8 |
| Unit — i18n parity + namespaces | `npx vitest run lib/i18n-parity.test.ts lib/i18n-namespaces.test.ts` | **PASS** — 8/8 |
| Unit — **full suite** | `npx vitest run` | **PASS** — **2260 passed**, 42 skipped, 165 files, **0 failed** |

Baseline before V2's tests were added: 2170 passed / 161 files. V2 adds **90
tests across 4 new files** (`lib/seo/validate.test.ts`,
`lib/subjects/matching.test.ts`, `lib/subjects/labels.test.ts`,
`lib/postgrest-filter.test.ts`) plus 8 tests appended to two existing files.

**One pre-existing invariant test had to be fixed, not worked around.**
`lib/routing/locale-scope.test.ts` failed on the new footer link to `/authors`.
The cause was in the test: it carried a *second*, hand-rolled copy of the
locale-scope rule — `/(?:auth|admin|~offline)[^"`]*/` — with no segment
boundary, so the public route `/authors` matched the auth prefix `/auth`. The
real classifier `isLocaleScoped()` was correct all along (`UNSCOPED_PREFIXES`
spells it `"/auth/"`, with the slash). The test now calls `isLocaleScoped()`
instead of re-spelling the rule, which is the same duplicate-source defect this
work removed from `app/robots.ts`. Two regression tests pin it, including one
documenting that `/admin` is matched as a bare prefix — a real, currently
harmless sharp edge left unchanged rather than silently altered.

**Two type errors were introduced and fixed during the final refactor**, both
caught by re-running `tsc` rather than by trusting an earlier green build:
`subjectBreakdown`'s `Translate` shim declared `values` as
`Record<string, unknown>`, which is not assignable from next-intl's own
`Translator` under `strictFunctionTypes`; and the label test cast the message
catalogues to `Record<string, Record<string, string>>`, which nested namespaces
like `footer` do not satisfy. Both are corrected, with the reason recorded in
the source.

**E2E: written, type-checked, NOT executed.** The additions to `e2e/seo.spec.ts`
(hub canonicals and hreflang, Khmer hubs, footer reachability, breadcrumb
nav↔JSON-LD agreement, and a check that every subject URL in the sitemap renders
non-empty) compile but were not run — the e2e job needs a local Supabase stack,
the full migration chain and a Playwright run, none of which was performed here.
Recorded as partially implemented in §7.

---

### Build output for the new routes

Both hubs prerender **statically in both locales** — a hub is a destination, so
it must not cost a render per crawl:

```
● /en/subjects    ● /km/subjects
● /en/authors     ● /km/authors
ƒ /[locale]/subjects/[slug]      ƒ /[locale]/authors/[slug]
```

The detail routes stay server-rendered on demand with `revalidate = 3600`
(unchanged behaviour — they were already dynamic).

---

## 6. Production verification (2026-08-31)

Performed against `https://library.ptec.edu.kh` **before** the changes, by
inspecting real HTTP responses and rendered HTML — not by reading source.

| Check | Result |
|---|---|
| `GET /` | 200, prerendered (`x-nextjs-cache: HIT`), no stray `X-Robots-Tag` |
| `robots.txt` | 200, 3,077 B — Cloudflare managed block **prepended** to the app's rules; `Sitemap:` line present |
| `sitemap.xml` | 200, 15,597 B, **38 URLs**, 20 with `lastmod`, 0 duplicates, 0 private paths |
| Empty subject page | `/subjects/book-1781238023578` → **200, indexable, empty body** (F-1 confirmed live) |
| Khmer subject page | `/km/subjects/គីមីវិទ្យា` → English title, description and chrome (F-6 confirmed live) |
| `/authors/*` in sitemap | 0 entries |
| Canonical origin | `https://library.ptec.edu.kh` throughout — no localhost, staging or tunnel-fallback URL found |
| hreflang reciprocity | structurally correct on every page sampled |

**Not re-verified after the changes.** Nothing in this work has been deployed, so
no post-change production claim is made. The audit's live findings stand as the
pre-change baseline.

**No external validator was run.** Google Rich Results Test, the Schema.org
validator and Search Console were **not** used — the site's collection is not yet
published from this branch, and asserting results from tools that were not run
would be exactly the kind of unverified claim this work is trying to remove.
Running them post-deploy is the first item in §8.

---

## 7. Remaining opportunities

### Implemented
F-1, F-3, F-4, F-5, F-6, F-7, F-9 · sitemap validation · SEO validator layer ·
internal link graph · subject/author hubs · Khmer localization of the subject
layer · 76 unit tests.

### Partially implemented
- **E2E coverage.** New specs are written and type-check; they have **not been
  run**. Executing them needs the CI `e2e` job (local Supabase + migrations +
  seed + Playwright).
- **Admin SEO observability (audit F-11, brief §29).** Not built. The existing
  `lib/admin/metadata-quality-report.ts` scores *record* completeness well; a
  *page*-level report (missing H1, no inbound links, empty collection pages)
  would extend it. Deliberately not started rather than half-built — the brief
  is explicit that the existing quality infrastructure must be extended, not
  duplicated, and that is a design task of its own.

### Not implemented — decided, with reasons

All three were put to the owner and **decided on 2026-08-31**:

- **F-2 · Cloudflare AI Crawl Control → `app/robots.ts` is authoritative.**
  Public AI indexing stays allowed; the owner is disabling the managed
  `robots.txt` injection in the Cloudflare dashboard. **No code change is
  required** — `app/robots.ts` already allows those agents, which is precisely
  why the two disagreed. Until the dashboard change lands, production
  `robots.txt` still carries the contradicting block, so this needs one live
  re-check (see audit §5 for the exact command and success condition).
- **F-10 · Ten `book-<epoch-ms>` category slugs → deferred** to a dedicated
  migration task rather than delaying this release. They are indexable today, so
  the repair needs a migration **plus** permanent redirects; a silent rename
  would break live URLs. **SEO V2 does not depend on it**: all ten affected
  subjects are empty, so they are already excluded from the sitemap and render
  `noindex, follow`.
- **`/posts` guides → the team will author real bilingual content in
  production.** The publishing system is complete and needs no further work;
  candidate topics are in the content strategy §7.
- **F-8 · `/paths/[slug]` is `force-dynamic`.** Every crawl costs an auth
  round-trip and three uncached queries. The fix is to move learner progress
  client-side, as `/paths` already does — a behavioural change to the learning-
  path experience, outside an SEO change's blast radius, and not worth risking
  without the e2e suite running.

### Future work
1. Deploy, then run Rich Results Test, the Schema.org validator and a sitemap
   validator against live URLs.
2. Submit `https://library.ptec.edu.kh/sitemap.xml` in Search Console; watch
   whether subject URLs stop being reported as soft-404s.
3. Publish content — the architecture scales to thousands of resources and
   currently holds a handful. **This is the binding constraint, not the code.**
4. Fold the three inline copies of the PostgREST sanitizer into
   `lib/postgrest-filter.ts`.
5. Page-level SEO health report in the admin panel.

---

## 8. Files changed

**New — library**
`lib/seo/validate.ts` · `lib/subjects/index.ts` · `lib/subjects/matching.ts` ·
`lib/subjects/labels.ts` · `lib/authors/directory.ts` ·
`lib/resources/connections.ts` · `lib/postgrest-filter.ts`

**New — routes & components**
`app/[locale]/(public)/subjects/{page,loading}.tsx` ·
`app/[locale]/(public)/authors/{page,loading}.tsx` ·
`components/seo/ResourceConnections.tsx`

**New — tests**
`lib/seo/validate.test.ts` · `lib/subjects/matching.test.ts` ·
`lib/subjects/labels.test.ts` · `lib/postgrest-filter.test.ts`

**New — docs**
`docs/SEO-V2-AUDIT.md` · `docs/SEO-V2-URL-POLICY.md` ·
`docs/SEO-V2-CONTENT-STRATEGY.md` · `docs/SEO-V2-FINAL-REPORT.md`

**Modified**
`app/robots.ts` · `app/sitemap.ts` · `lib/seo/indexing.ts` ·
`lib/seo/indexing.test.ts` · `lib/routing/locale-scope.test.ts` ·
`lib/book-utils.ts` · `lib/books/index.ts` ·
`components/layout/Footer.tsx` · `e2e/seo.spec.ts` ·
`messages/{en,km}.json` ·
`app/[locale]/(public)/{subjects,authors,books,theses,publications}/[slug]/page.tsx`

Untouched by design: `lib/seo/{site,alternates,book-seo,thesis-seo,publication-seo,learning-path-seo,posts-seo,listing-metadata,open-graph,org-nodes,citation,identifiers,health,references,schema}.ts`,
`middleware.ts`, `next.config.ts`, `app/root-metadata.ts`.
