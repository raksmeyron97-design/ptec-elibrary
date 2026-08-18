import { test, expect, type Page } from '@playwright/test';

// The homepage's information architecture, asserted end-to-end.
//
// This suite exists because the defects it guards were all invisible to unit
// tests and to a production build: they were properties of the ASSEMBLED page.
// Before the rebuild, / rendered eleven bands and 33 resource links resolving
// to 19 distinct resources, with /books/pisa-d appearing four times.
//
// Animations settled, same rationale as e2e/a11y.spec.ts: the hero's rotating
// placeholder fades through near-zero opacity and makes sampled assertions flaky.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const LOCALES = [
  { name: 'English', path: '/' },
  { name: 'Khmer', path: '/km' },
] as const;

/** Top-level homepage bands. Every one is a labelled landmark inside <main>;
 *  the footer's sections sit outside it. */
function sections(page: Page) {
  return page.locator('#main-content section[aria-labelledby]');
}

/** Detail links to a real resource, normalised across locales (/km prefixed). */
async function resourceLinks(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href') ?? '')
      .map((h) => h.replace(/^\/km(?=\/)/, ''))
      .filter((h) => /^\/(books|theses|publications|posts|paths)\/[^/?#]+$/.test(h)),
  );
}

for (const locale of LOCALES) {
  test.describe(`homepage — ${locale.name}`, () => {
    test('renders exactly eight sections', async ({ page }) => {
      await page.goto(locale.path);
      await expect(sections(page)).toHaveCount(8);
    });

    test('no resource appears twice anywhere on the page', async ({ page }) => {
      await page.goto(locale.path);
      // Scroll the whole page: sections below the fold are inside .cv-auto
      // (content-visibility), and their markup must be present regardless.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const links = await resourceLinks(page);
      expect(links.length).toBeGreaterThan(8);
      const duplicates = links.filter((h, i) => links.indexOf(h) !== i);
      expect(duplicates).toEqual([]);
    });

    test('has one h1 and no gaps in the heading order', async ({ page }) => {
      await page.goto(locale.path);
      const levels = await page.evaluate(() =>
        [...document.querySelectorAll('#main-content h1, #main-content h2, #main-content h3')].map(
          (h) => Number(h.tagName[1]),
        ),
      );
      expect(levels.filter((l) => l === 1)).toHaveLength(1);
      expect(levels[0]).toBe(1);
      for (let i = 1; i < levels.length; i++) {
        // A level may drop by any amount but may only climb by one.
        expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
      }
    });

    test('states free, no-account and bilingual above the fold', async ({ page }) => {
      // 360px is the floor this site designs to — most of its readers are on
      // phones, and the reader who most needs to be told the library is free is
      // the one who has never heard of it.
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(locale.path);

      const points = page.getByTestId('hero-trust-points').locator('li');
      await expect(points).toHaveCount(3);

      // Every one must be inside the first viewport, not merely on the page.
      // They used to sit below the hint line, the two secondary links and five
      // trending chips, which pushed them past the fold on a phone.
      for (let i = 0; i < 3; i++) {
        const box = await points.nth(i).boundingBox();
        expect(box, `trust point ${i} has no box`).not.toBeNull();
        expect(box!.y + box!.height, `trust point ${i} is below the fold`).toBeLessThan(800);
      }

      // The bilingual claim is the same string in both catalogues.
      await expect(points.last()).toContainText('English');
    });

    test('shows exactly one statistics block', async ({ page }) => {
      await page.goto(locale.path);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      // data-stat marks a figure; they must all live in one container.
      const containers = await page.evaluate(() => {
        const parents = new Set<Element>();
        document.querySelectorAll('#main-content [data-stat]').forEach((el) => {
          if (el.parentElement) parents.add(el.parentElement);
        });
        return parents.size;
      });
      expect(containers).toBe(1);
    });

    test('never presents a count of one as a headline figure', async ({ page }) => {
      await page.goto(locale.path);
      const figures = await page.evaluate(() =>
        [...document.querySelectorAll('#main-content [data-stat]')].map((el) => ({
          stat: el.getAttribute('data-stat'),
          text: (el.querySelector('dd')?.textContent ?? '').trim(),
        })),
      );
      expect(figures.length).toBeGreaterThan(0);
      // "1 theses" / "1 publications" were real headline stats here.
      expect(figures.map((f) => f.stat)).not.toContain('theses');
      expect(figures.map((f) => f.stat)).not.toContain('publications');
    });

    test('every link on the page resolves', async ({ page, request }) => {
      await page.goto(locale.path);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const hrefs: string[] = await page.evaluate(() =>
        [...new Set(
          [...document.querySelectorAll('a[href]')]
            .map((a) => a.getAttribute('href') ?? '')
            .filter((h) => h.startsWith('/') && !h.startsWith('//')),
        )],
      );
      expect(hrefs.length).toBeGreaterThan(10);

      // One retry per URL, and only an HTTP status counts as broken.
      // `next start` is single-threaded: ~50 full page renders back to back
      // make it drop connections, and a dropped connection is a property of
      // this harness, not of the link. Retrying separates the two — a genuinely
      // missing route returns 404 both times.
      const broken: string[] = [];
      for (const href of hrefs) {
        let status: number | null = null;
        for (let attempt = 0; attempt < 2 && status === null; attempt++) {
          try {
            const res = await request.get(href, { maxRedirects: 5, timeout: 30_000 });
            status = res.status();
          } catch {
            if (attempt === 1) broken.push(`${href} -> request failed twice`);
          }
        }
        if (status !== null && status >= 400) broken.push(`${href} -> ${status}`);
      }
      expect(broken).toEqual([]);
    });
  });
}

test.describe('homepage — behaviour', () => {
  test('the / shortcut focuses the search field', async ({ page }) => {
    await page.goto('/');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).toBe('INPUT');
  });

  test('search submits and lands on the results page', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('#main-content input[type="search"], #main-content input[type="text"]').first();
    await input.click();
    await input.fill('pedagogy');
    await input.press('Enter');
    await page.waitForURL(/\/search\?/);
    expect(page.url()).toContain('q=pedagogy');
  });

  test('every goal card leads to a page that exists', async ({ page, request }) => {
    await page.goto('/');
    const goalLinks: string[] = await page.evaluate(() => {
      const section = document.querySelector('#main-content section[aria-labelledby="goals-title"]');
      return [...(section?.querySelectorAll('ul a[href]') ?? [])].map(
        (a) => a.getAttribute('href') ?? '',
      );
    });
    // Six goals plus the "just browsing" tile.
    expect(goalLinks).toHaveLength(7);
    // The regression: two different goals pointing at one unrelated path.
    expect(new Set(goalLinks).size).toBe(goalLinks.length);
    for (const href of goalLinks) {
      const res = await request.get(href, { maxRedirects: 5 });
      expect(res.status(), href).toBeLessThan(400);
    }
  });

  test('the language switch stays on the homepage', async ({ page }) => {
    await page.goto('/');
    const before = await page.locator('#main-content h1').innerText();
    // <LanguageSwitcher/> is a disclosure: a labelled trigger button, then a
    // button per locale inside the panel. There is one in the desktop navbar
    // and one in the mobile menu, so scope to the visible trigger.
    const trigger = page.getByRole('button', { name: /language|ភាសា/i }).filter({ visible: true }).first();
    await trigger.click();
    await page.getByRole('button', { name: 'ខ្មែរ', exact: true }).filter({ visible: true }).first().click();
    await page.waitForURL(/\/km\/?$/);
    expect(new URL(page.url()).pathname.replace(/\/$/, '')).toBe('/km');
    const after = await page.locator('#main-content h1').innerText();
    expect(after).not.toBe(before);
  });

  test('keyboard traversal reaches the footer without a trap', async ({ page }) => {
    await page.goto('/');
    let reachedFooter = false;
    for (let i = 0; i < 220 && !reachedFooter; i++) {
      await page.keyboard.press('Tab');
      reachedFooter = await page.evaluate(
        () => !!document.activeElement?.closest('footer'),
      );
    }
    expect(reachedFooter).toBe(true);
  });

  test('serves the full page in the HTML, without JavaScript', async ({ browser, baseURL }) => {
    // baseURL must be passed explicitly: a context created from `browser`
    // rather than from the page fixture does not inherit the project's.
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    await page.goto('/');

    // What is asserted here is PRESENCE, not visibility, and the distinction is
    // deliberate.
    //
    // Every public route owns a loading.tsx (33 of them). That Suspense
    // boundary makes Next emit the skeleton inside <main> and stream the real
    // content into a trailing `<div hidden>`, which an inline script swaps in.
    // With JavaScript off the swap never runs, so the whole page is in the DOM
    // and none of it is painted — on this route and on every other public one.
    //
    // That is architectural and predates this work, so this test pins the
    // guarantee that actually holds today: the markup a text-extracting
    // consumer reads — a crawler, a reader-mode, a translation proxy — is
    // complete. If the loading boundaries are ever reworked, tighten this to
    // assert visibility and it will start passing for the right reason.
    const html = await page.content();
    expect(html).toContain('id="main-content"');

    expect(await page.locator('h1').count()).toBe(1);
    expect(await page.locator('h1').textContent()).toBeTruthy();
    expect(await page.locator('section[aria-labelledby]').count()).toBeGreaterThanOrEqual(8);

    const links = await resourceLinks(page);
    expect(links.length).toBeGreaterThan(8);
    expect(new Set(links).size).toBe(links.length);

    await context.close();
  });

  test('emits FAQPage and ItemList structured data, and no duplicate WebSite node', async ({ page }) => {
    await page.goto('/');
    const types = await page.evaluate(() =>
      [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((s) => {
        const parsed = JSON.parse(s.textContent ?? '{}');
        const nodes = parsed['@graph'] ?? [parsed];
        return nodes.map((n: { '@type': string }) => n['@type']);
      }),
    );
    expect(types).toContain('FAQPage');
    expect(types).toContain('ItemList');
    // The institutional nodes are emitted once, site-wide, in RootShell.
    expect(types.filter((t) => t === 'WebSite')).toHaveLength(1);
    expect(types.filter((t) => t === 'Library')).toHaveLength(1);
  });
});
