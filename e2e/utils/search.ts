import { expect, type Page } from '@playwright/test';

/**
 * Search the way a reader does once /search has loaded: type into the field
 * and press Enter.
 *
 * Since Phase 9.3 a DOCUMENT load of `/search?q=…` renders its first page on
 * the server, from the database — a Playwright mock of /api/search/native never
 * sees it. Everything after that first load is a client-side navigation, and
 * the client still searches through the API. A spec that pins what the PAGE
 * does with an answer therefore opens /search without a query (the server has
 * nothing to render) and enters it here, so the mock answers.
 *
 * `from` may carry parameters the search should keep (a scope, a filter):
 * the field's navigation keeps everything in the address but the page number.
 */
export async function searchFromTheField(page: Page, query: string, from = '/search') {
  await page.goto(from);
  const field = page.getByRole('combobox', { name: 'Search the PTEC Library' });
  // The field is interactive only once hydrated; before that Enter would
  // submit the no-JavaScript GET form — a document load the mock never sees.
  await expect(field).toBeEditable();
  await page.waitForFunction(() => document.querySelector('input[name="q"]')?.closest('form')?.querySelector('button[type="submit"]')?.hasAttribute('disabled'));
  await field.fill(query);
  await field.press('Enter');
  await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(query)}`));
}
