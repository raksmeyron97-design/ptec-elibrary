import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// WCAG 2.1 A/AA regression gate. Scans the core discovery loop — a user
// searching, opening a book, and reading a thesis — plus the homepage as the
// front door. Detail-page tests navigate via the first real card link instead
// of a hardcoded slug, so this suite doesn't depend on specific seed data.
//
// Only real violations fail the test — "incomplete" results (axe couldn't
// determine pass/fail, e.g. color contrast behind a gradient) are logged but
// not asserted on, matching axe-core's own recommendation to triage those
// manually rather than block CI on false positives.

async function expectNoViolations(page: import('@playwright/test').Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  if (results.violations.length > 0) {
    const fs = await import('fs');
    fs.writeFileSync(`/tmp/axe-${name}.json`, JSON.stringify(results.violations, null, 2));
  }
  expect(results.violations).toEqual([]);
}

test.describe('Accessibility (axe-core, WCAG 2.1 A/AA)', () => {
  test('homepage', async ({ page }) => {
    await page.goto('/home');
    await expectNoViolations(page, 'homepage');
  });

  test('search page', async ({ page }) => {
    await page.goto('/search?q=education');
    await page.waitForLoadState('networkidle').catch(() => {});
    await expectNoViolations(page, 'search');
  });

  test('books listing page', async ({ page }) => {
    await page.goto('/books');
    await expectNoViolations(page, 'books-listing');
  });

  test('book detail page', async ({ page }) => {
    await page.goto('/books');
    const firstBook = page.locator('a[href^="/books/"]').first();
    if ((await firstBook.count()) === 0) test.skip(true, 'No books in this environment');
    await firstBook.click();
    await page.waitForLoadState('domcontentloaded');
    await expectNoViolations(page, 'book-detail');
  });

  test('thesis detail page', async ({ page }) => {
    await page.goto('/theses');
    const firstThesis = page.locator('a[href^="/theses/"]').first();
    if ((await firstThesis.count()) === 0) test.skip(true, 'No theses in this environment');
    await firstThesis.click();
    await page.waitForLoadState('domcontentloaded');
    await expectNoViolations(page, 'thesis-detail');
  });
});
