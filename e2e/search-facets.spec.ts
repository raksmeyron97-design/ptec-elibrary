import { test, expect, type Page } from '@playwright/test';

// Faceted search on /search: checking a facet narrows results, updates counts,
// writes the URL (shareable), survives refresh, and the back button undoes it.
// /api/search/native is mocked so the test is deterministic and independent of
// what happens to be in the database; the server-side filtering itself is
// covered by lib/search/facets.test.ts.

type Fixture = ReturnType<typeof buildFixture>;

function buildFixture(langFiltered: boolean) {
  const all = [
    { id: 'b1', ref: 'b1', type: 'book', title: 'Education Basics', author: 'A. Author', coverUrl: null, url: '/books/b1', language: 'English', year: 2023, subject: 'Education', availability: 'Digital' },
    { id: 'b2', ref: 'b2', type: 'book', title: 'Education Advanced', author: 'B. Author', coverUrl: null, url: '/books/b2', language: 'English', year: 2022, subject: 'Education', availability: 'Digital' },
    { id: 'b3', ref: 'b3', type: 'book', title: 'Khmer Education Handbook', author: 'C. Author', coverUrl: null, url: '/books/b3', language: 'Khmer', year: 2023, subject: 'Education', availability: 'Digital' },
  ];
  const results = langFiltered ? all.filter((r) => r.language === 'Khmer') : all;
  return {
    results,
    counts: { book: results.length, research: 0, publication: 0, catalog: 0, post: 0, total: results.length },
    page: 1,
    hasMore: false,
    pageHits: [],
    facetCounts: {
      types: [{ value: 'book', count: results.length, selected: false }],
      subjects: [{ value: 'Education', count: results.length, selected: false }],
      langs: [
        { value: 'English', count: 2, selected: false },
        { value: 'Khmer', count: 1, selected: langFiltered },
      ],
      years: [
        { value: '2023', count: langFiltered ? 1 : 2, selected: false },
        { value: '2022', count: langFiltered ? 0 : 1, selected: false },
      ],
      availability: [{ value: 'Digital', count: results.length, selected: false }],
    },
    relatedSubjects: [],
    popularResources: [],
    sort: 'relevance',
  };
}

async function mockSearchApi(page: Page) {
  await page.route('**/api/search/native**', async (route) => {
    const url = new URL(route.request().url());
    const body: Fixture = buildFixture(url.searchParams.get('lang') === 'Khmer');
    await route.fulfill({ json: body });
  });
  // Keep ancillary widgets quiet so the test only exercises the search flow.
  await page.route('**/api/search/popular', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/books/suggestions**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/departments/trending', (route) => route.fulfill({ json: [] }));
}

/** On mobile the facet panel collapses behind a "Filter" toggle. */
async function openFacetsIfCollapsed(page: Page) {
  const toggle = page.getByTestId('facets-toggle');
  if (await toggle.isVisible()) {
    const expanded = await toggle.getAttribute('aria-expanded');
    if (expanded !== 'true') await toggle.click();
  }
}

test.describe('Search facets', () => {
  test('filtering narrows results, updates counts, survives refresh, back undoes it', async ({ page }) => {
    await mockSearchApi(page);
    await page.goto('/search?q=education');

    // Unfiltered: all three mocked results render.
    await expect(page.locator('article')).toHaveCount(3);

    await openFacetsIfCollapsed(page);
    const khmerBox = page.locator('[data-facet-dim="langs"][data-facet-value="Khmer"]');
    await expect(khmerBox).toBeVisible();

    // Live count next to the facet value.
    const khmerLabel = page.locator('label', { has: khmerBox });
    await expect(khmerLabel).toContainText('1');

    // Check the facet: URL reflects it, results narrow, counts update.
    // (click, not check(): the checkbox is controlled and only flips once the
    // filtered API response lands, which check()'s immediate assertion races)
    await khmerBox.click();
    await expect(page).toHaveURL(/lang=Khmer/);
    await expect(page.locator('article')).toHaveCount(1);
    await expect(page.locator('article')).toContainText('Khmer Education Handbook');
    await expect(khmerBox).toBeChecked();

    // State survives a refresh (same URL is shareable).
    await page.reload();
    await expect(page).toHaveURL(/lang=Khmer/);
    await expect(page.locator('article')).toHaveCount(1);
    await openFacetsIfCollapsed(page);
    await expect(page.locator('[data-facet-dim="langs"][data-facet-value="Khmer"]')).toBeChecked();

    // Back button undoes the filter.
    await page.goBack();
    await expect(page).not.toHaveURL(/lang=Khmer/);
    await expect(page.locator('article')).toHaveCount(3);
  });

  test('a shared filtered URL loads pre-filtered', async ({ page }) => {
    await mockSearchApi(page);
    await page.goto('/search?q=education&lang=Khmer');

    await expect(page.locator('article')).toHaveCount(1);
    await openFacetsIfCollapsed(page);
    await expect(page.locator('[data-facet-dim="langs"][data-facet-value="Khmer"]')).toBeChecked();
  });
});
