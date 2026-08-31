# SEO V2 — Architecture Audit

**Date:** 2026-08-31
**Scope:** the entire public surface of PTEC e-Library (`app/[locale]/(public)/**`),
plus `app/robots.ts`, `app/sitemap.ts`, `app/root-metadata.ts`, `middleware.ts`,
`next.config.ts` and `lib/seo/*`.
**Method:** source inspection + live verification against
`https://library.ptec.edu.kh` (HTTP responses and rendered HTML, not assumed
behaviour).

Companion documents: [SEO-V2-URL-POLICY.md](SEO-V2-URL-POLICY.md),
[SEO-V2-CONTENT-STRATEGY.md](SEO-V2-CONTENT-STRATEGY.md),
[SEO-V2-FINAL-REPORT.md](SEO-V2-FINAL-REPORT.md). The pre-existing
[SEO-ARCHITECTURE.md](SEO-ARCHITECTURE.md) remains the reference for the
indexing/canonical model, which V2 extends rather than replaces.

---

## 1. Verdict

The technical SEO foundation is **already strong and should not be rewritten**.
`lib/seo/` is a well-factored, unit-tested layer with a deliberate accuracy
discipline (omit rather than fabricate), a single validated origin, reciprocal
hreflang, an environment-gated indexing switch, and a DB-driven sitemap with
honest `lastmod`. Six of the ten areas the V2 brief asks for are already
implemented to a production standard.

What is missing is not tags — it is **structure**. The site publishes resource
detail pages and listing pages, but the layers that turn a catalogue into a
knowledge graph (topic hubs, entity hubs, and the internal links between them)
are absent or stubbed. Two whole URL families — `/subjects/*` and `/authors/*` —
are advertised in the sitemap with **no index page anywhere on the site linking
to them**.

Live production also revealed two problems invisible from the repository: an
edge-injected `robots.txt` that contradicts the app's own rules, and ten
indexable, empty subject pages.

---

## 2. What is already correct (preserve)

| Area | Where | Assessment |
|---|---|---|
| Origin validation | `lib/seo/site.ts` | Origin-only, http(s)-only, loopback rejected in indexable envs, unparseable → production origin. No route may read `NEXT_PUBLIC_SITE_URL` directly. **Correct.** |
| Indexing gate | `lib/seo/indexing.ts` | Opt-in, three-layer enforcement (build header / runtime header / meta), plus an admin kill switch ANDed on top. **Correct.** |
| hreflang | `lib/seo/alternates.ts` | Reciprocal `en`/`km`/`x-default`, root serialized as bare origin to match Next under `trailingSlash:false`. **Correct.** |
| Pagination policy | `lib/seo/listing-metadata.ts` | Self-canonical per page, `noindex, follow` for filtered and out-of-range pages. **Correct** — this is precisely what brief §9 asks for, already shipped. |
| Sitemap honesty | `app/sitemap.ts` | Published-only, real `lastmod` (omitted when untrustworthy), PostgREST `max_rows` paging, 50k guard, per-entry alternates. **Correct.** |
| Bibliographic accuracy | `lib/seo/book-seo.ts` and siblings | PTEC is `provider`, never `publisher`; `pages <= 1` sentinel suppressed; `isbn === "N/A"` suppressed; authors omitted when unknown. **Correct, and unusually disciplined.** |
| Schema entity selection | `thesis-seo.ts`, `publication-seo.ts`, `learning-path-seo.ts` | Theses and publications are `ScholarlyArticle` (not `Book`); learning paths are `Course`. **Correct** — brief §13's warning does not apply here. |
| Open Graph merge trap | `lib/seo/open-graph.ts` | `openGraphBase()` + a source-scanning test prevents pages silently dropping `og:site_name`. **Correct.** |
| Book publication date | `lib/seo/book-seo.ts` + `lib/books/index.ts:75` | `Book.uploadedAt` is mapped from `books.published_at`, and both `generateMetadata` and the JSON-LD read the same value. **No divergence** — brief §11's suspected bug does not exist. See F-9 for the naming hazard that remains. |

---

## 3. Findings

Severity: **P0** critical · **P1** high impact · **P2** medium · **P3** optional.

### P0 — Critical

#### F-1 · Ten indexable, empty subject pages are in the sitemap
`/subjects/book-1781238023578` … `/subjects/book-1781239299098` return **HTTP
200** with a rendered body of *"No public resources are attached to this subject
yet."* They carry a self-referencing canonical, are `index, follow`, and all ten
are listed in `sitemap.xml`.

That is a soft-404 by Google's definition, submitted for indexing. Ten of the
fifteen subject URLs in the live sitemap — **two-thirds of the subject
namespace** — are in this state.

Their slugs also mismatch their names: the slug is a timestamp
(`book-1781238023578`) while the category name is `ស្រាវជ្រាវ` ("Research"), so
an import generated slugs from a row identifier rather than the name.

*Fix:* the sitemap must count a subject's public resources and emit only
non-empty subjects; empty subjects must render `noindex, follow`. The slug
repair is a data migration and is called out separately as F-10 rather than
performed silently.

#### F-2 · Production `robots.txt` is overridden at the edge, contradicting `app/robots.ts`
The live file is **not** what `app/robots.ts` produces. Cloudflare's *AI Crawl
Control* managed block is injected ahead of it, ending in `# END Cloudflare
Managed Content`, and it emits:

```
User-agent: CCBot          Disallow: /
User-agent: ClaudeBot      Disallow: /
User-agent: Google-Extended Disallow: /
User-agent: GPTBot         Disallow: /
User-agent: meta-externalagent Disallow: /
```

`app/robots.ts` deliberately **allows** exactly those agents across the public
library. The two policies are in direct conflict, the edge copy wins for every
path not explicitly re-allowed, and nothing in the repository reveals it.

This is a Cloudflare dashboard setting, not a code defect — it is documented and
escalated, **not** silently "fixed". See §5.

#### F-3 · `app/robots.ts` maintains a second, drifted copy of the private-path list
`PRIVATE_PATH_PREFIXES` in `lib/seo/indexing.ts` drives the `X-Robots-Tag`
header and the meta robots. `app/robots.ts` hand-maintains its own
`privatePaths` array. They have already diverged:

| Path | `PRIVATE_PATH_PREFIXES` | `robots.ts` |
|---|---|---|
| `/login` | absent | present |
| `/km/auth`, `/km/admin` | covered (locale-stripped) | **missing** |
| `/km/api` | n/a | **missing** |

Brief §7 asks for exactly one source of truth. Two lists that must agree, and
already do not, is the defect.

### P1 — High impact

#### F-4 · No `/subjects` index and no `/authors` index — two orphaned URL families
`app/[locale]/(public)/subjects/` and `.../authors/` contain **only**
`[slug]/`. There is no hub page, and no navigation entry, linking to either.

Every subject and author URL in the sitemap is therefore an orphan: reachable
from `sitemap.xml` alone, with no internal link path from the homepage. On the
live site that is 15 subject URLs today and every author profile the moment
authors exist. This is the single largest structural gap and the direct cause of
F-5 and F-6.

#### F-5 · Breadcrumbs point at routes that do not match their labels
- `/subjects/[slug]`: crumb reads **"Subjects"** but links to **`/books`** — in
  the visible `<nav>` *and* in the emitted `BreadcrumbList` JSON-LD.
- `/authors/[slug]`: crumb reads **"Authors"** but links to **`/publications`**
  (with a source comment conceding it points there "rather than at a 404").

Brief §19 requires visible breadcrumb = JSON-LD breadcrumb = canonical route.
Both are currently machine-readable claims that a page lives somewhere it does
not. Both are consequences of F-4 and resolve once the hubs exist.

#### F-6 · `/km/subjects/*` serves English — a false hreflang alternate
`app/[locale]/(public)/subjects/[slug]/page.tsx` uses no `next-intl`
namespace. There is no `subjects` key in `messages/en.json` or `messages/km.json`.

Verified live at `/km/subjects/គីមីវិទ្យា`:

- `<title>` — `គីមីវិទ្យា Resources · PTEC Library` (English "Resources")
- `<meta name="description">` — `Browse PTEC Library books, theses, publications, and catalog records about គីមីវិទ្យា.` (fully English)
- body chrome — `Subject`, `Public resources in the PTEC Library connected to this subject`, `E-book`, `Thesis`, `Publication`, `Physical book` — all English

The page declares `hreflang="km"` pointing at content that is not Khmer. Brief
§23 requires Khmer to be first-class; today the Khmer subject page is a
duplicate of the English one wearing a `/km` prefix.

#### F-7 · Subject pages are filters, not landing pages
No description, no resource counts, no related subjects, no per-type grouping,
no `ItemList` covering the items actually shown (only a bare `CollectionPage`
naming the subject). Brief §15 asks for a real landing page; today the page is
one flat grid of up to 36 mixed cards with a one-line English sentence above it.

#### F-8 · `/paths/[slug]` is `force-dynamic`
`export const dynamic = "force-dynamic"` means every crawl of a learning-path
page performs an auth round-trip plus 3 database calls with no cache. Learning
paths are the topic-authority layer brief §17 leans on hardest; they are the one
resource family that is never prerendered. The per-visitor part is learner
progress, which is already fetched client-side elsewhere on the same route
family (`/paths` is ISR at `revalidate = 3600` for this reason).

### P2 — Medium

#### F-9 · `Book.uploadedAt` holds the publication date
`lib/books/index.ts:75` maps `uploadedAt: row.published_at`. The value is
correct and used correctly, but the field name asserts the opposite. The book
detail page reads `publishedAt: book.uploadedAt` — a line that looks like the
exact bug brief §11 warns about and is not. One rename removes a permanent
misreading hazard (3 call sites).

#### F-10 · Timestamp-derived category slugs
Ten categories carry slugs of the form `book-<epoch-ms>` unrelated to their
names. Repairing them means a data migration plus 301s from the old URLs. Out of
scope for a code change; recorded as owner follow-up in §5.

#### F-11 · No orphan/thin-page detection in admin observability
`app/actions/data-quality.ts` + `lib/admin/metadata-quality-report.ts` score
*record* completeness well, but nothing reports *page*-level SEO health
(missing H1, no inbound internal links, empty collection pages). Brief §§27–29.

### P3 — Optional

- **F-12** `/theses/summary` sits in the sitemap at priority 0.6 with no inbound link from `/theses`.
- **F-13** `/search` is correctly `noindex, follow`, but the ranking-rich page has no crawlable topic entry points feeding it.
- **F-14** The homepage `<title>` comes from published settings and cannot be tuned per brief §22 without an admin edit — correct by design, but worth noting the lever is in System Settings → SEO, not code.

---

## 4. Live production snapshot (2026-08-31)

| Check | Result |
|---|---|
| `GET /` | `200`, `x-nextjs-cache: HIT`, prerendered, no `X-Robots-Tag` (correct for indexable production) |
| `robots.txt` | `200`, 3,077 bytes — Cloudflare managed block + app rules + `Sitemap:` line (see F-2) |
| `sitemap.xml` | `200`, 15,597 bytes, **38 URLs**, 20 with `lastmod`, **0 duplicates**, 0 private paths |
| Sitemap composition | 15 `/subjects` (10 empty — F-1), 8 `/about`, 3 book details, 1 post detail, 1 team profile, 10 listing/informational |
| `/authors/*` in sitemap | **0** — the `authors` table has no rows the sitemap query returns |
| Thesis / publication / path / catalog **detail** URLs | **0** — only the listing pages are live |
| hreflang reciprocity | Structurally correct on every page sampled |
| Canonical origin | `https://library.ptec.edu.kh` everywhere; no localhost, staging or tunnel-fallback URL found |

The collection is small today (3 books, 1 post, 0 theses, 0 publications, 0
paths). SEO V2 must therefore be judged on whether the *structure* scales, not on
current URL counts — and must degrade gracefully to empty states rather than
emitting hub pages full of nothing.

---

## 5. Not code — owner follow-up

These are real findings this work cannot resolve from the repository.
**Decisions taken 2026-08-31** are recorded inline.

1. **F-2 · Cloudflare AI Crawl Control.**
   **DECIDED: `app/robots.ts` is the source of truth.** Public AI indexing stays
   allowed; the owner is disabling the managed `robots.txt` injection in the
   Cloudflare dashboard (Settings → AI Crawl Control).
   *No code change* — `app/robots.ts` already allows those agents, which is why
   the conflict existed. **Until the dashboard change lands, production
   `robots.txt` still contradicts the app**, so re-verify with:
   ```bash
   curl -s https://library.ptec.edu.kh/robots.txt | head -40
   ```
   The fix is confirmed when the `# BEGIN Cloudflare Managed content` block —
   and its `Disallow: /` groups for CCBot, ClaudeBot, Google-Extended, GPTBot
   and meta-externalagent — no longer appear.

2. **F-10 · Category slug repair.**
   **DECIDED: deferred to a dedicated migration task**, so it does not delay this
   release. Renaming the ten `book-<epoch>` slugs needs a migration **plus**
   permanent redirects — they are indexable today, so this must never be a
   silent rename. Nothing in SEO V2 depends on it: the ten affected subjects are
   empty, so they are already excluded from the sitemap and render
   `noindex, follow`.

3. **Search Console.** Submit `https://library.ptec.edu.kh/sitemap.xml` and
   verify the property. Verification tokens already have a home in System
   Settings → SEO (`verification.google` / `verification.bing`).

4. **`/posts` guides.**
   **DECIDED: the team will draft real bilingual content directly in
   production.** The publishing system (Markdown pipeline, per-post SEO
   overrides, `Article` JSON-LD, scheduling, bilingual fields) is ready and
   needs no further work. Candidate topics are listed in
   [SEO-V2-CONTENT-STRATEGY.md](SEO-V2-CONTENT-STRATEGY.md) §7.

---

## 6. Implementation order

Derived from the findings above, not from the generic template:

| Phase | Findings addressed |
|---|---|
| 1 · Technical hardening | F-3 (one private-path source), F-1 (sitemap + noindex for empty subjects), sitemap validation utilities |
| 2 · Topic + entity hubs | F-4 (`/subjects`, `/authors` indexes), F-5 (breadcrumbs become true) |
| 3 · Subject landing pages | F-6 (Khmer first-class), F-7 (counts, grouping, related subjects, `ItemList`) |
| 4 · Internal link graph | resource → subject → author → path edges |
| 5 · Correctness cleanup | F-9 (rename), F-8 (assessed) |
| 6 · Tests | canonical, hreflang, robots, sitemap, structured data, multilingual |
| 7 · Docs + verification | URL policy, content strategy, final report |
