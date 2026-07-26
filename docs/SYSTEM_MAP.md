# System Map

_Generated 2026-07-26 as Phase 0 of the audit run on `improve/audit-20260726`. This is a
navigation index into the codebase's own (already extensive) architecture docs, plus a
route/auth/RLS inventory built specifically for this audit. Where a canonical doc already
exists it is cited rather than duplicated — `CLAUDE.md`, `docs/RLS-MATRIX.md`,
`docs/SECURITY-HEADERS.md`, and `docs/RESOURCE-STATISTICS.md` are the sources of truth and
were spot-checked against the current code, not assumed current._

## 1. Routes and auth requirements

### Public (no auth), `app/[locale]/(public)/`
home, books, books/[slug], catalogs, theses, theses/[slug], publications, publications/[slug],
posts, posts/[slug], search, paths, paths/[slug], about, about/timings, contact, privacy,
policy. Locale-prefixed per `i18n/routing.ts` (English unprefixed, Khmer `/km`). Auth-gated
sub-areas under the same tree: `dashboard/*`, `profile/*`, `lists/*`, `offline-books` —
middleware only calls `supabase.auth.getUser()` for these paths (`middleware.ts`), everything
else is a fast, cookie-free path so it stays prerenderable.

### Auth flows, `app/(auth)/`
`login`, `signup`, `forgot-password`, `reset-password`, `auth/callback` (OAuth + email-link
landing). Not locale-routed. `auth/callback/route.ts` resolves the post-login redirect via
`safeCallbackUrl()` — same-origin-only, rejects `//`, backslash-prefixed, and anything not
starting with `/` (verified in code, see AUDIT.md #4).

### Admin, `app/(admin)/admin/`
`login`, `mfa/{enroll,verify}` outside `(protected)/`; everything else — `catalogs`, `theses`,
`posts`, `publications`, `announcements`, `book-requests`, `users`, `roles`, `team`, `upload`,
`manage`, `logs`, `system-settings`, `dashboard`, `storage` — under `(protected)/layout.tsx`,
which redirects non-`ADMIN_PANEL_ROLES` to `/admin/login` and enforces MFA/AAL2 for everyone
else (`lib/auth/requireAdmin.ts`).

### API routes, `app/api/` (41 route files)
Every handler was grep'd for a guard call or an explicit public-data filter. Notable groups:

| Group | Routes | Guard |
|---|---|---|
| File/download | `books/[slug]/file`, `books/[slug]/download`, `theses/[id]/file`, `theses/[id]/download`, `publications/[slug]/file` | `.eq("is_published", true)` server-side filter (service client bypasses RLS but the query itself is scoped); `download` variants additionally require a signed-in user; all rate-limited via `lib/rate-limit.ts` + `lib/rate-limit-policy.ts` |
| Citation | `books/[slug]/cite`, `theses/[id]/cite`, `publications/[slug]/cite` | public, published-only |
| AI | `search`, `search/native`, `search/popular`, `search/click`, `books/suggestions`, `ask`, `chat`, `recommendations` | per-IP or per-user rate limits (`ratePolicy("search"|"searchNative"|...)`), `/ask` and `/chat` additionally auth-gated |
| Admin-only | `admin/*` (dashboard, upload, bulk-upload, backfill-embeddings, users/export, dashboard/export, storage) | `requirePermission`/`requireAdmin`/`requireLibrarian` per file |
| Ops/cron | `cron/cleanup`, `cron/publish-scheduled` | `CRON_SECRET` header check, not user auth |
| Misc | `contact`, `push/*`, `reader-events`, `me`, `me/continue-reading`, `health`, `csp-report`, `oai`, `departments/trending`, `export/[type]` | contact + push are rate-limited; `me*` require a session; `health`/`oai`/`csp-report` are intentionally public |

Full list is reproducible with `find app/api -name route.ts`.

## 2. Supabase tables & RLS

Canonical, current matrix: **`docs/RLS-MATRIX.md`** (last audited 2026-07-11, includes a
verbatim allow/deny table per table, the `is_staff/is_librarian/is_admin/is_super_admin_role()`
helper hierarchy, and the behavioral probe suite `lib/rls.test.ts`). Spot-checked during this
run — nothing in the matrix has drifted from `supabase/migrations/` (currently through `0112`).

Key structural guarantees (verbatim from that doc, re-verified):
- Every table falls into: public-read/admin-write, owner-scoped (`user_id = auth.uid()`), or
  service-role-only (RLS enabled, zero client policies).
- `profiles` UPDATE grant is column-restricted to `full_name, avatar_url` — no client path to
  self-elevate `role`, backed by a `tr_prevent_role_update` trigger.
- One known historical gap (`search_queries` missing RLS in the original migration) was fixed
  in migration `0084` — already applied per `supabase/MIGRATIONS.md`.

## 3. Service-role key usage

`createServiceClient()` (`lib/supabase/server.ts`) imports `server-only` and is never
imported by a client component (grep confirms zero `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`
occurrences). Every call site is inside a Server Action or Route Handler and is preceded by
either a `requirePermission`/`requireX` guard (admin mutations) or an explicit
`.eq("is_published", true)` / `.eq("is_active", true)` filter (public file/download/cite
routes) so the bypassed-RLS client still only returns public rows. See AUDIT.md #1 for the
specific evidence trail on the file routes.

## 4. Storage adapter (Zima / R2 / Vercel Blob)

- **Zima Storage** is primary (`lib/zima.ts`, `ZIMA_API_URL`/`ZIMA_API_KEY`). `zimaFetch()`
  proxies range requests server-side for both online reading and download.
- **Cloudflare R2** is the legacy fallback for bare-key records: `app/api/books/[slug]/file`,
  `.../download`, and the theses/publications equivalents all fall through to a 60s–300s
  presigned `GetObjectCommand` URL when `file_url` isn't a full Zima/Blob URL.
- **Vercel Blob** is used only for user avatars (`BLOB_READ_WRITE_TOKEN`).
- Legacy covers still served from `*.r2.dev` (see AUDIT.md #3 / the migration plan doc).
- Upload path: `uploadToZima()` Server Action (`app/actions/upload.ts`), permission-gated,
  folder-restricted, sharp-optimized before upload.

## 5. Gemini call sites

`GEMINI_API_KEY` is read only in `lib/gemini-embeddings.ts` and `lib/chunk-embed.ts`
(embeddings) plus the route handlers `app/api/search/route.ts` (one-shot summary),
`app/api/ask/route.ts` (function-calling tool loop, non-streaming, auth-gated), and
`app/api/chat/route.ts` (streaming RAG via `@ai-sdk/google`). All three enforce: per-user daily
quota, a global daily circuit breaker (`ai_usage` table, sentinel UUIDs), and an in-memory
per-user cooldown (per `CLAUDE.md`). Input reaching Gemini is the user's query string plus
retrieved book/thesis/publication chunks (`book_chunks`, embeddings); output is rendered as
plain/markdown text through the existing DOMPurify-sanitized markdown renderer
(`lib/sanitize.ts`) — no `dangerouslySetInnerHTML` of raw model output found in these three
routes.

## 6. i18n / Khmer transform points

- Routing: `i18n/routing.ts`, `middleware.ts` (locale resolution, `/km` prefix, internal
  `/en/...` rewrite).
- Locale resolution for rendering: `i18n/request.ts` — explicit param → `rootLocale()` →
  cookie (admin/auth only); deliberately never reads `headers()` on the public tree.
- Message payload trimming: `i18n/pick-messages.ts`.
- Navigation: `i18n/navigation.ts` (locale-aware `Link`/`redirect`/etc., public tree only).
- Slugs: `lib/slug.ts` (+ `lib/slug.test.ts`, exercises Khmer strings already).
- Citation/SEO builders take an explicit `OrgIdentity`/locale rather than reading a global.
- Fonts: `app/fonts.ts` (Hanuman, Suwannaphum, Angkor, KantumruyPro, NotoSerifKhmer).
- Strings: `messages/en.json`, `messages/km.json`.

## 7. Test / CI status

- Unit/integration: Vitest (`npm test`), including `lib/rls.test.ts` (opt-in, `RLS_PROBE=1`,
  hits a real instance), `lib/resource-stats-consistency.test.ts`,
  `lib/i18n-namespaces.test.ts`, `lib/settings-consistency.test.ts`, `lib/slug.test.ts`,
  `components/admin/dashboard/dashboard-overview.test.tsx`, and many more (`**/*.test.ts(x)`).
- E2E: Playwright (`npm run test:e2e`), including `@axe-core/playwright` accessibility checks
  and `e2e/resource-stats.spec.ts`.
- CI (`.github/workflows/ci.yml`): secret scan (gitleaks), dependency-review on PRs,
  `scripts/audit-gate.mjs` (prod-dependency vuln gate, tuned to not block on transitive-only
  advisories), hero-image drift check, then the full test job. `.github/workflows/migrate.yml`
  handles migration dry-run/apply. `lighthouse.yml` runs Lighthouse CI (`lighthouserc.json`).
- **This sandbox could not run the full `npm run lint` / `npx tsc --noEmit` / `npm run build`
  / `npm test` here**, for two independent reasons: (1) the tool available to this agent caps
  any single shell command at 45 seconds, which the whole-repo versions of these all exceed;
  (2) `vitest`/`rolldown` cannot run at all in this sandbox regardless of timeout — the
  mounted project's `node_modules` was installed on the user's Mac and its native rolldown
  binding has no Linux build, confirmed by running an existing, untouched test
  (`lib/library-hours.test.ts`) and getting the same `MODULE_NOT_FOUND` immediately. Every
  file this audit touched was still checked individually with `npx eslint <file>` (which has
  no native-binding dependency and ran clean); the new test was written to the repo's existing
  conventions and reviewed by hand but not executed. Full battery still needs to run in CI or
  on the user's machine before merge — see `docs/FINAL_REPORT.md`.

## 8. Known-issues-from-review — verification summary

Full detail with file:line evidence is in `docs/AUDIT.md`. Short version: most of the
externally-reported issues were **already fixed** in the current `main` (this repo has an
active a11y/SEO/security remediation history — see `git log --oneline` for
`fix(a11y)`, `fix(auth)`, `perf(theses)` etc.). Two items needed action in this run
(#7 hours SSR default, #3 covers migration plan doc); the rest are documented as
already-resolved with the evidence that proves it, so a future reviewer doesn't have to
re-derive it.
