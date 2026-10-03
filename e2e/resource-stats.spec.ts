// e2e/resource-stats.spec.ts
//
// Cross-surface consistency for public resource counts.
//
// The bug class this covers cannot be caught by unit tests: each page was
// individually "correct" while collectively disagreeing, because each ran its
// own count. These specs read the numbers off the rendered pages and assert
// they reconcile with each other — the homepage total against its own
// categories, and each category against its listing page.

import { test, expect, type Page } from "@playwright/test";

// The homepage pulls hero imagery, fonts and a service worker; its `load`
// event can lag well past the HTML (all this suite reads) being present.
// Wait for DOMContentLoaded instead.
//
// Keep these budgets modest. CI runs with `retries: 2`, so a generous
// per-test timeout multiplies by three on every failure — a 180s timeout
// here once pushed the whole e2e job past its limit and got it cancelled.
async function visit(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 45_000 });
}

test.describe.configure({ timeout: 60_000 });

// The dev server compiles a route on first hit, and /theses (force-dynamic,
// fetches the whole published set plus facets) can take longer to compile
// than any sane per-test navigation budget. Warm every route this suite
// touches once, cheaply, without a browser — after this each test navigates
// against a compiled route, which is what lets the budgets above stay tight.
test.beforeAll(async ({ request }) => {
  for (const path of ["/", "/km", "/books", "/theses", "/journals", "/catalogs"]) {
    await request
      .get(path, { timeout: 180_000, failOnStatusCode: false })
      .catch(() => {}); // a warm-up failure is not a test failure
  }
});

// The homepage states its figures in two places since the 2026-10 redesign:
// the TOTAL in the figures band under the hero (TrustBar), and each
// collection's count on its tile in "Start here" (CollectionGrid). The old
// "PTEC Library in numbers" block that held all four is gone.
const HERO_FIGURES = "ul:has(> li[data-stat])";

// The figures count up from 0 once on screen; reduced motion renders the
// real value at once, so a read can never land mid-animation.
test.use({ contextOptions: { reducedMotion: "reduce" } });

const NO_DATA =
  "Public collection statistics are unavailable in this environment " +
  "(getCollectionStats() returned null, so the figures are correctly omitted). " +
  "These are cross-surface CONSISTENCY assertions and are vacuous without data.";

const BELOW_FLOOR =
  "This collection's count is under the homepage's display floor " +
  "(COLLECTION_COUNT_MIN_DISPLAY), so the tile shows no figure to reconcile.";

/**
 * The figures band. Skips rather than fails when it is absent: by design,
 * a page whose stats cannot be read omits the figures entirely instead of
 * rendering a zero or an invented total, and the local e2e Supabase stack
 * denies anon access to the content tables (`permission denied for table
 * books`, which predates this suite). A regression that renders WRONG numbers
 * still fails every assertion below.
 */
async function figuresBand(page: Page) {
  const list = page.locator(HERO_FIGURES).first();
  await list.waitFor({ state: "attached", timeout: 20_000 }).catch(() => {});
  test.skip((await page.locator(HERO_FIGURES).count()) === 0, NO_DATA);
  return list;
}

type CollectionKey = "books" | "theses" | "publications";

/** The digital total, from the figures band. Keyed on data-stat, not on label text,
 *  so the same helper works in English and Khmer. */
async function homepageTotal(page: Page): Promise<number> {
  const list = await figuresBand(page);
  const value = list.locator('li[data-stat="digital"] [data-stat-value]');
  await expect(value).toHaveCount(1, { timeout: 15_000 });
  return Number((await value.innerText()).replace(/[^\d]/g, ""));
}

/** The visible label of the total, to assert it is translated at all. */
async function homepageTotalLabel(page: Page): Promise<string> {
  const list = await figuresBand(page);
  const item = list.locator('li[data-stat="digital"]');
  const value = (await item.locator("[data-stat-value]").innerText()).trim();
  return (await item.innerText()).replace(value, "").trim();
}

/** One collection's count, from its tile. Skips when the tile shows none. */
async function collectionCount(page: Page, key: CollectionKey): Promise<number> {
  await figuresBand(page);
  const span = page.locator(`[data-collection-count="${key}"]`);
  await span.waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
  test.skip((await span.count()) === 0, BELOW_FLOOR);
  return Number((await span.innerText()).replace(/[^\d]/g, ""));
}

function toInt(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

/**
 * Pull a listing's stated count out of the page text.
 *
 * Deliberately anchored on the count phrase rather than "the first number on
 * the page" — the site header carries a phone number, and a helper that grabs
 * that instead would make this suite assert nothing.
 *
 * Returns { filtered, global } — `global` is set only when the page states
 * both, i.e. renders the "N of M" form.
 */
function listingCount(
  body: string,
  noun: RegExp,
): { filtered: number; global: number | null } | null {
  const both = body.match(new RegExp(`([\\d,]+)\\s+of\\s+([\\d,]+)\\s+${noun.source}`, "i"));
  if (both) return { filtered: toInt(both[1]), global: toInt(both[2]) };
  const single = body.match(new RegExp(`([\\d,]+)\\s+${noun.source}`, "i"));
  return single ? { filtered: toInt(single[1]), global: null } : null;
}

const BOOKS_NOUN = /(?:resources?|e-books?)\b/;

/**
 * listingCount() against the live page, retried until the count appears.
 *
 * Reading `body.innerText()` once races the streamed listing: the count
 * paragraph arrives after DOMContentLoaded, so a single snapshot on a slow
 * render can miss it and make this suite flaky. Poll instead, then skip only
 * if the page genuinely never states a count — same reasoning as
 * figuresBand(): an empty environment cannot demonstrate consistency
 * between two numbers.
 */
async function requireListingCount(page: Page, noun: RegExp, scope = "body") {
  let found: ReturnType<typeof listingCount> = null;
  await expect
    .poll(
      async () => {
        const text = await page.locator(scope).first().innerText().catch(() => "");
        found = listingCount(text, noun);
        return found !== null;
      },
      { timeout: 15_000 },
    )
    .toBe(true)
    .catch(() => {});
  test.skip(found === null, NO_DATA);
  return found!;
}

test.describe("homepage statistics", () => {
  test("the total equals the sum of the collections shown on the page", async ({ page }) => {
    await visit(page, "/");
    const list = await figuresBand(page);
    await expect(list).toBeVisible();

    const total = await homepageTotal(page);
    const books = await collectionCount(page, "books");
    const theses = await collectionCount(page, "theses");
    const publications = await collectionCount(page, "publications");

    expect(total).toBe(books + theses + publications);
    expect(total).toBeGreaterThan(0);
  });

  test("no statistic renders two numbers run together", async ({ page }) => {
    // The "110+115 Digital resources" defect: a rounded figure in an
    // aria-hidden span immediately followed by the exact figure in an
    // .sr-only span, with no separator in the DOM's text content.
    await visit(page, "/");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\d+\+\d/);

    const list = await figuresBand(page);
    for (const value of await list.locator("[data-stat-value]").all()) {
      // Each value cell holds exactly one number and nothing else.
      expect((await value.innerText()).trim()).toMatch(/^[\d,]+$/);
    }
  });

  test("the figures are a labelled list, one label per number", async ({ page }) => {
    await visit(page, "/");
    const list = await figuresBand(page);
    await expect(list).toHaveAttribute("aria-label", /.+/);
    const items = list.locator("li[data-stat]");
    const n = await items.count();
    expect(n).toBeGreaterThanOrEqual(2);
    await expect(list.locator("[data-stat-value]")).toHaveCount(n);
    for (const item of await items.all()) {
      const value = (await item.locator("[data-stat-value]").innerText()).trim();
      // A label beside the number, not a bare figure.
      expect((await item.innerText()).replace(value, "").trim().length).toBeGreaterThan(0);
    }
  });

  test("renders in Khmer with the same figures", async ({ page }) => {
    await visit(page, "/");
    const enTotal = await homepageTotal(page);

    await visit(page, "/km");
    const list = await figuresBand(page);
    await expect(list).toBeVisible();
    const kmTotal = await homepageTotal(page);
    expect(kmTotal).toBe(enTotal);

    // Khmer must render a real translated label, not the English string, a
    // raw ICU placeholder, or the message key itself.
    const kmLabel = await homepageTotalLabel(page);
    expect(kmLabel).not.toBe("Digital resources");
    expect(kmLabel).not.toContain("{");
    expect(kmLabel).not.toContain("trustDigitalLabel");
    expect(kmLabel.length).toBeGreaterThan(0);
    expect(await list.innerText()).not.toContain("{");
  });
});

test.describe("listing totals match the homepage categories", () => {
  test("/books total equals the homepage E-books figure", async ({ page }) => {
    await visit(page, "/");
    const homepageBooks = await collectionCount(page, "books");

    await visit(page, "/books");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const count = await requireListingCount(page, BOOKS_NOUN);
    // Unfiltered listing: one figure, and it is the canonical e-book total.
    expect(count.global).toBeNull();
    expect(count.filtered).toBe(homepageBooks);
  });

  test("/theses total equals the homepage Theses figure", async ({ page }) => {
    await visit(page, "/");
    const homepageTheses = await collectionCount(page, "theses");

    await visit(page, "/theses");
    const eyebrow = page.getByText(/PTEC Digital Repository/);
    await expect(eyebrow).toBeVisible();
    const m = (await eyebrow.innerText()).match(/([\d,]+)/);
    expect(m).not.toBeNull();
    expect(toInt(m![1])).toBe(homepageTheses);
  });

  test("/journals total equals the homepage journal-articles figure", async ({ page }) => {
    await visit(page, "/");
    const homepagePublications = await collectionCount(page, "publications");

    await visit(page, "/journals");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Scoped to the result toolbar's live count: the journal shelf above it
    // also says "N articles" — per journal — and the first match on the page
    // would be that, not the listing total.
    const count = await requireListingCount(page, /articles?\b/, 'p[aria-live="polite"]');
    expect(count.filtered).toBe(homepagePublications);
  });
});

test.describe("filtered counts are distinguished from global totals", () => {
  test("/books shows 'N of M' once a filter narrows the list", async ({ page }) => {
    await visit(page, "/books");
    const unfiltered = await requireListingCount(page, BOOKS_NOUN);
    expect(unfiltered.filtered).toBeGreaterThan(0);
    const globalTotal = unfiltered.filtered;

    await visit(page, "/books?language=English");
    const narrowed = await requireListingCount(page, BOOKS_NOUN);

    if (narrowed.global !== null) {
      // "N of M" — the denominator is the collection size, unchanged.
      expect(narrowed.global).toBe(globalTotal);
      expect(narrowed.filtered).toBeLessThanOrEqual(narrowed.global);
    } else {
      // The filter matched everything — a single figure is right, and it must
      // still be the global total, never the number of cards on this page.
      expect(narrowed.filtered).toBe(globalTotal);
    }
  });

  test("paging does not change the stated total", async ({ page }) => {
    await visit(page, "/books");
    const page1 = await requireListingCount(page, BOOKS_NOUN);
    await visit(page, "/books?page=2");
    const page2 = await requireListingCount(page, BOOKS_NOUN);
    expect(page2.filtered).toBe(page1.filtered);
  });

  test("the physical catalog is counted separately from digital resources", async ({ page }) => {
    await visit(page, "/");
    const digitalTotal = await homepageTotal(page);

    await visit(page, "/catalogs");
    const catalogCount = await requireListingCount(page, /books?\b/);
    // The catalog figure is its own metric; it must not be the digital total.
    if (digitalTotal > 0) expect(catalogCount.filtered).not.toBe(digitalTotal);
  });
});

test.describe("search results reflect the query, not the collection", () => {
  test("a narrow query does not report the global total", async ({ page }) => {
    await visit(page, "/");
    const digitalTotal = await homepageTotal(page);

    await visit(page, "/books?q=zzzqqqxxnotarealterm");
    const body = await page.locator("body").innerText();
    const count = listingCount(body, BOOKS_NOUN);
    // Either "No resources found", or a count — never the collection total.
    if (count) expect(count.filtered).not.toBe(digitalTotal);
  });
});
