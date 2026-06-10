# PTEC e-Library

A free, public e-library web app for Phnom Penh Teacher Education College (PTEC).

## Tech Stack
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase (PostgreSQL + Auth)
- Cloudflare R2 (File Storage)
- next-intl (Khmer/English i18n)

## Prerequisites
- Node.js 18+
- Supabase Project (Postgres database)
- Cloudflare R2 Bucket

## Environment Setup
1. Copy the `.env.example` file to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Fill in all the variables in `.env.local` using your Supabase and Cloudflare credentials.

## Database Migrations
To set up a fresh Supabase project, execute the SQL migration scripts located in `supabase/migrations/` sequentially from top to bottom.
This will set up all required tables, triggers, and Row Level Security (RLS) policies.

## Local Development
Install dependencies and run the development server:
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

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

## Deployment (Vercel)
When deploying to Vercel, ensure you provide all the environment variables from `.env.example` in the Vercel project settings. The filesystem on Vercel is read-only at runtime, which is why Cloudflare R2 is used for all persistent file uploads.
