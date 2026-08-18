import { test, expect } from '@playwright/test';

test.describe('PTEC Library Smoke Tests', () => {
  test('homepage has expected elements', async ({ page }) => {
    await page.goto('/');

    // The homepage title deliberately does NOT contain the brand.
    //
    // Google's site-names feature renders the brand above the title on
    // homepage results, sourced from the WebSite JSON-LD node — so the title
    // spends all its characters on the mission line, and the "· PTEC Library"
    // suffix every other route carries is escaped here with `title.absolute`.
    // Asserting /PTEC/ on this title would lock in the thing that was removed.
    //
    // What must hold is that the brand is still declared, in the two places
    // that feature actually reads.
    await expect(page).toHaveTitle(/Digital Library/);
    await expect(page).not.toHaveTitle(/· PTEC Library/);

    const brand = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .flatMap((s) => {
          const parsed = JSON.parse(s.textContent ?? '{}');
          return parsed['@graph'] ?? [parsed];
        });
      const site = nodes.find((n: { '@type': string }) => n['@type'] === 'WebSite');
      return {
        jsonLd: site?.name as string | undefined,
        og: document
          .querySelector('meta[property="og:site_name"]')
          ?.getAttribute('content') ?? undefined,
      };
    });
    // These two must be identical, or the site-names feature does not fire.
    expect(brand.jsonLd).toBe('PTEC Library');
    expect(brand.og).toBe(brand.jsonLd);

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
