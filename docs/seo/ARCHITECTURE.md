# SEO architecture map

**Phase 0.1 of the 2026-09-30 SEO programme.** How the pieces that decide what a
search engine sees are wired today, measured at commit `622db9d` (main,
2026-09-30) and against `https://library.ptec.edu.kh` the same day.

Evidence labels: **CODE** (read in the repo, file:line), **LIVE** (a GET against
production on 2026-09-30), **INFERRED** (reasoned from both, not observed).
The older narrative doc is `docs/SEO-ARCHITECTURE.md` (2026-07-17); where they
disagree, this one was measured more recently.

---

## 1. Stack

| Item | Value | Evidence |
|---|---|---|
| Framework | Next.js **16.3.4**, **App Router**, webpack for `next build`, Turbopack for `next dev` | CODE `package.json`, `CLAUDE.md` |
| Cache Components (`cacheComponents` / `"use cache"`) | **Off.** Classic ISR model: `revalidate` + `generateStaticParams` | CODE: no match in `next.config.ts`, `app/`, `lib/` |
| Streaming metadata | **Off for every user agent**: `htmlLimitedBots: /.*/` puts `<title>`, meta and links in `<head>` before the body streams | CODE `next.config.ts:69` |
| Output | `output: "standalone"` for the Docker image | CODE `next.config.ts` |
| ISR cache handler | `lib/cache/isr-cache-handler.js`: Next's own `FileSystemCache`, subclassed only to shorten over-long (Khmer) file names | CODE `next.config.ts` `cacheHandler`, commit `3351540` |
| i18n | `next-intl` v4, `localePrefix: "as-needed"`: English unprefixed, Khmer under `/km` | CODE `i18n/routing.ts` |
| Data | Self-hosted Supabase (Postgres 17 + PostgREST, `max_rows = 1000`) since 2026-09-06 | CODE `infra/supabase/`, `CLAUDE.md` |
| Files | Zima Storage (`storage-ptec.online`), legacy R2 | CODE `lib/zima.ts` |

There is no separate backend repository. Every SEO surface (metadata, sitemap,
robots, JSON-LD, `llms.txt`) is rendered by this Next.js app from Supabase
reads, so every fix in this programme is in-repo. `docs/seo/BACKEND-CHANGES.md`
is not needed.

## 2. Routing and `<html lang>`

- **Three root layouts, no `app/layout.tsx`.** `app/[locale]/layout.tsx` owns the
  public tree; `app/(auth)` and `app/(admin)` own theirs. All three render
  `components/layout/RootShell.tsx`, which sets `<html lang>` from the route
  locale (`RootShell.tsx:178-179`). LIVE: `lang="en"` on every English URL and
  `lang="km"` on every `/km` URL checked (60/60).
- **Middleware** (`middleware.ts`) rewrites English requests to `/en/...`
  internally, 308s legacy `/home` → `/`, 301s `/en*` → unprefixed, 308s the
  tunnel's fallback host to the canonical host, gates unknown slugs to a real
  404, and sets `X-Robots-Tag` on private surfaces (`/api`, `/admin`, `/auth`,
  `/dashboard`, `/profile`, `/lists`, `/offline-*`), `middleware.ts:164-229`.
  LIVE: all four redirect probes and five missing-slug probes behave as described.
- **Every public route has a `loading.tsx`** (deliberate: `CLAUDE.md` › PWA).
  Next wraps the page in a Suspense boundary, so any page that awaits data
  streams its whole body: the first bytes carry the skeleton, and the real
  content (H1 included) arrives later inside `<div hidden id="S:n">`, revealed
  by an inline `$RC` script. LIVE: the H1 is inside such a hidden container on
  every indexable URL in the final baseline (52/52). One earlier sample of
  `/about/rules` (10:27 UTC) had it inline; every later sample of that URL, after
  a runtime ISR regeneration (`x-nextjs-cache: STALE` → `HIT`), had it hidden.
  So build-time prerenders may inline resolved content while runtime
  regenerations stream it (INFERRED, two samples). Google renders JavaScript
  and sees the page. Consumers that do not (most AI crawlers,
  HTML-to-text tools) see the skeleton and the footer, which is how an outside
  audit reported "no H1" (F2).

## 3. Metadata

| Concern | Where | Notes |
|---|---|---|
| Per-page metadata | `generateMetadata` in each `page.tsx` (the `/contact` layout for `/contact`) | no `next/head`: App Router only |
| Title template | one string for both locales, `"%s · PTEC Library"`, from System Settings (`lib/system-settings/defaults.ts:76` → `app/[locale]/layout.tsx:27-30`) | the Khmer brand exists in settings (`libraryName.km = "បណ្ណាល័យ វ.គ.ភ"`, `defaults.ts:33-36`) but is not used in titles (F9) |
| Listings | `lib/seo/listing-metadata.ts` `buildListingMetadata()`: self-canonical `?page=N`, `noindex, follow` when filtered / out of range / (optionally) empty | `/paths` and `/subjects` hubs do not use it (see ROUTES.md) |
| Canonical + hreflang | `lib/seo/alternates.ts` `localeAlternates(path, locale)`: self-canonical per locale plus `en`, `km`, `x-default` (= en) | LIVE: 51/51 indexable URLs carry all three, reciprocal |
| Open Graph / Twitter | `lib/seo/open-graph.ts` `buildOpenGraph()` / `buildTwitter()` | pages that skip it (search, reader, lists) inherit `og:locale = en_US` from `app/root-metadata.ts:35-40` |
| Record builders | `lib/seo/book-seo.ts`, `thesis-seo.ts`, `publication-seo.ts`, `journal-seo.ts`, `learning-path-seo.ts`, `posts-seo.ts` | each has its own description truncation (F7) |
| Scholar tags | `lib/seo/citation.ts` (books, theses, articles) | `citation_pdf_url` always points under `/api/` (F4) |
| Robots meta | `lib/seo/indexing.ts` `defaultRobots()` (environment gate AND the System Settings switch), narrowed per page | see `docs/SEO-ARCHITECTURE.md` for the two-switch model |

## 4. robots.txt, sitemap, llms.txt

| Surface | File | Behaviour (LIVE 2026-09-30) |
|---|---|---|
| `robots.txt` | `app/robots.ts` + `lib/seo/indexing.ts` (`$`-anchored private rules) | parses cleanly (no `Content-Signal` line any more); private prefixes blocked in both locales for every group; an explicit AI-crawler group allows public content; one `Sitemap:` line |
| `sitemap.xml` | `app/sitemap.ts`: one default export, no `generateSitemaps` | **one `<urlset>`, 2,395 URLs, 1.43 MB**; sections: books 1,957 (1,956 records + hub), authors 362, subjects 31, about 19, paths 10, journals 5, theses 3, posts 3, singles; `lastmod` from DB timestamps with `+00:00`; alternates `en` + `km` only; `<loc>` raw Unicode (1,851 non-ASCII) while canonicals are percent-encoded |
| `llms.txt` | `app/llms.txt/route.ts` (route handler) | 134 lines; lists recent catalogue records (which are `noindex`) and says "The English URL is canonical" (it is not: `/km` pages self-canonicalise) — F12 |

## 5. Structured data

- **One serializer**: `components/seo/JsonLd.tsx`, which escapes `<` (`:20`).
  Every block on the site goes through it.
- **Site graph on every page**: `buildSiteGraph()` in `RootShell.tsx:90-163`,
  emitted in `<body>` at `:228`: `EducationalOrganization`, `Library` (address,
  opening hours) and `WebSite` **with a `SearchAction`**. Names are English on
  `/km` too.
- **Per template**: a second (and sometimes third or fourth) block, e.g. `Book` +
  `BreadcrumbList` on a book. LIVE: 49 of 60 pages carry more than one block;
  all 60 parse; no empty or `"undefined"` values. `FAQPage` appears on `/`,
  `/policy` and articles with FAQs. The full list is in `ROUTES.md`.

## 6. Data layer

- Server reads use `createClient()` (anon key + cookies) or `createServiceClient()`
  (service role), `lib/supabase/server.ts`. Public, cacheable pages read through
  cookie-free helpers wrapped in `unstable_cache` with tags (`lib/cache/revalidate.ts`
  holds the tag vocabulary and the per-mutation revalidation helpers).
- **PostgREST clips every response at 1,000 rows** (`max_rows`). Four SEO
  surfaces were once silently built from the first 1,000 rows (see the 2026-09-23
  corpus audit and #243). Any new whole-table read for SEO must page (`pagedScan`,
  `lib/db/paged-scan.ts`) and order by a unique key.
- The Docker build **prerenders against the production database**: it needs the
  service-role key as a BuildKit secret (`Dockerfile:45-58`), so build-time HTML
  reflects the data at build time.

## 7. Every cache layer between the database and a crawler

| # | Layer | What it holds | Lifetime | Evidence |
|---|---|---|---|---|
| 1 | **Route segment config** | decides whether a route is static/ISR (`revalidate` + `generateStaticParams`) or dynamic (reads `searchParams`, `cookies()`, or `force-dynamic`) | per route; see ROUTES.md | CODE |
| 2 | **Build-time prerender** | HTML for static and `generateStaticParams`-listed pages, rendered in `docker build` from production data | until first revalidation after deploy | CODE `Dockerfile:45-58` |
| 3 | **ISR page cache** (`cacheHandler`) | rendered HTML/RSC for ISR routes, served `x-nextjs-cache: HIT/STALE` | `revalidate` (60 s home … 3600 s detail); in production **INFERRED memory-only**: the container is `read_only: true` and only `/tmp` and `/app/.next/cache` are writable (`docker-compose.yml:44-51`), while `FileSystemCache` writes pages under `.next/server/app`. So entries do not survive a restart | CODE + LIVE headers; to confirm, grep the box's container log for write errors |
| 4 | **Data cache** (`unstable_cache`) | query results, tagged | `revalidate` per call (e.g. 3600 s) or a tag hit; stored in `/app/.next/cache`, a **tmpfs**, wiped on every deploy | CODE |
| 5 | **HTTP headers** | Next emits `s-maxage=<revalidate>, stale-while-revalidate=<~1 year>` for ISR routes and `private, no-cache, no-store` for dynamic ones; `next.config.ts` `headers()` adds long caching only for static assets (`/hero`, `/pwa`, logos, favicons) | — | LIVE |
| 6 | **Cloudflare** (proxied DNS → Tunnel) | **no HTML at all**: `cf-cache-status: DYNAMIC` on every HTML response checked, including `s-maxage` pages (`/`, `/km`, `/subjects`, `/about/rules`, `/authors/unesco`), 40/40 on `/books` | — | LIVE |
| 7 | **Service worker** (Serwist, `app/sw.ts`) | navigations: NetworkFirst, 3 s timeout, 16 entries, **24 h max age** (`:194-207`) | 24 h | CODE; not in the path of any crawler |
| 8 | **Browser router cache** | client-side only | session | — |

No Redis, no custom `proxy_cache`, no Vercel edge in the production path
(`library.ptec.edu.kh` is a CNAME to the tunnel host; the Vercel alias
`ptec-elibrary.vercel.app` 308s to the canonical domain, and per-deployment
Vercel URLs require Vercel SSO). **Nothing in this stack can hold a page for
weeks.** That bounds F1; see `AUDIT-VERIFICATION.md`.

## 8. Deployment and CI

- **Production**: GitHub Actions `docker-publish.yml` builds the image (after
  re-running CI) and pushes `ghcr.io/raksmeyron97-design/ptec-elibrary:main`;
  the ZimaOS box's deploy timer pulls `:main` every 5 minutes; Cloudflare Tunnel
  publishes the container (`docker-compose.yml`; the box's connector targets
  `10.1.1.146:13000`, per the compose comment at `:36-42`). A merge reaches
  production roughly 30 minutes later.
- **Vercel** still builds a Production deployment for every merge to main
  (GitHub deployment records for `622db9d`), but none of it serves the public
  domain.
- **CI gates on PRs** (`.github/workflows/ci.yml`): gitleaks, dependency review,
  audit gate, `check:hero`, `tsc`, lint, `vitest run`, and an e2e job that boots
  a local Supabase stack from the migration chain and the seed.
- **After deploy**: `lighthouse.yml` (SEO/a11y/perf against the live site),
  `uptime.yml`, `entity-verification.yml` and `subject-gate.yml` (weekly
  verifiers), `ai-quality.yml`.
- **Migrations** reach production through the box's deploy script, not through
  `migrate.yml` (a green `migrate` check applies nothing here).

## 9. What this means for the programme

1. **Local production builds read the local Supabase stack**, not production:
   `.env.local` points at `http://127.0.0.1:54331`, which holds seed and
   imported data of every type (14 books, 4 theses, 5 articles, 2 posts,
   9 paths, 2,644 catalogue records, 4 subjects, 4 authors, 3 team members).
   Production slugs 404 there, so phase exits need a local URL list beside
   `scripts/seo-urls.json`. Production runs are for baselines and post-deploy
   checks only.
2. **Production cannot take load**: six concurrent requests produced 502s on
   2026-09-24. `seo-check` is sequential, paced and aborts on the second 5xx.
   A crawler that fetches in parallel can hit the same limit, and Google lowers
   its crawl rate after 5xx responses, so this is itself an SEO risk (F15).
3. **Fixes to cached pages need their tag revalidated.** Detail routes became
   runtime ISR on 2026-09-30 (#282, #284), so a metadata change reaches a
   cached page only after its tag fires or its `revalidate` window elapses.
