# Security Defense Scorecard

Scored 2026-08-29, after the defense-in-depth phase. Scale: 0–49 weak ·
50–69 developing · 70–84 hardened · 85–94 strong · 95–100 mature. Scores are
deliberately conservative; evidence column names the verifying artifact.

| Area | Score | Evidence / why not higher |
|---|---|---|
| Authentication | 88 | `getUser()`-verified everywhere; guards fail closed. GoTrue limits are dashboard-side and unverifiable from repo. |
| Authorization | 90 | guard-first across ~150 actions, object-level checks, fail-closed permissions. −: authorization matrix not yet property-tested per route. |
| MFA | 85 | AAL2 enforced in guard core incl. unenrolled admins; fails closed on missing AAL. −: no step-up/recent-auth for destructive super-admin ops yet. |
| RLS / DB policy | 90 | full-chain audit clean; DEFINER fns pin search_path; behavioral probes extended to canonical model. −: probes are opt-in (`RLS_PROBE=1`), not on every CI run. |
| Service-role isolation | 80 | `server-only` on the client module; no client bundle exposure. −: many callers still use raw service client rather than narrow service APIs. |
| API security (CORS/CSRF) | 82 | same-origin defaults, `requireSameOrigin` on push, SameSite=lax + Server Action origin checks. −: no systematic cross-site negative-test suite. |
| Rate limiting | 85 | per-route policies + emergency env switches + new fail-mode classification with in-memory fallback + tests. −: fallback is per-instance. |
| Edge / WAF | 55 | documented target config (`SECURITY.md`, in-depth §5); dashboard state not verifiable from repo. Score reflects what the repo can prove. |
| Storage | 85 | private R2 presigned (60 s), SSRF allow-list, auth-gated proxies, policy-checked crawler path. −: Zima object ACLs are provider-side. |
| Upload | 88 | permission → magic-byte → re-encode → folder regex → filename sanitizer, with tests. −: VirusTotal fails open (documented). |
| SSRF | 88 | single allow-list seam + regression tests covering metadata/localhost/look-alikes. −: other outbound calls (Telegram, push) are fixed-host but not behind one shared wrapper. |
| AI security | 86 | deterministic-first, defanged fenced corpus, verified citations, durable quotas, lockdown switch. −: no adversarial prompt-injection suite in CI (benchmark is offline). |
| Security headers / CSP | 78 | full header set + nonce CSP on admin/auth, pinned by tests. −: public `unsafe-inline` (accepted residual risk #1). |
| Caching | 85 | private surfaces `no-store`; invariant test forbids `cookies()`/`headers()` in public tree. |
| Supply chain / CI | 84 | gitleaks, dependency-review, audit-gate, minimal permissions, CodeQL added. −: third-party actions not SHA-pinned; branch protection is dashboard state. |
| Docker | 85 | non-root, multi-stage, standalone. −: no SBOM generation yet. |
| Secrets | 85 | classed by blast radius, env-injected, rotation without code change, constant-time compares. −: no automated rotation. |
| Logging / detection | 80 | structured events + correlation ids + new spike detector + degraded-limiter heartbeat + alert catalog. −: per-instance detection; no SIEM. |
| Incident response | 78 | runbooks + alert catalog + new lockdown capability with tests. −: no lockdown drill performed yet. |
| Regression testing | 85 | 2129+ unit tests incl. 15 architecture-invariant scans and dedicated security suites (bearer, crawler, zima/SSRF, lockdown, rate-limit fail modes, spike detector, RLS probes). |

**Overall: 83 — hardened**, with edge verification (55) as the known low spot
because it lives outside the repository. The path to "strong" is: run RLS
probes in scheduled CI, add the cross-site/step-up suites, SHA-pin actions,
and verify the Cloudflare configuration against §5 of the in-depth doc.
