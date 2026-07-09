# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PTEC e-Library is a free public digital library for Phnom Penh Teacher Education College (PTEC). It is a Next.js 16 App Router application with Supabase (Postgres + Auth), Zima Storage (file storage, with legacy Cloudflare R2 fallback), Gemini-powered AI search/assistant, and full bilingual support (English/Khmer).

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint
npm test             # Vitest unit tests (watch mode)
npx vitest run lib/books.test.ts   # Run a single test file
npm run test:e2e     # Playwright end-to-end tests
npm run doctor       # react-doctor diagnostics
npx tsx scripts/embed-library.ts   # Backfill pgvector embeddings for AI search
```

`postinstall` copies PDF.js assets via `scripts/copy-pdf-assets.mjs`.

Database migrations are in `supabase/migrations/` and must be applied sequentially. For local Supabase: `supabase start`.

## Architecture

### Route Groups

- `app/(public)/` — public pages (home, books, catalogs, theses, publications, posts, search, lists, dashboard, offline-books). Root `/` redirects to `/home` in middleware.
- `app/(auth)/` — authentication flows (login, signup, forgot/reset password)
- `app/(admin)/admin/` — admin panel: `login`, `mfa` (enroll/verify), and `(protected)/` which holds all admin sections

The root `app/layout.tsx` injects an inline theme-init script (FOUC prevention) and wraps everything in `IntlProvider`.

### Middleware (`middleware.ts`)

Builds a per-request CSP with a nonce (propagated via the `x-nonce` header), redirects `/` → `/home`, and only calls Supabase `getUser()` for routes that actually need auth (`/dashboard`, `/profile`, auth pages) — public pages take a fast path with no network call.

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
- **Naming caveat**: "theses" were previously called "research reports". The UI, routes (`/theses`), and files use *theses*, but the DB table is still `research_reports`, the permissions resource is `research`, and the upload folder is `research/`.
- `app/actions/` — all Server Actions, domain-scoped per file (books, theses, reviews, reading-lists, reading-progress, book-notes, book-annotations, book-requests, subscriptions, notifications, post-comments, upload, export, audit, etc.).

### Internationalisation (i18n)

- Built with `next-intl` v4. Locale (`en` or `km`) is stored in the `ptec_locale` cookie and resolved in `i18n/request.ts`.
- Translation strings live in `messages/en.json` and `messages/km.json`.
- Khmer fonts (Hanuman, Suwannaphum, Angkor, KantumruyPro, NotoSerifKhmer) are loaded in `app/fonts.ts` and applied as CSS variables on `<html>`.

### PWA, Offline & Push

- Service worker is configured in `app/sw.ts` using Serwist (built on Workbox). Disabled in development.
- Caches: page navigations (NetworkFirst, 5s timeout), book covers (CacheFirst, 30 days), Supabase GET responses (StaleWhileRevalidate, 1 day), PDF.js assets (CacheFirst), and book PDFs (CacheFirst, 90 days).
- Offline fallback page: `app/~offline/page.tsx`; downloaded books are listed at `/offline-books`.
- Web push notifications via `web-push`: subscribe/send routes in `app/api/push/`, helpers in `lib/push.ts` (subscriptions table from migration `0044`). Content subscriptions (notify on new books/posts) in `app/actions/subscriptions.ts`.

### Admin Panel

Located at `/admin`, all sections under `(protected)/`, each gated by the permission system. Key sections: **catalogs** (books CRUD with bulk CSV import and physical copy management), **theses**, **posts**, **publications**, **announcements**, **book-requests**, **users**, **roles**, **team**, **upload**, **manage** (categories/departments), and **logs** (audit trail written via `app/actions/audit.ts`).

### Key Design Patterns

- **Theme**: Dark/light toggled via `ptec.theme` in localStorage. Admin panel forces light mode (`AdminThemeEnforcer`). Theme applied before paint via inline script to avoid FOUC.
- **Rate limiting**: `lib/rate-limit.ts` is in-memory (sliding window) — state resets on serverless cold starts. Durable quotas (AI usage) live in the DB instead.
- **`books_with_stats` view**: Used in listing queries to get `review_count` and `avg_rating` without N+1 queries. `mapRowToBook()` also handles the embedded-reviews shape for detail page queries.
- **Sanitization**: `lib/sanitize.ts` + `isomorphic-dompurify` for rendered markdown. When building PostgREST `.or(...)` filter strings from user input, strip filter metacharacters first (see `sanitizeSearchTerm` in `app/api/chat/route.ts`).

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
