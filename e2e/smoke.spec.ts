import { test, expect } from '@playwright/test';

test.describe('PTEC Library Smoke Tests', () => {
  test('homepage has expected elements', async ({ page }) => {
    await page.goto('/');

    // Check title contains 'PTEC'
    await expect(page).toHaveTitle(/PTEC/);

    // Should have a link to books/catalogue
    const browseLink = page.getByRole('link', { name: /Browse|Books/i }).first();
    await expect(browseLink).toBeAttached();
  });

  test('catalogs page loads', async ({ page }) => {
    await page.goto('/catalogs');
    await expect(page.getByRole('heading', { name: /Books In Library/i })).toBeVisible();
  });
});
