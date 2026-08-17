# PTEC e-Library

A free, public e-library web app for Phnom Penh Teacher Education College (PTEC).

## Tech Stack
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase (PostgreSQL + Auth)
- Zima Storage (file storage; Cloudflare R2 remains as a legacy fallback)
- Gemini (AI search and assistant, server-side only)
- next-intl (Khmer/English i18n)

## Prerequisites
- Node.js 18+
- Supabase project (Postgres database)
- Zima Storage credentials (`ZIMA_API_URL`, `ZIMA_API_KEY`)
- Supabase CLI, for running a local stack

## Environment Setup
1. Copy the `.env.example` file to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Fill in the variables in `.env.local`. Every value is documented inline in
   `.env.example` — copy the comments' guidance exactly, since several flags
   fail closed when given an unexpected value.

## Database Migrations

**Never apply migrations by hand in the Supabase dashboard SQL editor.** The
hosted database is owned by CI: `.github/workflows/migrate.yml` dry-runs the
chain on pull requests and applies it on merge to `main`. Applying by hand puts
the hosted schema out of step with the migration chain, which CI cannot detect.

For a local database, start a stack and let the CLI apply the whole chain:

```bash
supabase start
```

Every migration must apply cleanly from the squashed baseline — the `e2e` CI job
boots a fresh stack and replays all of them. See `supabase/MIGRATIONS.md`.

## Local Development
Install dependencies and run the development server:
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

If dev renders become slow, clear the build caches first — `npm run dev:clean`.
This is almost always a stale `.next` rather than a code problem.

## Checks

```bash
npx tsc --noEmit   # type check
npm run lint       # ESLint
npx vitest run     # unit tests (single pass, what CI runs)
npm run test:e2e   # Playwright
```

Architecture, invariants, and the reasoning behind the load-bearing decisions
live in [CLAUDE.md](CLAUDE.md).

## Email / Gmail SMTP Setup

All Supabase auth emails (sign-up confirmation, password reset, magic link) are
sent through a Gmail account via custom SMTP.

### 1 · Enable 2-Step Verification on the sending Gmail account

Gmail App Passwords require 2FA. Visit
`https://myaccount.google.com/security` → **2-Step Verification** → turn on.

### 2 · Generate an App Password

1. Go to `https://myaccount.google.com/apppasswords`
2. Select **Mail** / **Other (custom name)** → name it `PTEC Library`
3. Copy the generated **16-character password** (shown once — store it safely)

### 3 · Set the environment variables

Add these to `.env.local` (local dev) and to Vercel environment variables
(production):

```
SMTP_USER=your-gmail-address@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx   # 16-char App Password, spaces optional
```

### 4 · Local dev (supabase/config.toml)

`supabase/config.toml` already has `[auth.email.smtp]` wired to
`env(SMTP_USER)` / `env(SMTP_PASS)`. Run `supabase start` and the local
instance will send through Gmail.

### 5 · Production (Supabase Dashboard)

`config.toml` only affects the local Supabase CLI instance. For the hosted
project, mirror the settings in:

**Supabase Dashboard → Project Settings → Auth → SMTP Settings**

| Field | Value |
|---|---|
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | `your-gmail@gmail.com` |
| Password | *(16-char App Password)* |
| Sender name | `PTEC Library` |
| Sender email | `your-gmail@gmail.com` |

Then upload the bilingual HTML templates from `supabase/templates/` in
**Dashboard → Authentication → Email Templates** (paste the HTML into each
slot).

### 6 · Limits & migration path

- Gmail free tier: **~500 emails / day** — sufficient for PTEC scale.
- To switch to Resend, SendGrid, or AWS SES later, change only `host`, `port`,
  `user`, and `pass` in `config.toml` (and the Dashboard). No app code changes.

---

## Deployment

Vercel is the primary target: provide every environment variable from
`.env.example` in the project settings. The filesystem is read-only at runtime,
which is why all persistent uploads go to Zima Storage rather than to disk.
`vercel.json` pins functions to `sin1` to sit next to the Supabase instance —
removing it moves them to `iad1` and wrecks TTFB.

The app also ships as a self-hosted Docker image for ZimaOS; see
[docs/ZIMAOS-DEPLOYMENT.md](docs/ZIMAOS-DEPLOYMENT.md). `NEXT_PUBLIC_*` values
are baked at build time, so that image takes them as build args.
