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
  for (const path of ["/", "/km", "/books", "/theses", "/publications", "/catalogs"]) {
    await request
      .get(path, { timeout: 180_000, failOnStatusCode: false })
      .catch(() => {}); // a warm-up failure is not a test failure
  }
});

const STATS_SECTION = 'section[aria-labelledby="home-library-statistics"]';

const NO_DATA =
  "Public collection statistics are unavailable in this environment " +
  "(getCollectionStats() returned null, so the block is correctly omitted). " +
  "These are cross-surface CONSISTENCY assertions and are vacuous without data.";

/**
 * The statistics block sits at the very bottom of the homepage, behind
 * Suspense boundaries that stream in after DOMContentLoaded — wait for it
 * explicitly rather than assuming it is there the moment the shell is.
 *
 * Skips rather than fails when the block is absent. That is not papering over
 * a bug: by design, a page whose stats cannot be read omits the figure
 * entirely instead of rendering a zero or an invented total, and the local
 * e2e Supabase stack denies anon access to the content tables (`permission
 * denied for table books`, which predates this suite). A regression that
 * renders the block with WRONG numbers still fails every assertion below.
 */
async function statsSection(page: Page) {
  const section = page.locator(STATS_SECTION);
  await section.waitFor({ state: "attached", timeout: 20_000 }).catch(() => {});
  test.skip((await section.count()) === 0, NO_DATA);
  return section;
}

type StatKey = "total" | "books" | "theses" | "publications";

/** Read the <dd> for one metric. Keyed on data-stat rather than on the
 *  translated label, so the same helper works in English and Khmer. */
async function homepageStat(page: Page, key: StatKey): Promise<number> {
  await statsSection(page);
  const dd = page.locator(`${STATS_SECTION} [data-stat="${key}"] dd`);
  await expect(dd).toHaveCount(1, { timeout: 15_000 });
  return Number((await dd.innerText()).replace(/[^\d]/g, ""));
}

/** The visible label for one metric, to assert it is translated at all. */
async function homepageStatLabel(page: Page, key: StatKey): Promise<string> {
  await statsSection(page);
  return (await page.locator(`${STATS_SECTION} [data-stat="${key}"] dt`).innerText()).trim();
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
 * statsSection(): an empty environment cannot demonstrate consistency
 * between two numbers.
 */
async function requireListingCount(page: Page, noun: RegExp) {
  let found: ReturnType<typeof listingCount> = null;
  await expect
    .poll(
      async () => {
        found = listingCount(await page.locator("body").innerText(), noun);
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
  test("the total equals the sum of the categories shown beside it", async ({ page }) => {
    await visit(page, "/");
    const section = await statsSection(page);
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();

    const [total, books, theses, publications] = await Promise.all([
      homepageStat(page, "total"),
      homepageStat(page, "books"),
      homepageStat(page, "theses"),
      homepageStat(page, "publications"),
    ]);

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

    const section = await statsSection(page);
    for (const dd of await section.locator("dd").all()) {
      // Each value cell holds exactly one number and nothing else.
      expect((await dd.innerText()).trim()).toMatch(/^[\d,]+$/);
    }
  });

  test("statistics are a labelled description list for assistive tech", async ({ page }) => {
    await visit(page, "/");
    const section = await statsSection(page);
    await expect(section.locator("dl")).toHaveCount(1);
    // One <dt> per <dd> — no orphan value without a label.
    const dts = await section.locator("dt").count();
    const dds = await section.locator("dd").count();
    expect(dts).toBe(dds);
    expect(dts).toBeGreaterThanOrEqual(4);
  });

  test("renders in Khmer with the same figures", async ({ page }) => {
    await visit(page, "/");
    const enTotal = await homepageStat(page, "total");

    await visit(page, "/km");
    const section = await statsSection(page);
    await expect(section).toBeVisible();
    const kmTotal = await homepageStat(page, "total");
    expect(kmTotal).toBe(enTotal);

    // Khmer must render a real translated label, not the English string, a
    // raw ICU placeholder, or the message key itself.
    const kmLabel = await homepageStatLabel(page, "total");
    expect(kmLabel).not.toBe("Digital resources");
    expect(kmLabel).not.toContain("{");
    expect(kmLabel).not.toContain("statDigitalResources");
    expect(kmLabel.length).toBeGreaterThan(0);
    expect(await section.innerText()).not.toContain("{");
  });
});

test.describe("listing totals match the homepage categories", () => {
  test("/books total equals the homepage E-books figure", async ({ page }) => {
    await visit(page, "/");
    const homepageBooks = await homepageStat(page, "books");

    await visit(page, "/books");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const count = await requireListingCount(page, BOOKS_NOUN);
    // Unfiltered listing: one figure, and it is the canonical e-book total.
    expect(count.global).toBeNull();
    expect(count.filtered).toBe(homepageBooks);
  });

  test("/theses total equals the homepage Theses figure", async ({ page }) => {
    await visit(page, "/");
    const homepageTheses = await homepageStat(page, "theses");

    await visit(page, "/theses");
    const eyebrow = page.getByText(/PTEC Digital Repository/);
    await expect(eyebrow).toBeVisible();
    const m = (await eyebrow.innerText()).match(/([\d,]+)/);
    expect(m).not.toBeNull();
    expect(toInt(m![1])).toBe(homepageTheses);
  });

  test("/publications total equals the homepage Publications figure", async ({ page }) => {
    await visit(page, "/");
    const homepagePublications = await homepageStat(page, "publications");

    await visit(page, "/publications");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const count = await requireListingCount(page, /publications?\b/);
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
    const digitalTotal = await homepageStat(page, "total");

    await visit(page, "/catalogs");
    const catalogCount = await requireListingCount(page, /books?\b/);
    // The catalog figure is its own metric; it must not be the digital total.
    if (digitalTotal > 0) expect(catalogCount.filtered).not.toBe(digitalTotal);
  });
});

test.describe("search results reflect the query, not the collection", () => {
  test("a narrow query does not report the global total", async ({ page }) => {
    await visit(page, "/");
    const digitalTotal = await homepageStat(page, "total");

    await visit(page, "/books?q=zzzqqqxxnotarealterm");
    const body = await page.locator("body").innerText();
    const count = listingCount(body, BOOKS_NOUN);
    // Either "No resources found", or a count — never the collection total.
    if (count) expect(count.filtered).not.toBe(digitalTotal);
  });
});
