# SEO V2 — URL Policy

The rules that decide what a URL on this site looks like, whether it may be
indexed, and where its canonical points. Companion to
[SEO-ARCHITECTURE.md](SEO-ARCHITECTURE.md) (the indexing/robots machinery) and
[SEO-V2-AUDIT.md](SEO-V2-AUDIT.md) (why these rules exist).

Enforced by `lib/seo/validate.ts` and pinned by `lib/seo/validate.test.ts`,
`lib/seo/indexing.test.ts` and `e2e/seo.spec.ts`.

---

## 1. Canonical format

| Rule | Value |
|---|---|
| Origin | `https://library.ptec.edu.kh` — always, from `lib/seo/production-origin.ts` |
| Scheme | `https` only |
| Trailing slash | none (`trailingSlash: false`); the root serializes as the **bare origin**, no `/` |
| Query | none, **except** `?page=N` on paginated listings |
| Fragment | never |
| Case | lowercase paths; slugs may carry Khmer characters and are percent-encoded in transit |

Never read `process.env.NEXT_PUBLIC_SITE_URL` directly. Use `SITE_URL` /
`absoluteUrl()` from `lib/seo/site.ts`, which validates the value at module load
and falls back to the production origin. A typo'd fallback domain shipped once
by reading the env var directly.

Three origins can serve one request behind Cloudflare Tunnel — the canonical
domain, the connector's fallback hostname (`library.storage-ptec.online`), and a
plain-http LAN address. A canonical is **never** derived from the request. The
fallback hostname 308s to the canonical host in middleware and is explicitly
non-indexable.

## 2. Locale format

`localePrefix: "as-needed"` (`i18n/routing.ts`):

- English is **unprefixed** — `/books/foo`
- Khmer lives under **`/km`** — `/km/books/foo`
- `/en*` collapses to the unprefixed form in **one** 301 hop
- English requests are rewritten to `/en/...` **internally**; the browser URL and
  `usePathname()` stay clean

Every indexable page emits reciprocal `en` / `km` / `x-default` alternates via
`localeAlternates(path, locale)`, with `x-default` equal to the English URL.

**Khmer alternates must be Khmer.** Declaring `hreflang="km"` on a page that
renders English content is a false alternate — `/km/subjects/*` did exactly that
before V2 (audit F-6). A page that cannot be localized must not claim a Khmer
alternate.

## 3. Query parameter rules

| Parameter | Indexable | Canonical points to |
|---|---|---|
| `?page=N` | **yes** | itself (`/books?page=2`) |
| `?q=`, `?search=` | no (`noindex, follow`) | itself |
| `?subject=`, `?dept=`, `?category=`, `?journal=`, `?year=`, `?lang=`, `?type=`, `?keyword=` | no (`noindex, follow`) | itself |
| `?sort=`, `?view=`, `?size=` | no (`noindex, follow`) | itself |
| any combination of the above | no (`noindex, follow`) | itself |

`buildListingMetadata()` (`lib/seo/listing-metadata.ts`) implements this: it sets
`robots: { index: false, follow: true }` whenever any parameter other than `page`
is present.

`follow`, never `nofollow` — the filter permutations stay crawlable so link
equity flows through to the resources behind them; they simply do not compete
for a place in the index.

**Rationale for the split.** `?page=2` reaches content that exists nowhere else,
so collapsing it onto page 1 would hide the tail of every collection. A sort or
a view toggle reaches the *same* content in a different order or shape; indexing
those would multiply one collection into dozens of near-duplicates.

## 4. Pagination

- Every page number carries a **self-referencing** canonical, not a canonical to
  page 1.
- Titles are suffixed (`Books — Page 2`) so no two pages share a title.
- A page past the last result (`?page=999`) is `noindex, follow` — an empty grid
  is not a useful index entry (`outOfRange`).
- Deep pages are **not** submitted in `sitemap.xml`. They are reached by
  crawling the pagination chain; submitting them competes with the resources
  they list.

## 5. Redirect rules

| From | To | Status |
|---|---|---|
| `/home`, `/km/home` | `/`, `/km` | 308 |
| `/en`, `/en/home` | `/` | 301, one hop |
| `library.storage-ptec.online/*` | `library.ptec.edu.kh/*` | 308 (`CANONICAL_HOST_REDIRECT=off` disables) |
| `/theses/<uuid>` | `/theses/<slug>` | permanent |

No redirect chains. A canonical or an hreflang alternate must never point at a
URL that redirects — `validateCanonicalUrl()` rejects the trailing-slash form
for this reason.

## 6. Private paths

`PRIVATE_PATH_PREFIXES` in `lib/seo/indexing.ts` is the **single source of
truth**:

```
/admin  /auth  /api  /dashboard  /profile  /lists  /offline-books
```

Everything derives from it, in both locale forms, via
`getPrivateSeoPaths()` / `getLocalizedPrivateSeoPaths()`:

- `X-Robots-Tag: noindex, nofollow` (middleware, every environment)
- `<meta name="robots">` (segment layouts carrying `NOINDEX_ROBOTS`)
- `Disallow:` rules in `robots.txt`
- exclusion from `sitemap.xml` (enforced by `validateSitemapEntry()`)

`app/robots.ts` used to hand-maintain a second copy. The two had drifted:
robots.txt disallowed a `/login` route that does not exist while omitting
`/km/auth` and `/km/admin`, which middleware *does* treat as private. Adding a
path to `PRIVATE_PATH_PREFIXES` now updates all four layers.

**`/search` is deliberately not private.** It is `noindex, follow` at the meta
level and stays fully crawlable.

**robots.txt is never the only mechanism.** A `Disallow` prevents crawling, not
indexing — a URL linked from elsewhere can still be indexed without ever being
fetched. The header and the meta tag are the real controls.

## 7. Sitemap rules

Included:

- published resources only (`is_published` / `is_active`, `visibility = 'public'` for posts)
- listing and informational pages
- topic and entity hubs **only when they have something to list**
- subjects **only when they have at least one public resource**

Excluded:

- any private path, in either locale
- filtered, sorted or searched URLs
- `?page=N`
- unlisted and admin-only posts
- duplicate URLs
- **empty subject pages** — ten of these were live before V2 (audit F-1)

One canonical (English) entry per URL, with `alternates.languages` covering both
locales, rather than doubling the entry count.

`lastmod` is the resource's real significant-update time or it is **omitted**.
Never the deploy time, never `now()`. An untruthful `lastmod` trains crawlers to
ignore the field entirely. `validateSitemapEntry()` rejects unparseable and
future values.

`validateSitemap()` runs on every request before the XML is served. Offending
entries are dropped rather than logged-and-served: a sitemap is an assertion to
a crawler, and a shorter correct one beats a longer wrong one.

## 8. The soft-404 rule

**A URL that renders an empty page must not be indexable and must not be in the
sitemap.** HTTP 200 with no content is a soft-404 — Google indexes it, reports it
as an error, and spends crawl budget on it.

Applies to:

- subject pages with no attached resources → `noindex, follow`, absent from the sitemap
- topic and entity hubs with an empty roster → absent from the sitemap
- internal links: `lib/resources/connections.ts` refuses to emit a link to a hub
  that has nothing on it

## 9. Adding a new public route

1. Create `loading.tsx` alongside `page.tsx` — there is no `(public)/loading.tsx` catch-all.
2. Emit `localeAlternates(path, locale)` in `generateMetadata`.
3. Spread `await openGraphBase(locale)` **first** in any `openGraph` object — Next
   replaces the layout's object rather than merging it, silently dropping
   `og:site_name`.
4. Add it to `app/sitemap.ts` only if it has real content and a real user purpose.
5. Add the messages to `messages/{en,km}.json`, and to `PUBLIC_NAMESPACES` only
   if a **client** component reads them.
6. If it is private, add the prefix to `PRIVATE_PATH_PREFIXES` — never to
   `app/robots.ts`.
