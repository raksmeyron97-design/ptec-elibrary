# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PTEC e-Library is a free public digital library for Phnom Penh Teacher Education College (PTEC). It is a Next.js 16 App Router application with Supabase (Postgres + Auth), Zima Storage (file storage, with legacy Cloudflare R2 fallback), Gemini-powered AI search/assistant, and full bilingual support (English/Khmer).

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build (next build --webpack — NEVER switch to Turbopack: it silently skips building app/sw.ts, killing the PWA)
npm run lint         # ESLint
npm test             # Vitest unit tests (watch mode)
npx vitest run lib/books.test.ts   # Run a single test file
npm run test:e2e     # Playwright end-to-end tests
npm run doctor       # react-doctor diagnostics
npx tsx scripts/embed-library.ts   # Backfill pgvector embeddings for AI search
```

`postinstall` copies PDF.js assets via `scripts/copy-pdf-assets.mjs`.

Database migrations are in `supabase/migrations/` and are applied to the hosted DB by CI (`.github/workflows/migrate.yml`: dry-run on PRs, apply on merge to main — see `supabase/MIGRATIONS.md`). Never apply by hand in the dashboard SQL editor. For local Supabase: `supabase start`. The `e2e` CI job boots a fresh local stack, so every migration must apply cleanly from the squashed baseline; `node scripts/migrations/check-schema-drift.mjs` diffs hosted columns against the chain.

## Architecture

### Route Groups

- `app/[locale]/(public)/` — public pages (home, books, catalogs, theses, publications, posts, search, lists, dashboard, offline-books), locale-prefixed (English unprefixed, Khmer under `/km`; see Internationalisation below). The homepage IS the locale root: `app/[locale]/(public)/(home)/page.tsx` serves `/` and `/km` (the pathless `(home)` group keeps home-specific loading/error boundaries); legacy `/home` (`/km/home`) 308-redirects to `/` (`/km`) in middleware.
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

### Data Layer

- `lib/books.ts` / `lib/book-utils.ts` — `mapRowToBook()` normalises any Supabase row (from either the `books_with_stats` view or an embedded select) into the `Book` type. It handles both data shapes transparently.
- `lib/catalog.ts`, `lib/theses.ts` — similar fetch/map utilities for catalog books and theses.
- **Collection counts**: `lib/collection-stats.ts` (`getCollectionStats()`) is the single source for public item counts. It reads one row from the `public_resource_statistics` view (migration `0103`), which is where the counting rule actually lives: digital resources = published books + theses + publications; the physical catalog and learning paths are separate figures, never folded in. Cached under the `collection-stats` tag — every content mutation helper in `lib/cache/revalidate.ts` must revalidate it. Listing pages show the filtered count next to the global one via `lib/listing-count.ts`. No page may run its own count query; `lib/resource-stats-consistency.test.ts` enforces that. Full picture: `docs/RESOURCE-STATISTICS.md`.
- **Naming caveat**: "theses" were previously called "research reports". The UI, routes (`/theses`), and files use *theses*, but the DB table is still `research_reports`, the permissions resource is `research`, and the upload folder is `research/`.
- `app/actions/` — all Server Actions, domain-scoped per file (books, theses, reviews, reading-lists, reading-progress, book-notes, book-annotations, book-requests, subscriptions, notifications, post-comments, upload, export, audit, etc.).
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

- Service worker is configured in `app/sw.ts` using Serwist (built on Workbox). Disabled in development.
- Caches: page navigations (NetworkFirst, 5s timeout), book covers (CacheFirst, 30 days), Supabase GET responses (StaleWhileRevalidate, 1 day), PDF.js assets (CacheFirst), and book PDFs (CacheFirst, 90 days).
- Offline fallback page: `app/~offline/page.tsx`; downloaded books are listed at `/offline-books`.
- Web push notifications via `web-push`: subscribe/send routes in `app/api/push/`, helpers in `lib/push.ts` (subscriptions table from migration `0044`). Content subscriptions (notify on new books/posts) in `app/actions/subscriptions.ts`.

### Admin Panel

Located at `/admin`, all sections under `(protected)/`, each gated by the permission system. Key sections: **catalogs** (books CRUD with bulk CSV import and physical copy management), **theses**, **posts**, **publications**, **announcements**, **book-requests**, **users**, **roles**, **team**, **upload**, **manage** (categories/departments), and **logs** (audit trail written via `app/actions/audit.ts`).

### System Settings (global site configuration)

- `/admin/system-settings` manages organization names, contacts, address, opening hours, social/map links, and SEO defaults with a draft → publish → version-history/rollback workflow (tables `site_settings` + `site_setting_versions`, migration `0098`; service-role-only RLS). Full docs: `docs/SYSTEM-SETTINGS.md`.
- **Read config via `getSiteConfig()`** (`lib/system-settings/config.ts`, cached under the `site-config` tag) in server code; pass values to client components as props. `lib/ptec.ts` is now only the documented fallback + seed source — it is imported by `lib/system-settings/defaults.ts` and nothing else, and `lib/settings-consistency.test.ts` enforces that.
- **Synchronous builders take an explicit identity.** `lib/seo/*`, `lib/exports/works.ts`, `lib/theses/citation.ts` and `lib/email/contact-templates.ts` can't await the config, so they accept an `OrgIdentity` (`lib/system-settings/org-identity.ts`) resolved with `await getOrgIdentity()` by the calling server component. The old `PTEC_NAME`/`PTEC_LIBRARY_NAME` constants in `lib/seo/site.ts` are gone: they were a second source of truth that publishing never reached. A page that calls one of these builders without resolving `getOrgIdentity()` fails `lib/settings-consistency.test.ts`.
- Publishing calls `revalidateSiteConfig()` (tag + both locale layout trees). Saving a draft never touches the public cache.
- Permission resource: `settings` (admin/super_admin write). Every settings server action re-checks `requirePermission("settings", "write")`.

### Key Design Patterns

- **Theme**: Dark/light toggled via `ptec.theme` in localStorage. Admin panel forces light mode (`AdminThemeEnforcer`). Theme applied before paint via inline script to avoid FOUC.
- **Rate limiting**: `lib/rate-limit.ts` is DB-backed (Supabase RPC `check_rate_limit`, sliding window); per-route policies + emergency env switches live in `lib/rate-limit-policy.ts`. Durable quotas (AI usage) also live in the DB.
- **`books_with_stats` view**: Used in listing queries to get `review_count` and `avg_rating` without N+1 queries. `mapRowToBook()` also handles the embedded-reviews shape for detail page queries.
- **Sanitization**: `lib/sanitize.ts` + `isomorphic-dompurify` for rendered markdown. When building PostgREST `.or(...)` filter strings from user input, strip filter metacharacters first (see `sanitizeSearchTerm` in `app/api/chat/route.ts`).
- **RLS rule for new tables**: every migration that creates a `public` table MUST enable RLS (+ policies) or `REVOKE ALL … FROM public, anon, authenticated` in the same file — PostgREST exposes all public-schema tables by default. Policy matrix + behavioral probes: `docs/RLS-MATRIX.md`, `lib/rls.test.ts` (`RLS_PROBE=1`).
- **Caching / revalidation**: public pages are prerendered/ISR; because English is internally rewritten to `/en/...`, **`revalidatePath("/books")` is a silent no-op** — revalidate `/en/books` and `/km/books` (or the relevant cache tag) instead.
- **Security headers / CSP**: static headers in `next.config.ts`, the split CSP (see Middleware) in `middleware.ts` — never add a second CSP in `next.config.ts`. Staged tightening plan: `docs/SECURITY-HEADERS.md`.
- **SEO / indexing policy**: indexing is opt-in per environment — `lib/seo/indexing.ts` (`isIndexableEnvironment()`: `VERCEL_ENV=production` or `SEO_INDEXING=on`; previews/CI/staging default noindex) ANDed with the admin switch in System Settings → SEO. Three layers (next.config build header, middleware runtime header, metadata robots); robots.txt/sitemap are env-gated and settings-gated. Base URLs go through `lib/seo/site.ts` (`SITE_URL`/`absoluteUrl()`) — never read `NEXT_PUBLIC_SITE_URL` directly. Publish gates live in `lib/publish-readiness.ts` (shared by theses actions + review queue). Full picture: `docs/SEO-ARCHITECTURE.md`.
- **Deployment region**: `vercel.json` pins functions to `sin1` next to the Supabase instance (Singapore) — removing it moves functions to `iad1` and wrecks TTFB. Hero images under `public/hero/` are served immutable — rename the file when changing one.
- **Monitoring**: `/api/health` (DB + storage probes) for uptime monitors; alerts + incident runbooks in `docs/MONITORING.md`; `x-request-id` correlation is set by middleware on every request.

## Environment Variables

Required variables (see `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ZIMA_API_URL`, `ZIMA_API_KEY` (primary file storage)
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `NEXT_PUBLIC_R2_PUBLIC_URL`, `R2_PUBLIC_BUCKET_NAME`, `NEXT_PUBLIC_R2_COVERS_URL` (legacy R2)
- `GEMINI_API_KEY` (server-side only — never `NEXT_PUBLIC_`)
- `VIRUSTOTAL_API_KEY` (optional — hash-reputation malware check on admin uploads, `lib/virus-scan.ts`; fails open if unset)
- `BLOB_READ_WRITE_TOKEN` (Vercel Blob — user avatars)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Cloudflare Turnstile CAPTCHA)
- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`
- `SMTP_USER`, `SMTP_PASS` (Gmail App Password for Supabase auth emails)
