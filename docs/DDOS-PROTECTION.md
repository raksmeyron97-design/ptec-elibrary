# PTEC e-Library — DDoS, Bot & Abuse Protection

How the site defends against volumetric attacks, scrapers, and form abuse.
Companion to `SECURITY-OPS.md` (monitoring/backups) and `SECURITY.md`
(architecture). Last reviewed: 2026-07-07.

The defense has three layers:

1. **Edge (CDN/WAF)** — absorbs volumetric floods before they reach the app.
   Must be configured at the provider (section 1).
2. **Application rate limits** — Postgres-backed sliding windows
   (`lib/rate-limit.ts` + `lib/rate-limit-policy.ts`), shared across all
   serverless instances, survive cold starts. Protect per-route abuse the
   edge can't judge (section 2).
3. **Emergency mode** — env switches that shed expensive work during an
   attack without a code change (section 4).

---

## 1. Edge / CDN / WAF setup (Cloudflare recommended)

The domain `library.ptec.edu.kh` should be proxied through Cloudflare
(orange-cloud ON for the DNS record). One-time setup:

- [ ] **Automatic DDoS protection** — on by default once proxied; nothing to configure.
- [ ] **Bot Fight Mode** — Security → Bots → enable (free plan). Challenges
      known-bad bot fingerprints. Do NOT enable "Definitely automated: block"
      super-bot rules that would hit Google Scholar — thesis PDFs are
      deliberately crawlable (`/api/theses/:id/file.pdf`).
- [ ] **WAF managed rules** — Security → WAF → enable the free managed ruleset.
- [ ] **Always Use HTTPS + TLS Full (strict)** — SSL/TLS settings.
- [ ] **Origin protection** — the origin is Vercel, which is itself a CDN with
      DDoS absorption, so origin-IP lockdown isn't applicable the way it is
      for a VPS. **The Zima Storage host is the exception**: it IS a single
      origin. Put `api./cdn.storage-ptec.online` behind Cloudflare too, and
      firewall the box to accept HTTP only from Cloudflare's published IP
      ranges (https://www.cloudflare.com/ips/).

### Cloudflare rate-limiting rules (Security → WAF → Rate limiting)

| # | Expression (URI path) | Rate | Action |
|---|---|---|---|
| 1 | `/auth/login` `/auth/signup` `/admin/login` (POST) | 10 / 10 min per IP | Managed Challenge |
| 2 | `/api/contact` | 5 / 10 min per IP | Block for 1 h |
| 3 | starts with `/api/search` | 60 / min per IP | Managed Challenge |
| 4 | contains `/file` or `/download` under `/api/` | 60 / min per IP | Block for 10 min |
| 5 | starts with `/admin` or `/api/admin` | 30 / min per IP | Block for 1 h |

Edge limits are set ~2× looser than the app-level limits below: the app is the
precise enforcement, the edge is the flood absorber. **Challenge** for
endpoints humans use interactively (login, search); **Block** for endpoints
where no human ever bursts (contact, admin).

### Edge caching

Static assets are already fingerprinted and cached by Vercel/`next.config.ts`
(hero images immutable 1 y, logos/favicons 1 d + SWR, SW caches covers 30 d and
PDFs 90 d client-side). If Cloudflare fronts the site, add Cache Rules:

- `/_next/static/*` → cache everything, 1 year (immutable).
- `/hero/*`, `/favicon/*`, `/*.png|webp|svg` → cache, respect origin headers.
- Thesis/publication PDF routes (`/api/theses/*/file`, `/api/publications/*/file`)
  already send `public, max-age=3600, stale-while-revalidate=86400` — let
  Cloudflare cache them (they're public documents; this offloads repeat reads).
- **Never cache**: `/dashboard*`, `/profile*`, `/admin*`, `/api/books/*/download`
  (auth-gated, sends `private, no-store`), anything with `Set-Cookie`.

### IP allowlist / blocklist

Use Cloudflare **IP Access Rules** (Security → WAF → Tools):
- Allowlist the school's static IP(s) so campus traffic is never challenged.
- Block abusive IPs/ASNs observed in `evt:"security"` logs (see §5).
Doing this at the edge is strictly better than in app code — blocked traffic
never costs a function invocation.

## 2. Application rate limits (enforced in code)

Backed by Postgres (`check_rate_limit` RPC) — **not** in-memory, so limits hold
across serverless instances and cold starts. All 429 responses carry a safe,
generic retry message and emit a `rate_limited` security event.

| Route / action | Key | Default | Env override | Strict/emergency |
|---|---|---|---|---|
| `/api/search` (AI) | IP | 10/min | `RL_SEARCH_PER_MIN` | ÷3 |
| `/api/search/native` | IP | 30/min | `RL_SEARCH_NATIVE_PER_MIN` | ÷3 |
| `/api/books/suggestions` | IP | 60/min | `RL_SUGGESTIONS_PER_MIN` | ÷3, or off entirely |
| `/api/search/popular`, `/api/departments/trending` | IP | 30/min | — | — |
| `/api/books/[slug]/file` (read) | IP | 30/min | `RL_FILE_READ_PER_MIN` | 10/min |
| `/api/theses/[id]/file` (read) | IP | 30/min | `RL_FILE_READ_PER_MIN` | 10/min |
| `/api/publications/[slug]/file` | IP | 30/min | `RL_FILE_READ_PER_MIN` | 10/min |
| `/api/books/[slug]/download` (auth) | user | 5/min | `RL_DOWNLOAD_PER_MIN` | 2/min |
| `/api/contact` | IP | 10/min + 3/h + 2/h per identical message | — | — |
| Review submission | user | 5/10 min | `RL_REVIEWS_PER_10MIN` | — |
| Note autosave | user | 40/min | `RL_NOTES_PER_MIN` | — |
| AI ask/chat | user | daily quota + global circuit breaker + cooldown | — | — |
| **Login / signup** | — | enforced by Supabase Auth + Turnstile CAPTCHA (server-side) | — | — |

Notes:
- Login/signup limits live in Supabase (GoTrue rate limits + Turnstile
  verification), which is stronger than app-side limiting because the auth
  endpoint is Supabase's, not ours. Configure under Auth → Rate Limits.
- Different audiences get different keys automatically: public routes limit
  per **IP**, authenticated actions per **user id**, admin APIs additionally
  require role + MFA before any work happens.

## 3. Bot & spam protection on forms

- **Turnstile CAPTCHA**: login, signup, admin login, contact (server-verified).
- **Honeypot** (`website` field): invisible to humans; a filled honeypot gets a
  fake success response so bots don't adapt.
- **Minimum fill time**: contact submissions arriving < 3 s after the form
  rendered are rejected (humans need longer just to pass Turnstile).
- **Duplicate content**: the same normalized message body is accepted at most
  2×/hour site-wide (stops one-text-many-IPs spam campaigns).
- **Input caps**: name 100, message 2000, search query 300 (100 for
  suggestions), review 2000, note 10 000 chars. Suggestion queries also strip
  `%`/`_` so user input can't inject expensive ILIKE wildcards.

## 4. Emergency mode (env switches)

Set in Vercel → Project → Environment Variables, then **redeploy** (~1 min).

| Variable | Effect |
|---|---|
| `DDOS_MODE=true` | Master switch — implies all three below |
| `STRICT_RATE_LIMIT=true` | Public rate limits divided by 3 |
| `DISABLE_EXPENSIVE_SEARCH=true` | Gemini search summary skipped; autocomplete returns empty (search results themselves keep working) |
| `PDF_DOWNLOAD_LIMIT_STRICT=true` | File reads 10/min per IP, downloads 2/min per user |

What emergency mode does **not** touch: admin auth, MFA, ownership checks,
private-data protections, the homepage, cached public pages. Public reading
stays available — just throttled.

**Rollback**: delete the variable (or set `false`) and redeploy. No data or
schema changes are involved; the switches are read per-request.

During an attack, prefer this order:
1. Cloudflare: enable **Under Attack Mode** (challenges everything) — instant, no deploy.
2. Set `DDOS_MODE=true` and redeploy.
3. Watch `evt:"security"` logs; add edge IP/ASN blocks for the top offenders.
4. When traffic normalizes: disable Under Attack Mode first, watch 15 min, then remove `DDOS_MODE`.

## 5. Monitoring & alerting

App-side signals already emitted (see `lib/security-log.ts`, SECURITY-OPS.md §2):
`rate_limited` (now on every limited route, with route + IP/user),
`captcha_failed`, `suspicious_input` (honeypot / fill-time / duplicate spam),
`auth_forbidden`, `cron_auth_failed`, `upload_rejected`.

Watch (Cloudflare Analytics + Vercel dashboard + log drain):
- requests/min and 4xx/5xx spikes (Vercel → Analytics)
- `rate_limited` event volume — a spike IS the attack signature
- WAF blocked/challenged counts (Cloudflare → Security → Events)
- Supabase → Database → active connection count
- download volume: `download_logs` table (per-user counts are queryable)

Alert suggestions: >100 `rate_limited`/hour; 5xx rate >1%; Supabase
connections near pool limit; UptimeRobot (free) on `/home` for availability.

## 6. Safe testing checklist (dev/staging ONLY — never against production)

```bash
# with `npm run dev` on :3000
for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code} " "http://localhost:3000/api/search?q=math"; done
# → first 10 are 200, then 429s

curl -s "http://localhost:3000/api/search?q=$(python3 -c 'print("a"*400)')" | head -1   # → 400
curl -s "http://localhost:3000/api/books/suggestions?q=$(python3 -c 'print("a"*200)')"  # → []
```

- [ ] Repeated search → 429 after limit
- [ ] Repeated file reads → 429 after limit
- [ ] Over-long query → 400 (search) / empty (suggestions)
- [ ] Contact: honeypot filled → fake ok; instant submit → 400; same message 3× → 429
- [ ] Login/signup throttling → verify in Supabase Auth settings (Turnstile on)
- [ ] `DDOS_MODE=true npm run dev` → search works without AI summary, suggestions empty
- [ ] Admin routes still demand login + MFA in emergency mode
- [ ] Remove flags → normal behavior returns
