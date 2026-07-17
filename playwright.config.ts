/* eslint-disable @typescript-eslint/no-unused-vars */
import { defineConfig, devices } from '@playwright/test';
import path from 'path';

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
    env: { ...(process.env as Record<string, string>), SEO_INDEXING: 'on' },
  },
});
