# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PTEC e-Library is a free public digital library for Phnom Penh Teacher Education College (PTEC). It is a Next.js 16 App Router application with Supabase (Postgres + Auth), Cloudflare R2 (file storage), and full bilingual support (English/Khmer).

## Commands

```bash
npm run dev          # Start development server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm test             # Vitest unit tests
npm run test:e2e     # Playwright end-to-end tests
npx vitest run lib/books.test.ts   # Run a single test file
```

Database migrations are in `supabase/migrations/` and must be applied sequentially. For local Supabase: `supabase start`.

## Architecture

### Route Groups

The app uses three Next.js route groups:
- `app/(public)/` — public-facing pages (home, books, catalogs, posts, research, dashboard, offline)
- `app/(auth)/` — authentication flows (login, signup, forgot/reset password)
- `app/(admin)/admin/` — admin panel, protected by role check in its layout

The root `app/layout.tsx` injects an inline theme-init script (FOUC prevention) and wraps everything in `IntlProvider`.

### Auth & Authorization

- `lib/supabase/server.ts` exports two clients:
  - `createClient()` — ANON key + session cookies, for reading public data and verifying the current user
  - `createServiceClient()` — SERVICE_ROLE key, bypasses RLS; **server-only, never import client-side**
- `lib/auth-guards.ts` exports `requireUser()` and `requireAdmin()` — call these at the top of any Server Action that needs auth
- Admin route protection is enforced in `app/(admin)/admin/(protected)/layout.tsx`, which redirects to `/admin/login` if the user's `profiles.role` is not `"admin"`

### File Storage (Cloudflare R2)

Two R2 buckets are in use:
- **Private PDF bucket** (`R2_BUCKET_NAME`) — book PDFs, never publicly accessible. Downloads go through `/api/books/[slug]/download/route.ts`, which issues a 5-minute presigned GET URL and logs the download.
- **Public covers bucket** (`R2_PUBLIC_BUCKET_NAME`) — book cover images, served via CDN (`NEXT_PUBLIC_R2_COVERS_URL`).

Presigned PUT URLs for uploads are generated in `app/actions/upload.ts` via `getPresignedUrl()`. Uploads are restricted to admins and to paths under `books/`, `posts/`, `research/`, or `reports/`.

### Data Layer

- `lib/books.ts` / `lib/book-utils.ts` — `mapRowToBook()` normalises any Supabase row (from either the `books_with_stats` view or an embedded select) into the `Book` type. It handles both data shapes transparently.
- `lib/catalog.ts`, `lib/research-reports.ts` — similar fetch/map utilities for catalog books and research reports.
- `app/actions/` — all Server Actions. Each file is domain-scoped (auth, download, profile, reviews, saved-books, tags, upload, view-count, etc.).

### Internationalisation (i18n)

- Built with `next-intl` v4. Locale (`en` or `km`) is stored in the `ptec_locale` cookie and resolved in `i18n/request.ts`.
- Translation strings live in `messages/en.json` and `messages/km.json`.
- Khmer fonts (Hanuman, Suwannaphum, Angkor, KantumruyPro, NotoSerifKhmer) are loaded in `app/fonts.ts` and applied as CSS variables on `<html>`.

### PWA & Offline

- Service worker is configured in `app/sw.ts` using Serwist (built on Workbox).
- Caches: page navigations (NetworkFirst, 5s timeout), book covers (CacheFirst, 30 days), Supabase GET responses (StaleWhileRevalidate, 1 day), PDF.js assets (CacheFirst), and book PDFs (CacheFirst, 90 days).
- The SW is disabled in development (`NODE_ENV === "development"`).
- Offline fallback page: `app/~offline/page.tsx`.

### Admin Panel

Located at `/admin`. The sidebar and layout enforce `role === "admin"`. Key sections:
- **Books** (`/admin/catalogs`) — CRUD with bulk CSV import and physical copy management
- **Research Reports** (`/admin/research-reports`) — CRUD with program/cohort/subject/keyword metadata
- **Posts** (`/admin/posts`) — markdown-based blog/news posts
- **Users** (`/admin/users`) — user management
- **Upload** (`/admin/upload`) — direct R2 file upload via presigned URLs
- **Manage** (`/admin/manage`) — categories and departments

### Key Design Patterns

- **Theme**: Dark/light toggled via `ptec.theme` in localStorage. Admin panel forces light mode (`AdminThemeEnforcer`). Theme applied before paint via inline script to avoid FOUC.
- **Rate limiting**: `lib/rate-limit.ts` is in-memory (sliding window). Note: state resets on serverless cold starts; use Upstash/Vercel KV for distributed limiting in production.
- **R2 key validation**: `validateR2Key()` in `upload.ts` prevents path traversal and enforces allowed prefixes.
- **`books_with_stats` view**: Used in listing queries to get `review_count` and `avg_rating` without N+1 queries. `mapRowToBook()` also handles the embedded-reviews shape for detail page queries.

## Environment Variables

Required variables (see `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `NEXT_PUBLIC_R2_PUBLIC_URL`
- `R2_PUBLIC_BUCKET_NAME`, `NEXT_PUBLIC_R2_COVERS_URL` (public covers bucket)
- `BLOB_READ_WRITE_TOKEN` (Vercel Blob — user avatars)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Cloudflare Turnstile CAPTCHA)
- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`
- `SMTP_USER`, `SMTP_PASS` (Gmail App Password for Supabase auth emails)
