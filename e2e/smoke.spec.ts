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
    // en.json catalogs.title — the page h1 (level-scoped: the empty-state h2
    // "The physical library catalog is being prepared" also matches the text).
    await expect(page.getByRole('heading', { level: 1, name: /Physical Library/i })).toBeVisible();
  });

  test('publications page loads', async ({ page }) => {
    await page.goto('/publications');
    await expect(
      page.getByRole('heading', { name: 'Publications', exact: true }),
    ).toBeVisible();
  });

  test('unknown publication slug shows not-found page', async ({ page }) => {
    // Status is 200 because the (public) loading boundary streams the shell
    // before notFound() fires — same behavior as /books/[slug].
    await page.goto('/publications/this-slug-does-not-exist');
    // app/not-found.tsx heading (note the curly apostrophe in "couldn’t").
    await expect(
      page.getByRole('heading', { name: /find that page/i }),
    ).toBeVisible();
  });
});
