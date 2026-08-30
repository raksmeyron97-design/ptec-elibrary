# Security Defense-in-Depth — Final Report

Date: 2026-08-29. Scope: the defense-in-depth phase that followed the
vulnerability-remediation phase. Companions: `SECURITY_DEFENSE_BASELINE.md`
(before-state), `SECURITY_DEFENSE_IN_DEPTH.md` (architecture + runbooks),
`SECURITY_DEFENSE_SCORECARD.md` (scores).

## Executive summary

The application entered this phase with a strong foundation (guard-first
authorization, clean RLS chain, MFA hard-enforced, SSRF/upload/crawler controls
from the remediation phase). This phase added the *independent-failure* layers
that were missing: abuse control that survives a rate-limiter outage, incident
containment switches, burst detection, static code scanning, and extended
database probes — each with a named threat, one enforcement point, an explicit
failure mode, and tests. No existing control was weakened or replaced; no
framework, auth, or storage migration was performed. The system is not — and no
system is — immune to compromise; the goal met here is that a single failing
control no longer implies an unmitigated attack path.

## New defense layers (this phase)

| Layer | Threat | Enforcement point | Failure mode | Test |
|---|---|---|---|---|
| Rate-limit fail-mode classification + in-memory emergency fallback | DB outage previously removed **all** app-layer limits (verified fail-open) | `lib/rate-limit.ts` — default `failMode:"emergency"`, opt-in `closed`/`open` | degrade to per-instance limiting; `rate_limiter_degraded` heartbeat; `closed` denies | `lib/rate-limit.test.ts` (6) |
| Emergency lockdown switches | active incident needs containment in minutes without a code change | `lib/security/lockdown.ts` → 3 AI routes, 5 file/download routes, and `verifyAuthAndMFA` (admin guard core; super_admin exempt so the operator keeps access) | fail closed while flipped; env-only, unreachable by app users; every refusal logged | `lib/security/lockdown.test.ts` (6) |
| Security-event spike detector | bursts (credential stuffing, scraping) look like N unrelated log lines | `lib/security-log.ts` — one `security_spike` meta-event per type per 60 s window (threshold 20, `SECURITY_SPIKE_THRESHOLD` tunes) | detection-only, never blocks; no self-amplification | `lib/security-log.test.ts` (5) |
| RLS probe extension | canonical-model tables (0104–0108) postdated the behavioral probe list | `lib/rls.test.ts` `ANON_WRITE_DENIED` + 9 tables (public SELECT on them is intentional, so zero-rows would be the wrong probe) | probe fails CI when `RLS_PROBE=1` | itself |
| CodeQL workflow | no static analysis on merged code | `.github/workflows/codeql.yml` (PRs, main, weekly; minimal permissions) | alerts in Security tab; not a hard deploy gate | CI |
| Alert-catalog entries | new signals had no operator contract | `docs/ALERT-CATALOG.md`: `security-spike`, `rate-limiter-degraded`, `lockdown-active` (undeclared lockdown = Sev 1) | — | — |

## Threat model & trust boundaries

Eight zones (public internet → browser → authenticated → admin → app server →
database → storage → AI providers) with per-zone enforcement, documented with
the 22-row threat→control→failure-mode→test matrix in
`SECURITY_DEFENSE_IN_DEPTH.md` §1–2. Key invariants: nothing client-side is
believed; the database and storage enforce policy independently of the app;
AI output and retrieved text never carry authority.

## Validation (Phase 43)

- `tsc --noEmit` — clean. `npm run lint` — clean. `npm run build` — succeeded.
- `npx vitest run` — full suite green after all changes (baseline 2112 passed;
  now 2129+ with the 17 new security tests; RLS probes additionally green when
  run with `RLS_PROBE=1` against a local stack).
- Static sweeps re-verified this phase: no `NEXT_PUBLIC_` secret, no
  `eval`/`new Function`/`child_process`, every `dangerouslySetInnerHTML` a
  static constant or escaped JSON-LD, service-role modules `server-only`,
  bearer compares constant-time, no unrestricted `Access-Control-Allow-Origin`.
- Functional surfaces unchanged by design: lockdown defaults OFF, rate-limit
  behavior is identical while the DB is healthy, spike detector only adds a log
  line, CodeQL adds no runtime code.

## Remaining risks & recommendations (owner actions)

1. **Verify Cloudflare against §5** of the in-depth doc (WAF, edge rate rules,
   bot-fight with verified-bot allowance) — the repo cannot prove dashboard
   state; this is the scorecard's low spot.
2. **GitHub settings**: branch protection + required review, secret-scanning
   push protection, Dependabot — dashboard-side.
3. **Run the RLS probe suite on a schedule** (`RLS_PROBE=1` against the e2e
   local stack) so DB-policy regressions surface without manual runs.
4. **Drill the lockdown runbook once** — on the local stack or an ephemeral
   staging project (there is no permanent staging environment; RUNBOOKS.md
   §M6 documents the staging strategy): flip each switch, confirm 503s +
   `lockdown_blocked` events, clear, confirm recovery.
5. Longer-term hardening tracked in the scorecard: step-up auth for
   destructive super-admin ops, SHA-pinned actions, SBOM, cross-site negative
   suite, static-hash CSP for public paths.
6. Prior operational items remain: apply `contact_rate_limit` in prod; confirm
   GoTrue rate limits per `SECURITY-OPS.md` §1.

## Closing statement

Precise claim, per the phase rules: the application now has layered,
independently-failing controls with documented failure modes and regression
tests at every major trust boundary. It is hardened, monitored, and
containable — not invulnerable. Effectiveness under the listed residual risks
depends on the operator actions above being completed and periodically
re-verified.
