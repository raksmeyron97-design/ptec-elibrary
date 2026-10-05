import { test, expect } from '@playwright/test';

/**
 * The Physical Library's librarian review (docs/CATALOG-REVIEW.md) is staff
 * only: the queue and the workspace both sit behind the (protected) admin
 * layout, and neither may leak a record or a review state to a visitor.
 *
 * This suite has no authenticated-admin fixture (nothing in e2e/ does — the CI
 * seed holds no MFA factor), so the signed-in behaviour — language-scoped
 * queues, Save & next, claims, verification — is covered offline by
 * lib/catalogs/review.test.ts and lib/catalogs/review-boundary.test.ts, and was
 * driven in a browser against the local stack when the slice was built.
 */

const REVIEW_ROUTES = [
  '/admin/catalogs/review',
  '/admin/catalogs/review?language=km',
  '/admin/catalogs/review?language=en&status=verified',
  '/admin/catalogs/review/00000000-0000-4000-8000-000000000000?language=km',
  '/admin/catalogs/review/duplicates?language=en',
];

test.describe('catalog review is not reachable without a session', () => {
  for (const route of REVIEW_ROUTES) {
    test(`${route} sends an anonymous visitor to the admin login`, async ({ page }) => {
      const response = await page.goto(route);

      // Assert on the landing URL rather than the status: a redirect chain can end in a 200.
      await expect(page).toHaveURL(/\/admin\/login/);
      expect(response?.status()).toBeLessThan(500);

      const body = await page.content();
      expect(body).not.toContain('Verify &amp; next');
      expect(body).not.toContain('Catalog review');
    });
  }
});
