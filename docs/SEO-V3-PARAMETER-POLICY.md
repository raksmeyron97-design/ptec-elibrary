# SEO V3 — URL Parameter & Crawl Policy

**Date:** 2026-08-31
**Status:** documents behaviour that is **already implemented and verified live**,
plus the two rules SEO V3 added.

Companion: [SEO-V2-URL-POLICY.md](SEO-V2-URL-POLICY.md) (route-level canonical
rules — still current) · [SEO-V3-AUDIT.md](SEO-V3-AUDIT.md)

---

## 1. The rule in one line

**A listing URL is indexable only when it is unfiltered.** Everything else is
`noindex, follow` and canonicalises to the clean listing — so parameters can
never multiply into an index, but link equity still flows through them to the
resources they list.

Implemented once, in `buildListingMetadata()` (`lib/seo/listing-metadata.ts`):

```ts
robots: hasFilters || outOfRange ? { index: false, follow: true } : undefined,
```

`follow` is deliberate. A filtered page is not a destination, but it *is* a
path to real resource pages, and `nofollow` would waste that.

---

## 2. Parameter inventory

Every query parameter the public listings accept, read from the route sources.

### `/books`

| Param | Purpose | Counts as a filter | Indexable |
|---|---|---|---|
| `page` | pagination | **no** | **yes** — self-canonical `?page=N` |
| `q` | search term | yes | no |
| `dept` | department | yes | no |
| `language` | language | yes | no |
| `format` | format | yes | no |
| `sort` | ordering | yes | no |
| `size` | rows per page | yes | no |

### `/theses`

`page` (indexable) · `q`, `program`, `faculty`, `cohort`, `year`, `author`,
`advisor`, `keyword`, `sort`, `view`, `size` (all `noindex, follow`).

### `/publications`

`page` (indexable) · `q`, `journal`, `subject`, `keyword`, `type`, `language`,
`year`, `sort`, `view`, `size` (all `noindex, follow`).

### `/catalogs`

`page` (indexable) · `q`, `category`, `availability`, `language`, `sort`,
`size` (all `noindex, follow`).

### `/posts`, `/paths`, `/subjects`, `/authors`

No filter parameters. The clean URL is the only URL.

### `/search`

`robots: { index: false, follow: true }` **unconditionally**
(`app/[locale]/(public)/search/page.tsx:18`) — internal search results never
compete as landing pages (§34), but stay crawlable so the resources they link
to are discovered.

---

## 3. Pagination

`?page=N` is the one parameter that keeps its own indexable identity:

- **self-canonical** — `?page=2` canonicalises to `?page=2`, never to page 1.
  Canonicalising a paginated set to its first page is how the items on pages
  2..N stop being discoverable.
- **titled** — `… — Page 2`, so paginated results are distinguishable in a SERP.
- **`outOfRange` → `noindex, follow`** — a page past the last real page has no
  content; it is not advertised, but its links still work.
- `page=1` is normalised away, so the clean URL and `?page=1` are one URL.

---

## 4. Rules SEO V3 added

### 4.1 No query URL may appear in structured data

A `BreadcrumbList` item pointing at `/books?dept=Science` advertises, as a
navigational waypoint, a URL this same site serves as `noindex, follow` and
canonicalises to `/books`. Two crumbs did exactly that (audit D-5).

`breadcrumbSchema()` now strips the query from every crumb path, and
`lib/seo/breadcrumbs.test.ts` scans the call sites so no new one can introduce
another. When a filtered listing was the only available waypoint, the crumb is
either replaced by a real hub (`/subjects/<slug>` for a book) or dropped.

### 4.2 No redirecting URL may appear in structured data

`/home` 308s to `/`. `breadcrumbSchema()` resolves it, and the call-site scan
rejects it outright.

---

## 5. robots.txt

`app/robots.ts` **disallows path prefixes, never parameters.** This is
deliberate:

- a `Disallow: /*?*` style rule would stop crawlers *fetching* filtered pages,
  which also stops them following the links to real resources inside;
- `noindex, follow` achieves the index-hygiene goal without that cost;
- robots.txt is never this site's only protection — `X-Robots-Tag`, metadata
  robots and sitemap exclusion all derive from `PRIVATE_PATH_PREFIXES`
  (`lib/seo/indexing.ts`).

**Live caveat:** Cloudflare prepends a managed block to the served
`robots.txt`. It contradicts the app's rules for several AI user agents **and**
carries a `Content-Signal:` line that is not a valid robots directive — the
only invalid line in the file. Lighthouse scores the `robots-txt` audit 0 as a
result, holding every page's SEO category at 0.92 and failing `lighthouse.yml`
on every merge to `main`. See audit D-8 (P0). Dashboard-side, tracked.

---

## 6. Sitemap

Only clean URLs. No entry carries a query string — `validateSitemapEntry()`
treats `canonical-has-query` and `canonical-has-fragment` as **fatal** rules and
drops the entry before the file is served (`app/sitemap.ts`).

---

## 7. Decision table

| URL shape | Robots | Canonical | In sitemap |
|---|---|---|---|
| `/books` | index, follow | self | yes |
| `/books?page=2` | index, follow | self (`?page=2`) | no — reached by crawling |
| `/books?page=999` (out of range) | noindex, follow | self | no |
| `/books?dept=X` | noindex, follow | `/books` | no |
| `/books?dept=X&sort=new&page=3` | noindex, follow | `/books` | no |
| `/search?q=…` | noindex, follow | `/search` | no |
| `/books/<slug>` | index, follow | self | yes |
| `/subjects/<slug>` with resources | index, follow | self | yes |
| `/subjects/<slug>` empty | **noindex, follow** | self | **no** |
| `/admin/*`, `/auth/*`, `/api/*`, `/dashboard/*`, `/profile`, `/lists`, `/offline-books` | noindex, nofollow | — | no |
| `/home` | 308 → `/` | — | no |
| `/en/*` | 308 → unprefixed | — | no |

All of it derives from three modules — `lib/seo/indexing.ts`,
`lib/seo/listing-metadata.ts`, `lib/seo/validate.ts` — so a new listing route
inherits the policy by calling `buildListingMetadata()` and needs no new rules.
