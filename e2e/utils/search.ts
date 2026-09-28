import { expect, type Page } from '@playwright/test';

/**
 * The /search field, by role. Never `input[name="q"]`: while the server streams
 * the first page (Phase 9.3) the document briefly holds TWO fields — the
 * visible "searching" fallback and the real page, still inside React's hidden
 * streaming container — and a CSS locator counts both (a strict-mode
 * violation that fails the first attempt and passes the retry). A role query
 * sees only what is accessible, which is the one field a reader sees.
 */
export const searchField = (page: Page) => page.getByRole('combobox', { name: 'Search the PTEC Library' });

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
  const field = searchField(page);
  // The field is interactive only once hydrated; before that Enter would
  // submit the no-JavaScript GET form — a document load the mock never sees.
  // ONE field (the streamed page has replaced its fallback) whose empty
  // submit button has been disabled (only hydration does that).
  await expect(field).toBeEditable();
  await page.waitForFunction(() => {
    const fields = document.querySelectorAll('input[name="q"]');
    return fields.length === 1 && Boolean(fields[0].closest('form')?.querySelector('button[type="submit"]')?.hasAttribute('disabled'));
  });
  await field.fill(query);
  await field.press('Enter');
  await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(query)}`));
}
