/* eslint-disable @typescript-eslint/no-unused-vars */
import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

// The test PROCESS (not just the dev server it starts) needs the Supabase URL
// and anon key: e2e/utils/auth.ts asks the local GoTrue for a real session and
// installs it as a cookie, which is how auth-gated specs get a signed-in page
// without driving the captcha-gated login form. Next loads .env.local for the
// server; nothing loads it here, so do it explicitly. Existing process env
// wins — CI passes real values in.
dotenv.config({ path: path.resolve(__dirname, '.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    // e2e asserts PRODUCTION-shaped SEO output (robots.txt, sitemap, meta
    // robots). Local/CI servers are non-indexable by default (opt-in policy,
    // lib/seo/indexing.ts), so force the indexable branch for the suite; the
    // non-indexable defaults are covered by lib/seo/indexing.test.ts.
    //
    // Cloudflare's "always passes" Turnstile TEST site key so the login form's
    // captcha auto-succeeds under Playwright — this is the documented CI key,
    // not a secret, and the local Supabase GoTrue has captcha disabled so the
    // token is accepted. Lets e2e exercise the real authenticated path (e.g.
    // the auth-gated PDF reader) without a bespoke session-cookie hack.
    env: {
      ...(process.env as Record<string, string>),
      SEO_INDEXING: 'on',
      // The assistant answers from a deterministic stand-in model
      // (lib/ai/mock-model.ts) rather than a billed provider. Without it, a
      // developer running this suite locally would spend real Gemini calls,
      // and CI — which has no key at all — could not reach any AI surface.
      AI_MOCK_PROVIDER: process.env.AI_MOCK_PROVIDER || '1',
      // One seeded reader asks every assistant question in the suite, across
      // two browser projects and up to two retries. The real 10/day quota is
      // spent before the run is half done, and the quota notice is
      // indistinguishable from a broken answer.
      AI_DAILY_USER_LIMIT: process.env.AI_DAILY_USER_LIMIT || '500',
      // Tests run back to back as one user, so every second request lands
      // inside the 5s burst window and is answered "slow down".
      AI_COOLDOWN_MS: process.env.AI_COOLDOWN_MS || '0',
      NEXT_PUBLIC_TURNSTILE_SITE_KEY:
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA',
    },
  },
});
