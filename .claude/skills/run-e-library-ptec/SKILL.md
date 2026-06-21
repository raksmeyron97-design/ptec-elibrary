---
name: run-e-library-ptec
description: Build, run, and drive the PTEC e-Library Next.js app. Use when asked to start the app, run it, take a screenshot, verify a UI change, check a page, or interact with the running library site.
---

PTEC e-Library is a Next.js 16 App Router web app. Drive it headlessly via `.claude/skills/run-e-library-ptec/driver.mjs` (Playwright-based), which launches Chromium, navigates to pages, and saves screenshots to `/tmp/ptec-shots/`.

## Prerequisites

Node 20+ and npm are all that's needed. Playwright's Chromium is bundled with the devDependencies — no separate install required.

```bash
# Verify
node --version    # v20+
npx playwright --version
```

## Setup

```bash
cd /Users/mac/Desktop/e-library-ptec
npm install
```

Environment variables live in `.env` at the repo root (not committed). They are required for Supabase, R2, and Turnstile to function. The app's public pages (home, books, catalogs, posts, research) render even if external services are unreachable, falling back to empty data.

## Run (agent path)

### 1. Start the dev server

```bash
npm run dev > /tmp/nextjs-dev.log 2>&1 &
echo $! > /tmp/dev.pid
```

Detect the port — check `/books` (not `/`) because port 3000 may be occupied by an unrelated server that still returns 200 for the root path:

```bash
PORT=""
for p in 3000 3001 3002 3003; do
  if curl -sf -o /dev/null -w "%{http_code}" "http://localhost:$p/books" 2>/dev/null | grep -q "^200"; then
    PORT=$p; break
  fi
done
echo "Dev server on port $PORT"
```

### 2. Use the driver

```bash
# Smoke test all key routes (saves screenshots to /tmp/ptec-shots/)
BASE_URL=http://localhost:$PORT node .claude/skills/run-e-library-ptec/driver.mjs smoke

# Screenshot a single page
BASE_URL=http://localhost:$PORT node .claude/skills/run-e-library-ptec/driver.mjs screenshot /books /tmp/ptec-shots/books.png

# Check for console errors on a page
BASE_URL=http://localhost:$PORT node .claude/skills/run-e-library-ptec/driver.mjs check-errors /books
```

**Driver commands:**

| command | args | what it does |
|---|---|---|
| `smoke` | — | GET all key routes, screenshot each, fail on 4xx/5xx |
| `screenshot` | `[url] [outpath]` | Screenshot one URL, save to `/tmp/ptec-shots/` |
| `check-errors` | `[url]` | Navigate to URL, exit 1 if there are console errors |

Screenshots land in `/tmp/ptec-shots/`. Filenames are slugified from the path (`/books` → `books.png`).

### 3. Stop the server

```bash
kill $(cat /tmp/dev.pid) 2>/dev/null
# or if you lost the PID:
pkill -f "next dev"
```

## Run (human path)

```bash
npm run dev   # → opens http://localhost:3000 (or 3001/3002 if port taken). Ctrl-C to stop.
```

## Test

```bash
npm test               # Vitest unit tests
npm run test:e2e       # Playwright end-to-end (requires dev server running)
npx vitest run lib/books.test.ts   # single file
```

---

## Gotchas

- **Port 3000 may be occupied by an unrelated server.** On this machine port 3000 is a different static server that returns 200 for `/` but 404 for `/books`. Always detect the port by probing `/books` (returns 200 only from the Next.js app), not `/`. Next.js will be at 3001 or higher in this case.

- **`waitUntil: 'networkidle'` times out.** Next.js dev mode keeps a HMR websocket open permanently, so `networkidle` never fires. The driver uses `domcontentloaded` + a 1.5s hydration wait instead.

- **`/` redirects to `/home`.** The app root issues a 307 to `/home`. Playwright follows redirects automatically, so `screenshot /` lands on `/home`. Curl without `-L` shows 307.

- **Admin login has Cloudflare Turnstile CAPTCHA.** The Turnstile widget is visible in the admin login screenshot (`/admin/login`) but stays in "Verifying..." state headlessly. You can screenshot and inspect the login form, but automated submission is blocked by the CAPTCHA. Admin panel testing requires a valid session cookie.

- **`/admin` redirects to `/admin/login` if unauthenticated.** No direct way to screenshot admin panel pages without an auth cookie.

- **Khmer fonts take a moment.** Page text in Khmer renders as boxes briefly. The 1.5s hydration wait in the driver covers this for screenshots; if you see box characters, increase `waitForTimeout` to 3000ms.

## Troubleshooting

- **`EADDRINUSE` on start**: Another Next.js dev server is running. Run `pkill -f "next dev"` then restart.
- **`Timeout 30000ms exceeded` on screenshot**: The `networkidle` wait caused this in older driver versions; the current driver uses `domcontentloaded`. If you still hit it, increase the timeout in `driver.mjs:51`.
- **404 on all routes except `/`**: You're hitting the wrong port. Re-run the port-detection loop above.
- **Empty book/research lists**: Supabase env vars are missing or wrong. Pages render but show zero results — this is expected if `.env` is not configured.
