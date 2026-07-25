import { test, expect } from '@playwright/test';

// These run against the fresh local Supabase stack the e2e CI job boots (all
// migrations, including 0111, applied). They assert on structure that holds
// whether or not any paths have been seeded, so they stay stable on an empty DB.
test.describe('Learning Paths — public catalogue', () => {
  test('renders the hero and is server-rendered', async ({ page }) => {
    await page.goto('/paths');
    // paths.h1 — the page's single level-1 heading.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Eyebrow is server-rendered (discoverable without JS).
    await expect(page.getByText(/Teacher Learning Paths/i).first()).toBeVisible();
  });

  test('a draft/unknown path slug is not publicly reachable', async ({ page }) => {
    await page.goto('/paths/this-path-does-not-exist');
    await expect(page.getByRole('heading', { name: /find that page/i })).toBeVisible();
  });

  test('Khmer catalogue renders under /km', async ({ page }) => {
    await page.goto('/km/paths');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
