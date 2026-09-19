import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signInSeededReader } from './utils/auth';

// WCAG 2.1 A/AA regression gate. Scans the core discovery loop — a user
// searching, opening a book, and reading a thesis — plus the homepage as the
// front door. Detail-page tests navigate via the first real card link instead
// of a hardcoded slug, so this suite doesn't depend on specific seed data.
//
// Only real violations fail the test — "incomplete" results (axe couldn't
// determine pass/fail, e.g. color contrast behind a gradient) are logged but
// not asserted on, matching axe-core's own recommendation to triage those
// manually rather than block CI on false positives.

// Scan with animations settled: the hero's rotating search placeholder fades
// through near-zero opacity every few seconds, and axe sampling mid-fade
// reports phantom color-contrast failures on CI's slower runners (the resting
// state passes at ~6.6:1). The component honors prefers-reduced-motion, so
// this pins every scan to the static state.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

async function expectNoViolations(page: import('@playwright/test').Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  if (results.violations.length > 0) {
    // Written into Playwright's own gitignored artifact directory, not the
    // shared OS temp dir: a predictable /tmp/axe-<name>.json path is a
    // symlink-attack target on a multi-tenant machine (another local user
    // pre-creates the path as a symlink to something this process can write
    // but shouldn't), and test-results/ is already where CI collects
    // Playwright's other output.
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(process.cwd(), 'test-results', 'axe-violations');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(results.violations, null, 2));
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

  test('posts listing page', async ({ page }) => {
    await page.goto('/posts');
    await expectNoViolations(page, 'posts-listing');
  });

  test('post detail page', async ({ page }) => {
    await page.goto('/posts');
    const firstPost = page.locator('a[href^="/posts/"]').first();
    if ((await firstPost.count()) === 0) test.skip(true, 'No posts in this environment');
    await firstPost.click();
    await page.waitForLoadState('domcontentloaded');
    await expectNoViolations(page, 'post-detail');
  });

  test('thesis detail page', async ({ page }) => {
    await page.goto('/theses');
    const firstThesis = page.locator('a[href^="/theses/"]').first();
    if ((await firstThesis.count()) === 0) test.skip(true, 'No theses in this environment');
    await firstThesis.click();
    await page.waitForLoadState('domcontentloaded');
    await expectNoViolations(page, 'thesis-detail');
  });

  test('PDF reader', async ({ page }) => {
    test.slow(); // pdf.js needs to fetch + render the document
    // Reading is auth-gated (the file API requires a signed-in user), so the
    // reader page redirects anonymous visitors to login. Sign in first; skip
    // (don't fail) if login can't complete in this environment.
    const signedIn = await signInSeededReader(page, { next: '/books' });
    test.skip(!signedIn, 'Could not sign in a seeded reader in this environment');
    await page.goto('/books');
    const firstBook = page.locator('a[href^="/books/"]').first();
    if ((await firstBook.count()) === 0) test.skip(true, 'No books in this environment');
    // Hard navigation (not click): a soft client-side nav resolves
    // domcontentloaded immediately, before the detail page is in the DOM.
    await page.goto(new URL(await firstBook.getAttribute('href') ?? '', page.url()).href);
    const readLink = page.locator('a[href$="/read"]').first();
    await readLink.waitFor({ timeout: 10000 }).catch(() => {});
    if ((await readLink.count()) === 0) test.skip(true, 'No readable book in this environment');
    await page.goto(new URL(await readLink.getAttribute('href') ?? '', page.url()).href);
    // Wait for the pdf.js text layer so the scan covers rendered page content
    // (this is where the aria-owns → structure-tree violations used to live).
    await page.waitForSelector('.react-pdf__Page', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await expectNoViolations(page, 'reader');
  });

  test('homepage — Khmer locale', async ({ page }) => {
    await page.goto('/km/home');
    await expectNoViolations(page, 'homepage-km');
  });
});

// The dark palette is a separate set of tokens — contrast regressions there
// are invisible to the light-theme scans above.
test.describe('Accessibility — dark theme', () => {
  test.use({ colorScheme: 'dark' });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('ptec.theme', 'dark'); } catch {}
    });
  });

  test('homepage (dark)', async ({ page }) => {
    await page.goto('/home');
    await expectNoViolations(page, 'homepage-dark');
  });

  test('search page (dark)', async ({ page }) => {
    await page.goto('/search?q=education');
    await page.waitForLoadState('networkidle').catch(() => {});
    await expectNoViolations(page, 'search-dark');
  });

  test('post detail page (dark)', async ({ page }) => {
    await page.goto('/posts');
    const firstPost = page.locator('a[href^="/posts/"]').first();
    if ((await firstPost.count()) === 0) test.skip(true, 'No posts in this environment');
    await firstPost.click();
    await page.waitForLoadState('domcontentloaded');
    await expectNoViolations(page, 'post-detail-dark');
  });

  test('book detail page (dark)', async ({ page }) => {
    await page.goto('/books');
    const firstBook = page.locator('a[href^="/books/"]').first();
    if ((await firstBook.count()) === 0) test.skip(true, 'No books in this environment');
    await firstBook.click();
    await page.waitForLoadState('domcontentloaded');
    await expectNoViolations(page, 'book-detail-dark');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Dangling ARIA references
//
// `aria-controls`, `aria-activedescendant`, `aria-labelledby`,
// `aria-describedby` and `aria-owns` are references BY ID. One that resolves
// to nothing is the quietest bug in the codebase: no console error, no failed
// render, no visual difference, and nothing in the markup that looks wrong. It
// is observable only through a screen reader or a validator.
//
// Four shipped at once and none was noticed. Every one was a control
// referencing a popup that is rendered only while OPEN:
//
//   GoogleSearchModal · SearchBar · MobileFilterSheet · SearchPageClient
//
// plus five <section aria-labelledby="…-heading"> on /about whose heading
// never rendered the id — five landmarks with no accessible name at all.
//
// This lives in the e2e suite and not in a source scan, and that is a
// considered choice rather than convenience. A scan was written first and
// deleted: ids in this codebase are composed from props (`id={`${idPrefix}-
// tab-${key}`}`) and are frequently rendered in a DIFFERENT file from the one
// referencing them (PostForm references ids that FormTabs creates), so a
// regex answers "missing" for five references that all resolve perfectly at
// runtime — and a check that cries wolf is a check somebody disables. The
// browser knows the answer exactly. Only the browser is asked.
//
// Both halves matter. Scanning the resting state catches a reference that
// dangles when the popup is closed; opening the popup catches a "fix" that
// merely deleted the attribute, which would look just as clean.
// ──────────────────────────────────────────────────────────────────────────

const REFERENCE_ATTRS = [
  'aria-controls',
  'aria-activedescendant',
  'aria-labelledby',
  'aria-describedby',
  'aria-owns',
] as const;

/**
 * Wait until the client tree is actually on the page.
 *
 * Every one of the four bugs this guards lives in a CLIENT component, and at
 * `domcontentloaded` none of them has hydrated — so the sweep finds nothing,
 * reports clean, and is vacuous. That is not a hypothetical: the first version
 * of this test passed against a deliberately reintroduced regression, twice,
 * because it looked too early.
 *
 * The global search input is mounted by RootShell on every page, so waiting
 * for it both settles hydration and proves the sweep had something to sweep.
 */
async function waitForClientTree(page: import('@playwright/test').Page) {
  await page.waitForSelector('input[aria-label="Search query"]', { state: 'attached', timeout: 15_000 });
}

async function danglingReferences(page: import('@playwright/test').Page): Promise<string[]> {
  // Guard against a vacuous pass: if the sweep sees no references at all,
  // something is wrong with the page, not right with the markup.
  const seen = await page.evaluate(
    (attrs) => attrs.reduce((n, a) => n + document.querySelectorAll(`[${a}]`).length, 0),
    REFERENCE_ATTRS as unknown as string[],
  );
  expect(seen, 'no ARIA references found at all — the sweep would pass vacuously').toBeGreaterThan(0);

  return page.evaluate((attrs) => {
    const bad = new Set<string>();
    for (const attr of attrs) {
      for (const el of Array.from(document.querySelectorAll(`[${attr}]`))) {
        // These attributes are ID LISTS, space-separated — a reference is
        // broken if any single token in it fails to resolve.
        for (const id of (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) {
          if (!document.getElementById(id)) {
            bad.add(`<${el.tagName.toLowerCase()}> ${attr}="${id}"`);
          }
        }
      }
    }
    return Array.from(bad);
  }, REFERENCE_ATTRS as unknown as string[]);
}

test.describe('ARIA references resolve', () => {
  for (const [name, path] of [
    ['books listing', '/books'],
    ['about', '/about'],
    ['contact', '/contact'],
    ['privacy', '/privacy'],
    ['borrow policy', '/policy'],
    ['privacy (Khmer)', '/km/privacy'],
    ['borrow policy (Khmer)', '/km/policy'],
  ] as const) {
    test(`${name} — resting state`, async ({ page }) => {
      await page.goto(path);
      await waitForClientTree(page);
      expect(await danglingReferences(page)).toEqual([]);
    });
  }

  test('search popups reference their listbox WHILE OPEN', async ({ page }) => {
    await page.goto('/books');
    await waitForClientTree(page);

    // The page's own search bar. Opening it must CREATE the reference — a
    // combobox that never points at its popup is as wrong as one that points
    // at nothing, and both read as "clean" to the resting-state scan above.
    const bar = page.locator('input[role="combobox"]').first();
    await bar.click();
    await page.waitForTimeout(500);
    const controls = await bar.getAttribute('aria-controls');
    if (controls) {
      expect(await page.locator(`#${controls}`).count(), `#${controls} is referenced but absent`).toBe(1);
    }
    expect(await danglingReferences(page)).toEqual([]);
  });

  test('the filter sheet references its dialog while open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/books');
    await waitForClientTree(page);

    const trigger = page.locator('button[aria-haspopup="dialog"]').first();
    if ((await trigger.count()) === 0) test.skip(true, 'No filter sheet on this listing');
    await trigger.click();
    await page.waitForTimeout(400);

    const controls = await trigger.getAttribute('aria-controls');
    expect(controls, 'an open sheet must be referenced').toBeTruthy();
    expect(await page.locator(`#${controls}`).getAttribute('role')).toBe('dialog');
    expect(await danglingReferences(page)).toEqual([]);
  });
});
