# HTTP Security Headers — Baseline & CSP Staged-Enforcement Plan

_Last updated: 2026-07-11._

Two places set headers; keep them from overlapping:

| Where | What | Why there |
|---|---|---|
| `next.config.ts` → `headers()` | All static security headers (HSTS, XFO, nosniff, Referrer-Policy, Permissions-Policy, COOP, CORP, X-Permitted-Cross-Domain-Policies) + cache rules | Applied to every response incl. static assets the middleware matcher skips |
| `middleware.ts` | `Content-Security-Policy` (needs the per-request nonce), `Content-Security-Policy-Report-Only`, `Reporting-Endpoints` | Nonce changes per request — cannot be static |

**Never add a second CSP in `next.config.ts`** — browsers enforce the
intersection of multiple CSP headers, which silently breaks pages.

## Current baseline (2026-07-11)

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY` (matches CSP `frame-ancestors 'none'`)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()`
- `Cross-Origin-Opener-Policy: same-origin-allow-popups` — plain `same-origin`
  would sever the opener handle OAuth/share popups rely on.
- `Cross-Origin-Resource-Policy: same-origin` — nothing on this origin is
  meant to be hotlinked/embedded as a subresource by other sites. (CORP set
  *here* does not affect the cross-origin images/fonts *we* load — those are
  governed by the storage CDN's own headers.)
- `X-Permitted-Cross-Domain-Policies: none`
- CSP (enforced, nonce-based) — see `buildCsp()` in `middleware.ts`.

### Origin inventory (why each CSP origin exists)

| Origin | Directive(s) | Used by |
|---|---|---|
| `challenges.cloudflare.com` | script/frame/connect | Turnstile CAPTCHA (login, signup, contact) |
| `va.vercel-scripts.com` | script | Vercel Analytics / Speed Insights |
| `*.supabase.co` (+wss) | connect/img | Auth, PostgREST, realtime, storage-served images |
| `*.r2.dev`, `*.r2.cloudflarestorage.com` | img/connect | Legacy R2 covers + presigned PDF GETs |
| `*.storage-ptec.online`, `storage-ptec.online` | img | Zima Storage CDN (covers) |
| `api.storage-ptec.online` | connect | Zima-proxied PDF range requests |
| `*.public.blob.vercel-storage.com` | img/connect | User avatars (Vercel Blob) |
| `accounts.google.com` | connect | Google OAuth |
| `fonts.googleapis.com` / `fonts.gstatic.com` | style/font | Khmer webfonts fallback |
| `lh3/avatars.googleusercontent.com`, `avatars.githubusercontent.com` | img | OAuth avatars |
| `covers.openlibrary.org`, `images-na.ssl-images-amazon.com`, `drive.google.com`, `*.gstatic.com` | img | External cover sources in older records |
| `www.google.com` | frame | Google Maps embed (contact/about) |
| `blob:` | connect | Offline PDF reading (SW cache → blob URL). **Removing this fully breaks offline reading** — learned the hard way, see pdf-reader memory. |
| `data:` | img/font | Inline placeholders, pdf.js glyph fallbacks |

## Staged CSP tightening: dropping `'unsafe-eval'`

`'unsafe-eval'` is the one remaining weak spot in script-src. The plan:

1. **DONE (this phase)** — `isEvalSupported: false` set in the PDF reader's
   pdf.js options, removing the only known production eval path.
2. **DONE (this phase)** — production responses now also send a
   `Content-Security-Policy-Report-Only` header that is identical to the
   enforced policy **minus `'unsafe-eval'`**, reporting to
   `/api/csp-report` (both `report-uri` and Reporting-API `report-to`).
   Violations appear in server logs as `evt:"security", type:"csp_violation"`
   (deduped per directive+URI, 10-min window).
3. **WAIT ~2 weeks of real traffic.** Check logs:
   `grep csp_violation` (or the log provider's filter). Exercise manually at
   least once: login (Turnstile), Google OAuth, open a Khmer PDF in the
   reader, offline reading, an admin page, push subscribe.
4. **ENFORCE** — remove `'unsafe-eval'` from `buildCsp()`'s enforced branch
   (flip `withEval: true` → `false` at the `cspHeader` call-site), keep the
   report-only header for one more release, then drop it.
5. **Rollback** — reinstate `withEval: true`; single-line revert, no deploy
   coupling.

`style-src 'unsafe-inline'` stays: React `style={}` attributes (drawer
transforms, canvas sizing) fall under style-src in CSP3 and nonces cannot
cover attributes. Risk is low (no user-controlled style injection points;
markdown is DOMPurify-sanitized).

## Testing checklist after any header/CSP change

- [ ] Login + signup (Turnstile frame renders, form posts)
- [ ] Google OAuth round-trip
- [ ] Open a book PDF online; toggle airplane mode and reopen offline
- [ ] Khmer PDF (CID fonts from /pdf/cmaps)
- [ ] Cover images on /books (Zima CDN + legacy R2 records)
- [ ] Avatar images (Vercel Blob / Google)
- [ ] PWA install + service-worker update (`/sw.js` must stay `no-store`)
- [ ] Push notification subscribe
- [ ] Admin login → MFA → dashboard
- [ ] Contact page Google Maps embed
- [ ] No `csp_violation` events logged during the above
