# Security Defense-in-Depth Architecture

Companion to `docs/SECURITY_DEFENSE_BASELINE.md` (state before this phase) and
`docs/SECURITY_DEFENSE_SCORECARD.md` / `docs/SECURITY_DEFENSE_FINAL.md`.
Operational procedures stay in `docs/SECURITY-OPS.md`; alert definitions in
`docs/ALERT-CATALOG.md`. Principle: no single layer is sufficient — when one
control fails, an independent one should prevent, limit, detect, or contain.

## 1. Trust boundaries

| Zone | Trust | What crosses in | Enforced by |
|---|---|---|---|
| **A — Public internet** | none | arbitrary/malformed/automated requests | Cloudflare (tunnel, TLS, WAF where configured), middleware canonical-host collapse, edge rate rules |
| **B — Browser** | none | roles/IDs/state claimed by the client are never believed | every check is server-side; guards re-read role from DB; no client-supplied user ids anywhere |
| **C — Authenticated user** | identity only | requests remain attacker-controlled; authN ≠ authZ | guards + per-resource permissions + ownership scoping (`.eq("user_id", user.id)`) |
| **D — Admin user** | privileged, still untrusted input | object IDs, payloads, URLs | object-level checks (`assertCanManageTarget`), publish-state checks, input sanitizers, upload guard, SSRF allow-list |
| **E — App server** | trusted execution | secrets, service-role, business rules | `server-only` imports on privileged modules; secrets never `NEXT_PUBLIC_` |
| **F — Database** | independent policy boundary | every query | grants + RLS + pinned-`search_path` SECURITY DEFINER fns + constraints; probed by `lib/rls.test.ts` |
| **G — Storage** | separate boundary | file bytes | private R2 (60 s presigned GET), Zima behind `isAllowedStorageUrl` allow-list, auth-gated proxy routes |
| **H — AI providers** | external, untrusted output | model output, retrieved text | corpus text defanged + fenced as user-role data; `enforceGrounding` deletes unverified citations; model never decides authorization |

Data flow: A→(edge)→middleware→route/action→guard→(E)→F/G/H, with every F/G/H
access mediated by E. Nothing in A–D can reach F/G/H directly except the
PostgREST surface, which RLS+grants govern independently of the app.

## 2. Layered controls (threat → control → enforcement point → failure mode → test)

| # | Threat | Control | Enforcement point | Failure mode | Test |
|---|---|---|---|---|---|
| 1 | host confusion / cookie loss behind tunnel | canonical-host 308 | `middleware.ts` before cookie reads | fail-redirect | e2e + `lib/canonical-host` usage |
| 2 | XSS via injected markup | markdown → React elements only, `isSafeHref` allow-list; JSON-LD `<` escaping | `lib/markdown/parse.ts`, `JsonLd.tsx` | unsafe URL dropped | markdown unit tests |
| 3 | clickjacking / MIME sniffing / downgrade | XFO DENY, nosniff, HSTS(preload), Referrer-Policy, Permissions-Policy, COOP/CORP | `next.config.ts` headers | headers static — no runtime failure | `lib/csp.test.ts` + e2e |
| 4 | script injection on admin/auth | per-request nonce CSP (+ report-only tightening → `/api/csp-report`) | `middleware.ts`/`lib/csp.ts` | violation reported | `lib/csp.test.ts` |
| 5 | forged identity | Supabase `getUser()` (server-verified JWT), never `getSession()` | `lib/auth/requireAdmin.ts`, route handlers | 401 | guard tests |
| 6 | stolen password on privileged account | AAL2 required for every panel role; unenrolled admins hard-fail to enroll | `verifyAuthAndMFA` (covers all Server Actions + admin APIs, not just layout navigation) | throw 403 (fail closed, incl. missing AAL data) | auth-guard tests |
| 7 | privilege escalation via UI or replay | role re-read from DB per call; `role_permissions` × resource; self-role-change and super-admin-target rules | guards + `users/actions.ts` | `getPermissionsForRole` fails **closed** (deny-all) on query error | `lib/permissions` tests |
| 8 | IDOR | ownership scoping on all user data; object-level checks on admin targets | every action derives `user.id` server-side | 403/404 | RLS probes + action tests |
| 9 | RLS bypass via PostgREST | RLS/REVOKE on every public table; no anon writes; DEFINER fns pin `search_path` | migrations (Zone F) | DB rejects | `lib/rls.test.ts` (`RLS_PROBE=1`), extended this phase to canonical-model tables |
| 10 | abuse / brute force / scraping | DB sliding-window limits per route policy; emergency env switches (`DDOS_MODE`, …) | `lib/rate-limit.ts` + `lib/rate-limit-policy.ts` | **classified per call** — see §3 | `lib/rate-limit.test.ts` (new) |
| 11 | rate-limit DB outage removes all limits | in-memory emergency fallback (same limit, per instance) — new this phase | `rateLimit()` default `failMode:"emergency"` | degrade to per-instance limiting + `rate_limiter_degraded` heartbeat | `lib/rate-limit.test.ts` |
| 12 | malicious upload (stored XSS, malware, traversal) | permission gate → magic-byte sniff (SVG/HTML rejected) → size cap → sharp re-encode → folder regex (no `..`) → filename sanitizer | `app/actions/upload.ts`, `lib/upload-content-guard.ts`, `lib/zima.ts` | reject + `upload_rejected` event | `lib/zima.test.ts`, guard tests |
| 13 | SSRF via DB-stored file URLs | storage-host allow-list; http only for the Zima host; IP literals/localhost match nothing | `zimaFetch()`/`isAllowedStorageUrl` (single seam for 5 proxy routes + pdf indexer) | 502 blocked → caller 404s | `lib/zima.test.ts` |
| 14 | restricted-content exfiltration | auth on inline view + download; thesis policy engine re-evaluated on every request; crawler exception is rDNS+forward-verified and still policy-checked | file/download routes | 401/403 | route tests + `lib/security/crawler.test.ts` |
| 15 | push-subscription hijack | endpoint claim requires matching crypto keys | `/api/push/subscribe` | 403 | route behavior (keys can't be forged remotely) |
| 16 | prompt injection from corpus | retrieved text defanged + fenced in user role, never system; citations verified (`enforceGrounding`); deterministic answers bypass the model | `lib/ai/context.ts`, `lib/ai/guardrails.ts` | uncited claims stripped | `lib/ai` unit tests + benchmark |
| 17 | AI cost abuse | cooldown + per-user daily quota + global circuit breaker (DB-durable) + message caps + `maxDuration` | `lib/ai/limits.ts`, routes | 429 | limits tests |
| 18 | active incident containment | **emergency lockdown switches** — new this phase, §4 | routes + admin guard | fail closed while flipped | `lib/security/lockdown.test.ts` |
| 19 | slow detection of bursts | **in-process spike detector** → one `security_spike` meta-event per type/window — new this phase | `lib/security-log.ts` | detection-only (never blocks) | `lib/security-log.test.ts` |
| 20 | secret theft via timing | constant-time bearer compare | `lib/security/bearer.ts` (cron/health/backfill) | reject | `lib/security/bearer.test.ts` |
| 21 | supply chain / CI | gitleaks, dependency-review, audit-gate, minimal workflow permissions, **CodeQL** (new) | `.github/workflows/*` | CI fails / alerts | CI itself |
| 22 | container compromise | multi-stage build, non-root `USER nextjs`, standalone output, no build secrets in runner | `Dockerfile` | — | image build in CI |

## 3. Rate-limit failure classification

`rateLimit(key, limit, windowMs, { failMode })`:

| Mode | On DB error | Use for | Current users |
|---|---|---|---|
| `emergency` (default) | enforce the same limit from process memory (per-instance, undercounts across a fleet — still bounds abuse) | everything unless deliberately reclassified | all existing call sites (no churn) |
| `closed` | deny | operations where an unmetered request is worse than an outage | available; opt-in |
| `open` | allow | public low-risk reads where availability explicitly outranks abuse control | none — must be chosen deliberately |

The AI quota is DB-durable and separate; auth endpoints are limited by GoTrue +
Turnstile (browser-direct, see baseline). Degradation emits one
`rate_limiter_degraded` heartbeat per instance per minute (alert: `rate-limiter-degraded`).

## 4. Emergency lockdown (runbook)

Switches (env, deployment-holder only — unreachable by any app user):

| Switch | Effect | Enforcement |
|---|---|---|
| `LOCKDOWN_AI=true` | `/api/ai`, `/api/ask`, `/api/chat` → 503 + Retry-After | route entry, before auth/DB work |
| `LOCKDOWN_DOWNLOADS=true` | all 5 book/thesis/publication file+download routes → 503 (crawler path included) | route entry |
| `LOCKDOWN_ADMIN_MUTATIONS=true` | every guarded admin operation fails for panel roles **below super_admin** — a compromised staff/librarian/admin account is contained while the operator keeps access | `verifyAuthAndMFA` (single point covering ~150 actions + admin APIs) |
| `LOCKDOWN_ALL=true` | all of the above | — |

Procedure: declare the incident (so `lockdown-active` alerts read as expected),
set the switch and redeploy/restart (~1 min on Vercel; container restart on
ZimaOS), verify with a probe request (expect 503 + `lockdown_blocked` events),
remediate, clear the switch, confirm normal responses, write the postmortem.
A `lockdown_blocked` event **without** a declared incident is itself a Sev-1
signal (someone with env access flipped a switch) — see ALERT-CATALOG.

## 5. Edge protection (operator actions — outside this repo)

Cloudflare dashboard state cannot be verified from the repo. Target
configuration (setup steps in `SECURITY.md` §2–3):

- Proxy (orange-cloud) the canonical host; keep the tunnel fallback host
  non-published or redirecting (middleware already 308s it).
- WAF managed rules ON; rate rules: `/auth/*` + `/admin/login` strict
  (~10/min/IP), `/api/ai|ask|chat` ~20/min/IP, `/api/*/file|download`
  ~60/min/IP, search moderate, public reads generous. Edge limits protect
  availability; the app's limits (§3) protect business logic — both stay.
- Bot-fight mode with a verified-bot allowance (Googlebot must still reach the
  crawler-verified file routes).
- GitHub settings: branch protection + required review on `main`, secret
  scanning + push protection, Dependabot alerts. CodeQL workflow now exists
  in-repo; the rest is dashboard state.

## 6. Secrets — classes and blast radius

| Class | Members | Compromise contained to |
|---|---|---|
| PUBLIC | `NEXT_PUBLIC_*` (anon key, site URL, VAPID public, Turnstile site key) | nothing — designed public; anon key is RLS-bound |
| APPLICATION | `GEMINI_API_KEY`, `TELEGRAM_*`, `SMTP_*`, `VIRUSTOTAL_API_KEY` | that provider only (cost/spam) — no DB or storage access |
| PRIVILEGED | `SUPABASE_SERVICE_ROLE_KEY`, `R2_*`, `ZIMA_API_KEY`, `VAPID_PRIVATE_KEY` | one subsystem each; service-role is the crown jewel — modules importing it are `server-only` |
| OPERATIONAL | `CRON_SECRET`, `ADMIN_SECRET_KEY` | job triggering only (both fail closed when unset, constant-time compared) |
| DEPLOYMENT | Vercel/GitHub Actions secrets, registry creds | CI/CD; workflows run with minimal permissions |

Rotation: all are env-injected — rotate at the provider, update the deployment
env, redeploy; no code change required. Procedures per credential:
`docs/SECURITY-OPS.md`.

## 7. Residual risks (accepted, documented)

1. Public-path CSP keeps `unsafe-inline` script-src (prerender tradeoff) and
   Supabase cookies are JS-readable — XSS defense on public pages rests on
   output encoding (§2 row 2), which is why the markdown pipeline is
   React-elements-only by construction. Revisit with a static-hash CSP design.
2. Emergency rate limiting and spike detection are per-instance — a fleet-wide
   view requires the log aggregator (ALERT-CATALOG assumes it).
3. Crawler verification trusts `cf-connecting-ip`; a proxy that rewrites it
   fails **closed** (crawlers 401), never open.
4. VirusTotal check is hash-reputation only and fails open by design (logged).
5. Cloudflare/WAF/GitHub dashboard state is operator-owned and unverifiable
   from CI; §5 is the contract for it.
