# Security Defense-in-Depth — Baseline (Phase 0)

Date: 2026-08-29. Recorded **before** the defense-in-depth phase changed any
code. Complements (does not replace) `SECURITY.md`, `docs/SECURITY.md`,
`docs/SECURITY-OPS.md`, `docs/SECURITY-HEADERS.md`, `docs/RLS-MATRIX.md`,
`docs/ALERT-CATALOG.md`, `docs/MONITORING.md`.

## Baseline state

- Branch: `main`. **The vulnerability-remediation phase's fixes are present as
  uncommitted working-tree changes** (28 modified files + 5 new files under
  `lib/security/` and `lib/zima.test.ts`). This phase builds on top of them and
  must not revert them.
- Tests: `npx vitest run` → **154 files passed, 1 skipped; 2112 tests passed,
  33 skipped** (RLS probes are opt-in via `RLS_PROBE=1` and skipped by default).
- Types/lint: `tsc --noEmit` clean; ESLint clean.
- `npm audit`: 0 high/critical, 2 moderate (framework-pinned; gated in CI by
  `scripts/audit-gate.mjs`).

## Remediation-phase fixes assumed complete (do not revert)

1. MFA enrollment is enforced in `verifyAuthAndMFA` (`lib/auth/requireAdmin.ts`)
   for every panel-role user — not only in the admin layout; fails closed on
   missing AAL data.
2. `/admin/users` page requires `requireAdmin()`.
3. SSRF allow-list `isAllowedStorageUrl()` in `lib/zima.ts`, enforced in
   `zimaFetch()` and `lib/pdf-page-index.ts`.
4. Upload folder traversal rejected; filenames sanitized (`sanitizeUploadName`).
5. Constant-time bearer comparison (`lib/security/bearer.ts`) on cron, health
   deep-probe, backfill-embeddings.
6. Book + thesis file routes gated: auth required for inline view AND download;
   theses also enforce the Top-10/admin-block policy on the inline route;
   DNS-verified Google crawlers (`lib/security/crawler.ts`) may fetch published,
   unrestricted items so `citation_pdf_url` keeps resolving for Scholar.
7. Push subscribe refuses to rebind another user's endpoint unless the crypto
   keys match (shared-device handoff allowed, remote hijack blocked).
8. `getPermissionsForRole` fails **closed** (deny-all) on a `role_permissions`
   query error; empty table still uses seeded defaults.
9. Misc guards: `checkThesisSlugAvailable`, draft `getPublicationFigures`,
   `sendPasswordReset` super-admin target check, catalogs ILIKE-wildcard strip,
   `server-only` on `lib/supabase/server.ts` / `lib/rate-limit.ts` /
   `app/actions/audit.ts`.

## Existing layers (verified in source)

| Layer | Where | Status |
|---|---|---|
| Edge (Cloudflare Tunnel) | infra; `SECURITY.md` §2–3 documents WAF/rate-rule setup | Documented, applied outside repo |
| HTTP headers | `next.config.ts` (HSTS, nosniff, XFO, Referrer-Policy, Permissions-Policy, COOP/CORP) | Present |
| CSP | split in `middleware.ts`/`lib/csp.ts`: nonce CSP on admin/auth, `unsafe-inline` on public (prerender tradeoff, documented) | Present, pinned by `lib/csp.test.ts` |
| Request identity | `x-request-id` set by middleware (reuses cf-ray) | Present |
| Client IP | `clientIp()` — `cf-connecting-ip` authoritative, private hops skipped | Present |
| AuthN | Supabase; guards use `getUser()` (server-verified), never `getSession()` | Present |
| MFA / AAL2 | enforced in guards for all panel roles incl. unenrolled | Present (this remediation) |
| AuthZ | `requireUser/Staff/Librarian/Admin/SuperAdmin/Permission`, DB-sourced role, guard-first in ~150 actions | Present |
| Per-resource permissions | `role_permissions` × `lib/permissions.ts`, fail-closed on error | Present |
| Input validation | PostgREST filter sanitizers, markdown → React elements + `isSafeHref`, upload magic-byte guard | Present |
| Rate limiting | DB-backed sliding window (`lib/rate-limit.ts`) + per-route policies and emergency env switches (`lib/rate-limit-policy.ts`: `DDOS_MODE`, `STRICT_RATE_LIMIT`, `PDF_DOWNLOAD_LIMIT_STRICT`, `DISABLE_EXPENSIVE_SEARCH`) | Present |
| AI quotas | `lib/ai/limits.ts` — per-user daily quota, global circuit breaker, shared cooldown | Present |
| DB grants + RLS | full migration chain audited: no unprotected tables, no permissive writes, all SECURITY DEFINER fns pin `search_path` | Present; probes in `lib/rls.test.ts` (`RLS_PROBE=1`) |
| Storage | private R2 via 60s presigned GET; Zima proxied via allow-listed `zimaFetch` | Present |
| Audit trail | `admin_audit_log` via `app/actions/audit.ts` (server-only) | Present |
| Security telemetry | `logSecurityEvent()` → structured JSON stdout; catalog in `docs/ALERT-CATALOG.md` | Present |
| CI gates | gitleaks → dependency-review → audit-gate → hero-check → tsc → lint → vitest; e2e with real local Supabase | Present |
| Workflow permissions | every workflow sets minimal `permissions:` (`contents: read` or `{}`) | Present |
| Docker | multi-stage, `node:22-alpine`, `USER nextjs` (non-root), standalone output | Present |
| Invariant tests | 15 source-scanning tests (cache-safety, slug-gate, CSP, SW policy, …) | Present |

## Gaps identified for this phase (each = threat + enforcement point + failure mode + test)

| # | Gap | Threat | Planned control |
|---|---|---|---|
| G1 | `rateLimit()` fails **open on DB error for every route** — a Supabase outage removes all app-layer limits at once | attacker induces/waits for DB degradation, then brute-forces downloads/AI/mutations unmetered | per-call fail-mode classification (`FAIL_OPEN` / `EMERGENCY_LIMIT` / `FAIL_CLOSED`) with an in-memory emergency fallback limiter |
| G2 | No emergency lockdown switches for features (only rate-limit tuning) | active incident (AI abuse, storage exfiltration, admin compromise) can't be contained without a code change | `lib/security/lockdown.ts`: `LOCKDOWN_AI`, `LOCKDOWN_DOWNLOADS`, `LOCKDOWN_ADMIN_MUTATIONS` env switches, enforced server-side at the AI route, file/download routes, and the admin guard |
| G3 | Security events are single lines — no spike aggregation, so a burst (credential stuffing, download scraping) looks like N unrelated lines | slow detection of automated abuse | in-memory spike detector in `lib/security-log.ts` emitting one escalated `security_spike` event per (type,window); documented per-instance limitation |
| G4 | `lib/rls.test.ts` probe list predates the canonical-model tables (`contributors`, `resource_files`, `storage_objects`, …) and `publication_drafts`/`author_profiles` | RLS regression on newer tables would not be caught by the behavioral probes | extend `ANON_ZERO_TABLES` |
| G5 | No CodeQL / code-scanning workflow | vulnerable code patterns merged without static analysis | `codeql.yml` with minimal permissions |

## Explicitly out of scope (documented, not implemented here)

- Cloudflare WAF/Access rules — infra-side; setup already documented in
  `SECURITY.md` §2–3. This repo cannot verify the dashboard state.
- Public-path CSP `unsafe-inline` and non-HttpOnly Supabase cookies —
  documented architectural tradeoffs (prerenderability; Supabase SSR model).
  Revisit only with a static-hash CSP design, not in this phase.
- Repository settings (branch protection, secret-scanning push protection,
  Dependabot) — GitHub dashboard state, listed as operator actions in
  `docs/SECURITY_DEFENSE_IN_DEPTH.md`.

## Assumptions

- `SITE_URL`/canonical-host, tunnel topology, and `cf-connecting-ip` semantics
  as documented in CLAUDE.md hold in production.
- The hosted DB has the full migration chain applied (`migrate.yml`), including
  the `contact_rate_limit` table flagged missing in the Aug 2026 prod audit.
- Supabase GoTrue rate limits + captcha are configured per `docs/SECURITY-OPS.md` §1.
