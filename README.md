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

## Deployment (Vercel)
When deploying to Vercel, ensure you provide all the environment variables from `.env.example` in the Vercel project settings. The filesystem on Vercel is read-only at runtime, which is why Cloudflare R2 is used for all persistent file uploads.
