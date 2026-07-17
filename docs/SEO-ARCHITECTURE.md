# SEO Architecture

How indexing, canonical URLs, robots directives, the sitemap, and publish
gating fit together. Last updated: 2026-07-17 (environment indexing policy +
`/home` → `/` canonical consolidation).

## The one rule

**Everything indexing-related flows from two switches ANDed together:**

1. **Environment gate** — `isIndexableEnvironment()` in `lib/seo/indexing.ts`.
   Indexing is **opt-in**: only `VERCEL_ENV=production` (or an explicit
   `SEO_INDEXING=on`) is indexable. Previews, branch deploys, local dev, CI,
   and self-hosted staging are noindex by default. `SEO_INDEXING=off` is an
   emergency kill switch that wins everywhere, production included.
2. **Admin gate** — *System Settings → SEO & Sharing → Search engine
   indexing* (`seo.indexingEnabled`, published like every other setting).
   It can turn production OFF; it can never turn a preview ON.

Never write a robots decision anywhere else. Pages may only *narrow*
(e.g. filtered listings are `noindex, follow` via
`lib/seo/listing-metadata.ts`).

## Three enforcement layers (defense in depth)

| Layer | Where | Covers |
|---|---|---|
| `X-Robots-Tag` header (build) | `next.config.ts` headers() — baked only into non-indexable **builds** | every response incl. static files (PDFs, images) that middleware never sees |
| `X-Robots-Tag` header (runtime) | `middleware.ts` via `applySecurity` | non-indexable envs: everything; indexable envs: private surfaces (`noindex, nofollow`) |
| `<meta name="robots">` | `app/root-metadata.ts` baseline → `app/[locale]/layout.tsx` (admin switch) → per-page refinements | rendered HTML |

`robots.txt` (`app/robots.ts`, revalidates hourly) is **never the only
mechanism**: non-indexable → `Disallow: /`, no sitemap line; indexable →
allow with private-path disallows + sitemap reference.

Private surfaces (`PRIVATE_PATH_PREFIXES` in `lib/seo/indexing.ts`):
`/admin`, `/auth`, `/api`, `/dashboard`, `/profile`, `/lists`,
`/offline-books` — header + meta noindex in EVERY environment ((admin)/(auth)
layouts and the dashboard/lists/offline-books segment layouts carry
`NOINDEX_ROBOTS`). `/search` is deliberately NOT private: it is
`noindex, follow` at the meta level and stays crawlable so link equity flows.

## Canonical homepage: `/` (flipped 2026-07-17)

- `/` and `/km` ARE the homepage (`app/[locale]/(public)/(home)/page.tsx` —
  the pathless `(home)` group keeps the homepage's own loading/error
  boundaries without leaking them to siblings).
- Legacy URLs 308 in middleware: `/home` → `/`, `/km/home` → `/km`.
  `/en` and `/en/home` collapse 301 → `/` in ONE hop (no chains).
- Root canonical/hreflang/sitemap serialization is the **bare origin**
  (`https://library.ptec.edu.kh`, no trailing slash) and `…/km` — Next
  normalizes root canonicals this way under `trailingSlash:false`; keep
  `lib/seo/alternates.ts` (`localeUrls`) aligned with it.
- Internal revalidation keys for the homepage are `/en` and `/km`
  (`revalidatePublicPath("/")` — never `"/home"`, never `"/en/"`).
- Rollout note: browsers that cached the OLD `/` → `/home` 308 may bounce
  once until their redirect cache revalidates; server-side there is no loop.

## Base URL

`lib/seo/site.ts` — `SITE_URL` is validated at module load
(`normalizeSiteUrl`): origin-only, http(s) only, unparseable → production
origin, loopback hosts rejected in indexable environments. Use `SITE_URL` /
`absoluteUrl()`; never read `process.env.NEXT_PUBLIC_SITE_URL` directly
(a typo'd fallback domain shipped that way once).

## Sitemap (`app/sitemap.ts`)

Empty off-production and when the admin switch is off. Otherwise DB-driven,
published-only (`is_published` / `is_active`, `visibility` for posts), real
`lastmod` (omitted when untrustworthy), hreflang alternates per entry, one
canonical (English) entry per URL. Private/search/filter URLs are never
emitted.

## Publish gating

`lib/publish-readiness.ts` is shared by every path that can set a record
live: the theses actions (`checkPublishReady` delegates to it) and the review
queue (`transitionContent` refuses `published`/`scheduled` when
`publishBlockerFor` returns a blocker — it re-reads the canonical server row,
so client payloads can't sidestep it; it fails OPEN on lookup errors,
matching the file's legacy-column fallbacks). Publications keep their richer
gate in `lib/publications/review.ts` + `publishPublicationValidated`.

## Webmaster verification

System Settings → SEO stores `verification.google` / `verification.bing`
(token content values only). Rendered by `app/[locale]/layout.tsx` as
`google-site-verification` / `msvalidate.01` meta tags when non-empty.

## Testing

- Unit: `lib/seo/site.test.ts`, `lib/seo/indexing.test.ts`,
  `lib/seo/alternates.test.ts`, `lib/publish-readiness.test.ts`,
  `lib/cache/revalidate.test.ts`.
- E2E: `e2e/seo.spec.ts` (redirects, canonicals, robots meta+header,
  robots.txt, sitemap inclusion/exclusion). The Playwright webServer runs
  with `SEO_INDEXING=on` so e2e asserts production-shaped output; the
  non-indexable default matrix is unit-tested.

## Operational notes

- Rotating `SEO_INDEXING` on Vercel requires a redeploy for the
  `next.config.ts` header layer (middleware/robots/sitemap react at runtime,
  metadata of prerendered pages at build). Prefer the admin settings switch
  for planned de-indexing; reserve `SEO_INDEXING=off` for emergencies.
- After the domain is verified in Search Console, submit
  `https://library.ptec.edu.kh/sitemap.xml` and use URL Inspection on `/`
  to confirm the `/home` consolidation.
