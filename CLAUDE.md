# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PTEC e-Library is a free public digital library for Phnom Penh Teacher Education College (PTEC). It is a Next.js 16 App Router application with Supabase (Postgres + Auth), Zima Storage (file storage, with legacy Cloudflare R2 fallback), Gemini-powered AI search/assistant, and full bilingual support (English/Khmer).

## Commands

```bash
npm run dev          # Start development server (Turbopack — Next 16's default for dev)
npm run dev:clean    # Same, after deleting .next — use when dev renders get slow (see below)
npm run build        # Production build (next build --webpack — NEVER switch to Turbopack: it silently skips building app/sw.ts, killing the PWA)
npm run lint         # ESLint
npx tsc --noEmit     # Type check (CI runs it with NODE_OPTIONS=--max-old-space-size=4096 — it OOMs at the 2 GB default)
npm test             # Vitest unit tests (watch mode)
npx vitest run       # Single pass — what CI runs
npx vitest run lib/books.test.ts   # Run a single test file
npm run test:e2e     # Playwright end-to-end tests
npm run doctor       # react-doctor diagnostics
npm run pwa:assets   # Regenerate iOS launch images + maskable icons (prebuild verifies with --check)
npm run check:hero   # Verify public/hero/ variants match the source (also a prebuild + CI gate)
npx tsx scripts/embed-library.ts       # Backfill pgvector embeddings for AI search
npx tsx scripts/check-file-health.ts   # Out-of-band sweep of book/thesis file+cover URLs → file_health table
```

`postinstall` copies PDF.js assets via `scripts/copy-pdf-assets.mjs`. `prebuild` gates the build on `check:hero` + `generate-pwa-assets --check`.

**What CI enforces** (`.github/workflows/ci.yml`), in order: gitleaks secret scan → `dependency-review` (PRs) → `node scripts/audit-gate.mjs` (fails on *fixable* high/critical prod advisories, warns on framework-pinned ones — a bare `npm audit --audit-level=high` blocked every PR once) → `check:hero` → `tsc --noEmit` → `lint` → `vitest run`, plus a separate `e2e` job that boots a real local Supabase stack, applies the whole migration chain, seeds from `supabase/seed.sql`, and runs Playwright. Playwright's `webServer` starts `npm run dev` with `SEO_INDEXING=on`, because the suite asserts production-shaped SEO output.

**What runs after deploy, not on PRs.** Quality audits deliberately target the live site (`https://library.ptec.edu.kh`), because CI has no real Supabase/storage env and a local `next start` would score empty error states:

- `lighthouse.yml` — Lighthouse CI on push to main (after a 180 s deploy-settle sleep) + Mondays. Thresholds/budgets live in `lighthouserc.json`, split into an all-URLs matrix (a11y ≥ 0.95 and best-practices ≥ 0.9 are **errors**; perf ≥ 0.75 warns) and an SEO matrix that excludes `/auth/*` (login pages are noindex by design, so `is-crawlable`/`canonical` there are false signals). `uses-http2` and `charset` are skipped for tooling reasons documented inline in that file — don't re-enable `charset` without reading the comment. The `broken-links` linkinator crawl is weekly/manual only.
- `uptime.yml` (every 15 min) and `check-file-health.yml` (Sundays → `file_health` table).

### When `npm run dev` renders slowly

`dev` runs Turbopack and `build` runs webpack, so `.next` accumulates **two**
independent caches (`.next/dev` and `.next/cache/webpack`). Measured on a
16 GB machine at 3.6 GB of `.next`, warm page renders had degraded to 6–30 s;
`rm -rf .next` brought the same routes back to 0.5–0.7 s. Next's own log tells
you where the time goes — `application-code` is your code, `next.js` is
framework overhead:

```
GET /about/rules 200 in 6.4s (next.js: 354ms, ..., application-code: 6.0s)
```

Two causes, both fixed, worth knowing if it recurs:

1. **Stale `.next`** — the dominant factor. `npm run dev:clean`, or
   `rm -rf .next`. Do this before concluding anything is wrong with the code.
2. **Barrel imports** — `experimental.optimizePackageImports` in
   `next.config.ts` lists `lucide-react`, whose barrel re-exports 3,972 icon
   modules across 300 importing files. Without it, dev render time scaled with
   component-tree size rather than with work done. Add any future
   many-named-exports icon/util package to that list.

API routes staying fast (~200 ms) while pages are slow is the signature of
this problem, not of a database or network issue.

Database migrations are in `supabase/migrations/` and are applied to the hosted DB by CI (`.github/workflows/migrate.yml`: dry-run on PRs, apply on merge to main — see `supabase/MIGRATIONS.md`). Never apply by hand in the dashboard SQL editor. For local Supabase: `supabase start`. The `e2e` CI job boots a fresh local stack, so every migration must apply cleanly from the squashed baseline; `node scripts/migrations/check-schema-drift.mjs` diffs hosted columns against the chain.

## Architecture

### Route Groups

- `app/[locale]/(public)/` — public pages (home, books, catalogs, theses, publications, posts, authors, subjects, `paths` = learning paths, about, contact, policy, privacy, search, lists, dashboard, offline-books), locale-prefixed (English unprefixed, Khmer under `/km`; see Internationalisation below). The homepage IS the locale root: `app/[locale]/(public)/(home)/page.tsx` serves `/` and `/km` (the pathless `(home)` group keeps home-specific loading/error boundaries); legacy `/home` (`/km/home`) 308-redirects to `/` (`/km`) in middleware.
- `app/(auth)/` — authentication flows (login, signup, forgot/reset password)
- `app/(admin)/admin/` — admin panel: `login`, `mfa` (enroll/verify), and `(protected)/` which holds all admin sections

There is deliberately **no `app/layout.tsx`**. Three root layouts each own `<html>` via the shared `components/layout/RootShell.tsx` (theme-init inline script for FOUC prevention + `IntlProvider`): `app/[locale]/layout.tsx` (public — locale arrives as a root param, keeping the tree prerenderable), `app/(auth)/layout.tsx`, and `app/(admin)/layout.tsx` (both cookie-driven, dynamic). Don't reintroduce a single root layout — reading `headers()`/`cookies()` above `[locale]` is what previously forced every public page to `private, no-store`.

### Middleware (`middleware.ts`)

- **Split CSP**: auth/admin paths get a per-request nonce CSP (propagated via `x-nonce`; a stricter report-only policy reports to `/api/csp-report`); public paths get a nonce-free `unsafe-inline` policy so they stay prerenderable (a nonce forces dynamic rendering, and any nonce/hash voids `unsafe-inline`). Never set `x-nonce` on public paths.
- Redirects legacy `/home` (and `/km/home`) → `/` (`/km`) with a 308, strips `/en` prefixes (`/en` and `/en/home` collapse to `/` in one hop), rewrites English requests internally to `/en/...` (`/` → `/en`), and rewrites unknown public slugs to a real 404 (public pages have `loading.tsx`, which would otherwise stream a 200 first).
- Sets `X-Robots-Tag` from `lib/seo/indexing.ts`: blanket noindex on non-indexable environments, `noindex, nofollow` on private surfaces (admin/auth/api/dashboard/profile/lists/offline-books) everywhere.
- Only calls Supabase `getUser()` for routes that actually need auth (`/dashboard`, `/profile`, auth pages) — public pages take a fast path with no network call.
- Static assets like `/pdf/*` (including extensionless files, e.g. `LICENSE`) and `/hero/*` must bypass locale rewriting — breaking this 404s SW-precached files and kills service-worker install.

### Auth, Roles & Authorization

- `lib/supabase/server.ts` exports two clients:
  - `createClient()` — ANON key + session cookies, for reading public data and verifying the current user
  - `createServiceClient()` — SERVICE_ROLE key, bypasses RLS; **server-only, never import client-side**
- **Five roles** (`lib/types/roles.ts`): `reader`, `staff`, `librarian`, `admin`, `super_admin`, with helper groups (`ADMIN_PANEL_ROLES`, `LIBRARIAN_ROLES`, `STAFF_ROLES`, `ADMIN_ROLES`).
- **Guards** (`lib/auth-guards.ts`, re-exporting from `lib/auth/requireAdmin.ts`): `requireUser()`, `requireStaff()`, `requireLibrarian()`, `requireAdmin()`, `requireSuperAdmin()`, and `requirePermission(resource, level)`. Call the appropriate guard at the top of every Server Action that needs auth.
- **Per-role permissions** live in the `role_permissions` table (resource × `none|read|write`), with hardcoded fallbacks in `lib/permissions.ts` (`DEFAULT_PERMISSIONS`).
- Admin route protection is in `app/(admin)/admin/(protected)/layout.tsx`: redirects to `/admin/login` unless the profile role is in `ADMIN_PANEL_ROLES`, then **enforces MFA (AAL2)** — users with enrolled factors must verify, users without are sent to enroll at `/admin/mfa`.

### File Storage

**Zima Storage is primary** (`lib/zima.ts`, configured by `ZIMA_API_URL`/`ZIMA_API_KEY`); Cloudflare R2 remains as a legacy fallback for old DB records that store bare R2 keys.

- Uploads go through the `uploadToZima()` Server Action in `app/actions/upload.ts` (client sends FormData). It checks `requirePermission("books", "write")`, restricts destination folders to `books/`, `posts/`, `research/`, `reports/`, `team/`, `avatars/`, and optimizes images with sharp (`lib/image-optimize.ts`) before upload.
- Downloads go through `/api/books/[slug]/download/route.ts`: Zima URLs are proxied via `zimaFetch()`; bare R2 keys get a 5-minute presigned GET URL from the legacy private bucket. Downloads are logged.
- Book covers: Zima CDN URLs stored directly, or legacy R2 keys prefixed with `NEXT_PUBLIC_R2_COVERS_URL`.
- User avatars use Vercel Blob (`BLOB_READ_WRITE_TOKEN`).

### AI Features (Gemini)

All Gemini calls are server-side only (`GEMINI_API_KEY` — never `NEXT_PUBLIC_`). Every AI route enforces cost controls: per-user daily quota, a global daily circuit breaker (tracked in the `ai_usage` table using sentinel UUIDs), and an in-memory per-user cooldown.

- `/api/search` — public semantic search. Hybrid retrieval: pgvector similarity (768-dim `gemini-embedding-001`, migration `0029_pgvector_search.sql`) with keyword fallback, plus a one-shot Gemini summary. Requires an embeddings backfill via `scripts/embed-library.ts`.
- `/api/ask` — auth-gated assistant using a Gemini function-calling tool loop (non-streaming). Library facts come from `lib/library-info.ts`.
- `/api/chat` — streaming RAG assistant built on the Vercel AI SDK (`@ai-sdk/google`), hardened to mirror `/api/ask`.
- `/api/recommendations` — book recommendations.
- `lib/gemini-embeddings.ts` — shared embedding helper.

### Search (the `/search` page is not `/api/search`)

The public search page calls **`/api/search/native`**, not the Gemini `/api/search` route above. Native search is the one to change for ranking/coverage work:

- **Coverage + ranking**: one query fans out across books, theses, publications, physical catalog, posts, and extracted PDF page text, then scores server-side so the client receives an already-ordered list. Signal weights (exact title → author/subject → keywords → abstract/body → page text, plus small views/downloads/ratings boosts) are documented in `docs/search-ranking.md`.
- **"Found inside" page hits** come from the `book_pages` table (migration `0066`), filled by `lib/pdf-page-index.ts` — admin save actions index new uploads in the background via `after()`; `scripts/extract-pdf-text.ts` is the backfill. Scanned/image-only pages are skipped rather than indexed as garbage.
- **Facets** (`lib/search/facets.ts`) are pure and shared by the route and the sidebar: filtering happens in memory over the candidate pool already fetched, so live per-value counts cost no extra queries. Wire format is comma-separated values in the existing param names (`?subject=Math,Science&lang=km`), which keeps old single-value links working.
- **Fuzzy fallback fires only on zero results** — the `search_library_fuzzy` RPC (`0059`, extended to publications + learning paths in `0110`). Adding a resource type means adding it to both the RPC and the route's `FUZZY_URL` map, or its rows are fetched and then dropped.
- **Query analytics are anonymised by construction** (`lib/search/analytics.ts`): bot filtering, plus a daily-rotated HMAC of ip+ua so a visitor's queries group within a day and cannot be correlated across days. No raw IP or durable identifier is stored. `/api/search/click` logs result clicks; `/api/search/popular` serves the suggestions.

### Machine Interfaces & Scheduled Jobs

- **OAI-PMH** (`/api/oai`, `lib/oai/`) exposes published, publicly-licensed items to harvesters (BASE, CORE, OpenAIRE). Read-only and anonymous; the license filter lives in `lib/oai/records.ts`. Lists paginate with a **stateless** base64url `resumptionToken` over a deterministic ordering, so no token table is needed across serverless instances. Split like the SEO helpers: pure XML builders (`lib/oai/xml.ts`, unit-tested) vs server-only fetch (`lib/oai/records.ts`). Registration notes: `docs/oai-pmh-registration.md`.
- **Cron routes** under `app/api/cron/` are `Bearer $CRON_SECRET`-authenticated: `publish-scheduled` flips posts/theses/books from `scheduled` → `published` once `scheduled_at` passes (DB triggers `0073`/`0075`/`0086` then cascade `is_published`/`published_at`) and runs the Announcement Center sweep (`0100`); `cleanup` does retention deletes.
- `/api/reader-events` ingests reader telemetry; `/api/admin/dashboard/*` backs the admin analytics surfaces.

### Data Layer

- `lib/books.ts` / `lib/book-utils.ts` — `mapRowToBook()` normalises any Supabase row (from either the `books_with_stats` view or an embedded select) into the `Book` type. It handles both data shapes transparently.
- `lib/catalog.ts`, `lib/theses.ts` — similar fetch/map utilities for catalog books and theses.
- **Collection counts**: `lib/collection-stats.ts` (`getCollectionStats()`) is the single source for public item counts. It reads one row from the `public_resource_statistics` view (migration `0103`), which is where the counting rule actually lives: digital resources = published books + theses + publications; the physical catalog and learning paths are separate figures, never folded in. Cached under the `collection-stats` tag — every content mutation helper in `lib/cache/revalidate.ts` must revalidate it. Listing pages show the filtered count next to the global one via `lib/listing-count.ts`. No page may run its own count query; `lib/resource-stats-consistency.test.ts` enforces that. Full picture: `docs/RESOURCE-STATISTICS.md`.
- **Naming caveat**: "theses" were previously called "research reports". The UI, routes (`/theses`), and files use *theses*, but the DB table is still `research_reports`, the permissions resource is `research`, and the upload folder is `research/`.
- `app/actions/` — all Server Actions, domain-scoped per file (books, theses, reviews, reading-lists, reading-progress, book-notes, book-annotations, book-requests, subscriptions, notifications, post-comments, upload, export, audit, etc.).
- **Learning paths have two published flags, on purpose** (`0111`): the curriculum rework gave `learning_paths` a real `status` lifecycle (`draft → published → scheduled → archived`) but **kept `is_published`, mirrored from `status` by a trigger**, so every pre-existing read (`getPublishedPaths`, the RLS policies on modules/steps, `ThisWeekAtPtec`, search) kept working untouched. New code reads `status`; never write `is_published` directly, and don't "clean up" the mirror without rewriting the RLS policies that predicate on it.
- **Per-resource SEO overrides** are now at parity across types: posts (`0073`), theses (`0076`), learning paths (`0111`), and books/publications/catalog (`0112`) each carry nullable SEO title/description/OG-image columns. The builders (`lib/seo/book-seo.ts`, `lib/seo/publication-seo.ts`, …) fall back to auto-generated values whenever an override is null/blank — a new resource type should follow that shape rather than inventing a second mechanism.
- **Canonical resource model** (additive, migrations `0104`–`0109`): shared, normalized tables that unify concepts previously modelled per-type — `contributors`/`resource_contributors` (authors across all types), `storage_objects`/`resource_files` (files with checksum/scan/visibility), `subjects`/`resource_subjects`/`resource_keywords`, `resource_references`/`resource_relations`, all `organization_id`-scoped (`organizations`, default PTEC). Link tables are polymorphic `(resource_type, resource_id)` like `learning_path_steps`. **Legacy tables/columns (`authors`, `book_files`, `publication_files`, `author_names`, etc.) remain the app read source** — read the canonical model via `lib/resources/*` (`getResourceContributors`, `getResourceFiles`) and reconcile backfills via `lib/admin/canonical-backfill.ts` (`canonical_backfill_health`, `0109`). Full picture + removal plan: `docs/CANONICAL-RESOURCES.md`. This is NOT a `resources` supertable — that was deliberately rejected at current scale.

### Internationalisation (i18n)

- Built with `next-intl` v4, using **locale-prefixed routing** (`localePrefix: "as-needed"`, `i18n/routing.ts`): English is unprefixed (`/theses/foo`), Khmer lives under `/km` (`/km/theses/foo`). Only `app/(public)` participates — `app/(admin)` and `app/(auth)` are deliberately **not** locale-routed and stay exactly as before (unprefixed, cookie-driven).
- All `(public)` routes live under `app/[locale]/(public)/`. `middleware.ts` resolves the locale from the URL for non-admin/auth/api requests: it strips/validates a `/km` prefix, redirects `/en*` → unprefixed (no duplicate default-locale URLs), and for English invisibly rewrites the request to `/en/...` internally (via `NextResponse.rewrite`) so the file router matches — the browser URL and `usePathname()` stay clean. It also sets an `x-locale` request header (consumed by `lib/analytics/events.ts` — locale resolution for rendering does NOT use it, see below).
- `i18n/request.ts` resolves the locale **without ever reading `headers()`** (one `headers()` call there would opt the entire public tree out of static rendering): explicit `locale` param → `requestLocale` (unreliable across this app's segment split — tried, never trusted) → `rootLocale()` from `next/root-params` (the mechanism that actually carries the locale on public pages) → `ptec_locale` cookie (reached only on `/admin` and `/auth`, which are dynamic anyway).
- **Message payload trimming**: root layouts load only their route group's namespaces via `pickMessages()` (`i18n/pick-messages.ts` — `PUBLIC_NAMESPACES`, `AUTH_NAMESPACES`, `ADMIN_NAMESPACES`...), guarded by `lib/i18n-namespaces.test.ts`. New translation namespaces must be added to the right list or components render raw keys.
- **Navigation**: `i18n/navigation.ts` exports locale-aware `Link`/`redirect`/`usePathname`/`useRouter`/`getPathname` (via `createNavigation`) — use these for any link/redirect targeting a route under `(public)`. Never use them for `/admin/*` or `/auth/*` targets (those are outside the locale scheme and would get an incorrect `/km` prefix); import plain `next/link`/`next/navigation` for those, even from within otherwise-localized files (several files intentionally mix both, e.g. a dashboard page's "admin" link).
- `components/ui/books/ClientNavWrapper.tsx` (`FilterLink`/`FilterSelect`/`SortSelect`/`RowsPerPageSelect`, used by `Pagination.tsx`) is shared with the admin panel and deliberately **not** locale-aware — it navigates via a plain `basePath` prop. Public listing pages must pass an explicit locale-prefixed `basePath` (e.g. `locale === "km" ? "/km/books" : "/books"`); admin call sites are untouched.
- `LanguageSwitcher.tsx` does real path-based switching (`router.replace(pathname + query, { locale })` from `i18n/navigation.ts`), not just a cookie write + refresh.
- `lib/seo/alternates.ts`'s `localeAlternates(path, locale)` builds reciprocal `canonical` + `hreflang` (`en`/`km`/`x-default`) — wired into every public `generateMetadata` and into `lib/seo/listing-metadata.ts`'s `buildListingMetadata()`. `app/sitemap.ts` emits one canonical (English) entry per URL with `alternates.languages` covering both locales, rather than doubling entries.
- Translation strings live in `messages/en.json` and `messages/km.json`.
- Khmer fonts (Hanuman, Suwannaphum, Angkor, KantumruyPro, NotoSerifKhmer) are loaded in `app/fonts.ts` and applied as CSS variables on `<html>`.

### PWA, Offline & Push

- **Launch surface** — `lib/pwa/launch.ts` owns three colours and they are not interchangeable: `PWA_SPLASH` (`#FAF8F2`, `--ptec-parchment`) is the splash *background*, shared by `manifest.background_color` and the startup screen; `PWA_SPLASH_DARK` is the same surface for dark readers (the startup screen switches on the `.dark` class `THEME_INIT_SCRIPT` sets before paint); `PWA_THEME_COLOR` (`#172554`) is the *status bar*, and must equal what `THEME_INIT_SCRIPT` sets for light or the status bar shifts a moment after launch. `PWA_INK` remains the plate colour for the maskable icons and iOS launch images. `lib/pwa/launch.test.ts` pins all of it.
- **iOS gets no generated splash.** Without an `apple-touch-startup-image` whose media query matches the device *exactly*, iPhone shows a blank screen for the whole cold launch. The set is generated by `scripts/generate-pwa-assets.mjs` (also the Android maskable icons — the source emblem spans 84.4% of its canvas and every launcher mask clipped its ring). `npm run pwa:assets` regenerates; `prebuild` verifies with `--check`.
- **`components/pwa/PTECBootScreen.tsx`** is server-rendered markup + one CSS rule, never a stateful component: it must be in the first painted frame, must vanish with no timer, and must be impossible to get stuck behind. `RootShell` renders it first in `<body>` and `<PTECShellReadyMarker/>` after `{children}`; `body:has([data-ptec-shell-ready])` hides it, gated by `@supports selector(body:has(*))`. Anything added to it is paid for at FCP, and **how** the emblem is delivered dominates: `fetchpriority="high"` preempts the render-blocking stylesheet (FCP 2.37 s) and a data URI costs double because React serialises the head into the RSC flight payload too (2.21 s, +21 KB gz). A plain `<img>` at default priority is fetched *after* the CSS and costs ~44 ms (1.98 s). Don't "optimise" it back into either.
- **`/~offline` must bypass the locale rewrite in `middleware.ts`** (it lives at `app/~offline/`, outside `[locale]`). Without the bypass it resolved to `/en/~offline` and 404'd, so the SW's document fallback served the browser's error page.
- **The offline shell is precached by hand.** `fallbacks` in `app/sw.ts` only *names* `/~offline`; nothing adds it to the manifest (it lives under `app/`, and `@serwist/next` only globs `public/`), so `app/sw.ts` appends it explicitly with a `manifestRevision()` hash. Equally load-bearing: the navigation rule must have **no plugin defining `handlerDidError`** — Serwist attaches its fallback plugin only to strategies without one, so adding `tolerateStorageFailure` there silently disabled offline fallback for every navigation. Both were verified broken offline and are pinned by `lib/sw-policy.test.ts`.
- **Anything added to `public/` is precached, and no plugin option can stop it.** `@serwist/next` passes public files as `additionalPrecacheEntries`, which `@serwist/build` appends *after* every user `manifestTransform` — so neither `exclude` nor a transform drops them (both verified as no-ops). The one hook that works is filtering `self.__SW_MANIFEST` inside `app/sw.ts`; the decisions live in `shouldPrecache()` in `lib/sw-policy.ts`. Adding a large folder to `public/` without a rule there silently adds it to every user's install.
- **Updates are opt-in.** `skipWaiting: false` — a new worker installs and waits rather than activating under pages still running the previous build (whose per-build route chunks the new deployment no longer serves). `components/pwa/UpdateAvailable.tsx` offers the handover, posts `SKIP_WAITING`, and reloads on `controllerchange`. Never set `skipWaiting: true` without removing that component, and never reload without user consent — readers are mid-PDF.
- **Every public route owns its `loading.tsx`.** There is deliberately no `(public)/loading.tsx` catch-all: it sat *above* each route's own boundary, so a route with a matching skeleton rendered the generic one first and then swapped. A new public route needs its own `loading.tsx` (re-export `GenericPageSkeleton` if nothing better fits) or it gets no streaming fallback at all.
- Service worker is configured in `app/sw.ts` using Serwist (built on Workbox). Disabled in development.
- Caches: page navigations (NetworkFirst, 5s timeout), book covers (CacheFirst, 30 days), Supabase GET responses (StaleWhileRevalidate, 1 day), PDF.js assets (CacheFirst), and book PDFs (CacheFirst, 90 days).
- Offline fallback page: `app/~offline/page.tsx`; downloaded books are listed at `/offline-books`.
- Web push notifications via `web-push`: subscribe/send routes in `app/api/push/`, helpers in `lib/push.ts` (subscriptions table from migration `0044`). Content subscriptions (notify on new books/posts) in `app/actions/subscriptions.ts`.

### Admin Panel

Located at `/admin`, all sections under `(protected)/`, each gated by the permission system. Key sections: **catalogs** (books CRUD with bulk CSV import and physical copy management), **theses**, **posts**, **publications**, **announcements**, **book-requests**, **users**, **roles**, **team**, **upload**, **manage** (categories/departments), and **logs** (audit trail written via `app/actions/audit.ts`).

### System Settings (global site configuration)

- `/admin/system-settings` manages organization names, contacts, address, opening hours, social/map links, and SEO defaults with a draft → publish → version-history/rollback workflow (tables `site_settings` + `site_setting_versions`, migration `0098`; service-role-only RLS). Full docs: `docs/SYSTEM-SETTINGS.md`.
- **Read config via `getSiteConfig()`** (`lib/system-settings/config.ts`, cached under the `site-config` tag) in server code; pass values to client components as props. `lib/ptec.ts` is now only the documented fallback + seed source — it is imported by `lib/system-settings/defaults.ts` and nothing else, and `lib/settings-consistency.test.ts` enforces that.
- **Synchronous builders take an explicit identity.** `lib/seo/*`, `lib/metadata-exports/works.ts`, `lib/theses/citation.ts` and `lib/email/contact-templates.ts` can't await the config, so they accept an `OrgIdentity` (`lib/system-settings/org-identity.ts`) resolved with `await getOrgIdentity()` by the calling server component. The old `PTEC_NAME`/`PTEC_LIBRARY_NAME` constants in `lib/seo/site.ts` are gone: they were a second source of truth that publishing never reached. A page that calls one of these builders without resolving `getOrgIdentity()` fails `lib/settings-consistency.test.ts`.
- Publishing calls `revalidateSiteConfig()` (tag + both locale layout trees). Saving a draft never touches the public cache.
- Permission resource: `settings` (admin/super_admin write). Every settings server action re-checks `requirePermission("settings", "write")`.

### Key Design Patterns

- **Theme**: Dark/light toggled via `ptec.theme` in localStorage. Admin panel forces light mode (`AdminThemeEnforcer`). Theme applied before paint via inline script to avoid FOUC.
- **Focus system**: one indicator per component, built from `--focus-*` tokens in `app/globals.css`. The `:focus-visible` fallback MUST stay in `@layer base` — unlayered it beats all of Tailwind v4's `@layer utilities`, which made every `outline-none` in the app inert and painted a second indicator on every control (that was the site-wide double blue border). `.focus-field` for a standalone control, `.focus-shell` on the wrapper of a grouped one (its state rules are deliberately unlayered so they beat `border-*`/`shadow-*` utilities on the same element). Keyboard vs pointer weight comes from `data-focus-modality`, set by `THEME_INIT_SCRIPT` in `lib/csp.ts`. Pinned by `lib/focus-system.test.ts` + `e2e/focus-system.spec.ts`. Full picture: `docs/ACCESSIBILITY-FOCUS.md`.
- **Rate limiting**: `lib/rate-limit.ts` is DB-backed (Supabase RPC `check_rate_limit`, sliding window); per-route policies + emergency env switches live in `lib/rate-limit-policy.ts`. Durable quotas (AI usage) also live in the DB.
- **`books_with_stats` view**: Used in listing queries to get `review_count` and `avg_rating` without N+1 queries. `mapRowToBook()` also handles the embedded-reviews shape for detail page queries.
- **Sanitization**: `lib/sanitize.ts` + `isomorphic-dompurify` for rendered markdown. When building PostgREST `.or(...)` filter strings from user input, strip filter metacharacters first (see `sanitizeSearchTerm` in `app/api/chat/route.ts`).
- **RLS rule for new tables**: every migration that creates a `public` table MUST enable RLS (+ policies) or `REVOKE ALL … FROM public, anon, authenticated` in the same file — PostgREST exposes all public-schema tables by default. Policy matrix + behavioral probes: `docs/RLS-MATRIX.md`, `lib/rls.test.ts` (`RLS_PROBE=1`).
- **Caching / revalidation**: public pages are prerendered/ISR; because English is internally rewritten to `/en/...`, **`revalidatePath("/books")` is a silent no-op** — revalidate `/en/books` and `/km/books` (or the relevant cache tag) instead.
- **Security headers / CSP**: static headers in `next.config.ts`, the split CSP (see Middleware) in `middleware.ts` — never add a second CSP in `next.config.ts`. Staged tightening plan: `docs/SECURITY-HEADERS.md`.
- **SEO / indexing policy**: indexing is opt-in per environment — `lib/seo/indexing.ts` (`isIndexableEnvironment()`: `VERCEL_ENV=production` or `SEO_INDEXING=on`; previews/CI/staging default noindex) ANDed with the admin switch in System Settings → SEO. Three layers (next.config build header, middleware runtime header, metadata robots); robots.txt/sitemap are env-gated and settings-gated. Base URLs go through `lib/seo/site.ts` (`SITE_URL`/`absoluteUrl()`) — never read `NEXT_PUBLIC_SITE_URL` directly. Publish gates live in `lib/publish-readiness.ts` (shared by theses actions + review queue). Full picture: `docs/SEO-ARCHITECTURE.md`.
- **Feature flags are server-only and fail safe**: `lib/admin/analytics-flags.ts` (`resolveEngagementChartVersion()`, env `ADMIN_ENGAGEMENT_CHART_V2=on|off`) is the pattern to copy — production stays on the preserved legacy path unless explicitly enabled, development gets the new one, and an unrecognised value falls back to legacy. Both paths ship from the same props so the flag never becomes a data fork. The admin dashboard's analytics units live under `components/admin/dashboard/analytics/` (chart-math / chart-state / chart-tokens split out so they're testable without rendering the SVG).
- **Design-system sync**: `.design-sync/config.json` maps a curated set of pure-React primitives (`components/ui/core/*`, skeletons, `BookCover`, `Avatar`, `RatingStars`) to an external design tool via a `componentSrcMap`. Committed: the config, `.design-sync/previews/*`, `.design-sync/fonts.css`, and the `.ds-sync/` converter scripts. Generated and gitignored: `ds-entry.ts` (the export barrel), `ds-bundle/`, and `.design-sync/compiled-globals.css`. Adding a primitive to the barrel means adding it to `componentSrcMap` too, and only components that bundle without server-only imports belong there.
- **Deployment**: Vercel is primary, but the app also ships as a self-hosted Docker image (`Dockerfile` multi-stage → `.next/standalone`, non-root, `docker-compose.yml`, published by `.github/workflows/docker-publish.yml`) for ZimaOS behind a Cloudflare tunnel — see `docs/ZIMAOS-DEPLOYMENT.md`. `NEXT_PUBLIC_*` values are baked at build time, so the image takes them as build args.
- **Deployment region**: `vercel.json` pins functions to `sin1` next to the Supabase instance (Singapore) — removing it moves functions to `iad1` and wrecks TTFB. Hero images under `public/hero/` are served immutable — rename the file when changing one.
- **Monitoring**: `/api/health` (DB + storage probes) for uptime monitors; alerts + incident runbooks in `docs/MONITORING.md`; `x-request-id` correlation is set by middleware on every request.

## Invariant Tests (they read your source, not just your functions)

A dozen unit tests enforce architecture rules by scanning files. When one fails, the fix is almost always in the code it scanned — not in the test:

| Test | Rule it enforces |
|---|---|
| `lib/cache/cache-safety.test.ts` | no `cookies()`/`headers()` in the public tree (it would kill prerendering) |
| `lib/resource-stats-consistency.test.ts` | no page runs its own count query — all counts come from `getCollectionStats()` |
| `lib/settings-consistency.test.ts` | `lib/ptec.ts` has exactly one importer; sync builders resolve `getOrgIdentity()` |
| `lib/i18n-namespaces.test.ts` | every namespace in `messages/*.json` is in the right `pickMessages()` list |
| `lib/focus-system.test.ts` | focus rules stay in the layers they must (see Focus system above) |
| `lib/status-tokens.test.ts` | callouts use `--ptec-{success,warning,danger,info}-*` rather than hand-written colour triplets |
| `lib/sw-policy.test.ts` | offline fallback + `shouldPrecache()` decisions |
| `lib/csp.test.ts` | the split CSP and `THEME_INIT_SCRIPT` stay consistent |
| `lib/resource-slug-gate.test.ts` | every public detail route is slug-gated (unknown slug → real 404, not a streamed 200) |
| `components/admin/dashboard/markup-nesting.test.ts` | no block-level tag (e.g. `InfoTip`'s `<details>`) inside a `<p>`, and no nested interactive elements — the parser re-parents that markup, so the DOM stops matching the server render and hydration fails. Invisible to jsdom and to a production build, which is why it's a source scan |
| `lib/about/nav.test.ts` | About nav/pager entries exist in both message files |
| `lib/pwa/launch.test.ts` | the three PWA launch colours and the generated asset set |
| `lib/rls.test.ts` | behavioural RLS probes (opt-in: `RLS_PROBE=1`) |

## Environment Variables

`instrumentation.ts` checks these at server startup and logs one warning per missing group — warn-only by design, so a missing optional group never takes the site down.

Required variables (see `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ZIMA_API_URL`, `ZIMA_API_KEY` (primary file storage)
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `NEXT_PUBLIC_R2_PUBLIC_URL`, `R2_PUBLIC_BUCKET_NAME`, `NEXT_PUBLIC_R2_COVERS_URL` (legacy R2)
- `GEMINI_API_KEY` (server-side only — never `NEXT_PUBLIC_`)
- `VIRUSTOTAL_API_KEY` (optional — hash-reputation malware check on admin uploads, `lib/virus-scan.ts`; fails open if unset)
- `BLOB_READ_WRITE_TOKEN` (Vercel Blob — user avatars)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (Cloudflare Turnstile CAPTCHA)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (contact-form delivery)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (web push)
- `CRON_SECRET` (Bearer token for `/api/cron/*`)
- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`
- `SMTP_USER`, `SMTP_PASS` (Gmail App Password for Supabase auth emails)
- `ADMIN_ENGAGEMENT_CHART_V2` (optional rollout flag, `on`/`off`; default legacy in production)
- `SEO_INDEXING=on` (opt into indexable behaviour outside Vercel production — used by the e2e suite)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
