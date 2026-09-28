import { test, expect, type Page } from '@playwright/test';

// Phase 9.2 — one search over the digital and the physical library
// (docs/UNIFIED-DISCOVERY.md). /api/search/native is mocked so the test pins
// what the PAGE does with an answer; the ranking and scope rules themselves are
// unit-tested (lib/search/ranking.test.ts, lib/search/facets.test.ts).

const ebook = {
  id: 'e1', ref: 'e1', type: 'book', title: 'Teaching Mathematics', author: 'A. Author', coverUrl: null,
  url: '/books/e1', language: 'English', year: 2023, subjectClass: '370', availability: 'downloadable', format: 'PDF',
  actions: { read: '/books/e1/read', view: '/books/e1' },
};
const print = {
  id: 'p1', ref: 'teaching-mathematics-print', type: 'catalog', title: 'Teaching Mathematics (print)', author: 'B. Author',
  coverUrl: null, url: '/catalogs/teaching-mathematics-print', language: 'English', year: null, subjectClass: '370',
  availability: 'physical_held', format: 'Print', copiesTotal: 3, copiesAvailable: null, ddc: '372.7 TEA',
  actions: { view: '/catalogs/teaching-mathematics-print' },
};
const more = (n: number) => ({
  ...print, id: `p${n}`, ref: `print-${n}`, title: `Mathematics volume ${n}`, url: `/catalogs/print-${n}`,
  actions: { view: `/catalogs/print-${n}` },
});

type Seen = { scope: string | null; type: string | null; page: string | null; class: string | null }[];

async function mockApi(page: Page, seen: Seen) {
  await page.route('**/api/search/native**', async (route) => {
    const url = new URL(route.request().url());
    const scope = url.searchParams.get('scope');
    const type = url.searchParams.get('type');
    const pageNo = url.searchParams.get('page');
    seen.push({ scope, type, page: pageNo, class: url.searchParams.get('class') });
    const physicalOnly = scope === 'physical' || type === 'catalog';
    const page2 = pageNo === '2';
    const results = page2 ? [more(3), more(4)] : physicalOnly ? [print, more(2)] : [print, ebook];
    await route.fulfill({
      json: {
        results,
        counts: { book: physicalOnly ? 0 : 1, research: 0, publication: 0, catalog: 3, learning_path: 0, post: 0, total: physicalOnly ? 3 : 4 },
        page: Number(pageNo ?? 1),
        hasMore: !page2 && !physicalOnly,
        pageHits: [],
        facetCounts: {
          types: [{ value: 'catalog', count: 3, selected: false }, { value: 'book', count: 1, selected: false }],
          classes: [{ value: '370', count: 4, selected: url.searchParams.get('class') === '370' }],
          subjects: [], langs: [], years: [], availability: [],
        },
        relatedSubjects: [], popularResources: [], sort: 'relevance',
        physical: { availabilityLive: false, asOf: null },
        scope: physicalOnly ? 'physical' : scope ?? 'all',
      },
    });
  });
  await page.route('**/api/search/popular', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/books/suggestions**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/departments/trending', (route) => route.fulfill({ json: [] }));
}

async function openFacetsIfCollapsed(page: Page) {
  const toggle = page.getByTestId('facets-toggle');
  if (await toggle.isVisible()) {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
}

test.describe('Unified discovery — one search over both libraries', () => {
  test('All blends both libraries with format badges; a print card sends the reader to the desk', async ({ page }) => {
    const seen: Seen = [];
    await mockApi(page, seen);
    await page.goto('/search?q=mathematics');

    await expect(page.locator('article')).toHaveCount(2);
    const printCard = page.locator('article', { hasText: 'Teaching Mathematics (print)' });
    await expect(printCard).toContainText('Print book');
    await expect(printCard).toContainText('Call no. 372.7 TEA');
    await expect(printCard).toContainText('Ask at the desk for availability');
    await expect(printCard.getByRole('link', { name: 'Where to find it' })).toHaveAttribute('href', /\/catalogs\/teaching-mathematics-print#where$/);
    await expect(page.locator('article', { hasText: 'Teaching Mathematics' }).first()).toBeVisible();
    await expect(page.locator('article').filter({ hasText: 'E-book · PDF' })).toHaveCount(1);
  });

  test('the Physical library scope asks for print only and survives a refresh', async ({ page }) => {
    const seen: Seen = [];
    await mockApi(page, seen);
    await page.goto('/search?q=mathematics');
    await expect(page.locator('article')).toHaveCount(2);

    await page.getByRole('group', { name: 'Search in' }).getByRole('button', { name: /Physical library/ }).click();
    await expect(page).toHaveURL(/scope=physical/);
    await expect(page.getByRole('button', { name: /Physical library/ }).first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('article')).toHaveCount(2);
    expect(seen.at(-1)).toMatchObject({ type: 'catalog' });

    await page.reload();
    await expect(page.getByRole('group', { name: 'Search in' }).getByRole('button', { name: /Physical library/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('an old ?type=catalog link lands in the Physical library', async ({ page }) => {
    await mockApi(page, []);
    await page.goto('/search?q=mathematics&type=catalog');
    await expect(page.getByRole('group', { name: 'Search in' }).getByRole('button', { name: /Physical library/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Load more APPENDS the next page', async ({ page }) => {
    const seen: Seen = [];
    await mockApi(page, seen);
    await page.goto('/search?q=mathematics');
    await expect(page.locator('article')).toHaveCount(2);

    await page.getByRole('button', { name: 'Load more' }).click();
    await expect(page.locator('article')).toHaveCount(4);
    await expect(page.locator('article').first()).toContainText('Teaching Mathematics (print)');
    expect(seen.some((s) => s.page === '2')).toBe(true);
  });

  test('Subject is one DDC class filter over both libraries', async ({ page }) => {
    const seen: Seen = [];
    await mockApi(page, seen);
    await page.goto('/search?q=mathematics');
    // The phone's Filter button appears with the first answer.
    await expect(page.locator('article')).toHaveCount(2);
    await openFacetsIfCollapsed(page);

    const box = page.locator('[data-facet-dim="classes"][data-facet-value="370"]');
    await expect(page.locator('label', { has: box })).toContainText('370 Education & pedagogy');
    await box.click();
    await expect(page).toHaveURL(/class=370/);
    expect(seen.at(-1)?.class).toBe('370');
  });
});
