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

// The homepage pulls hero imagery, fonts and a service worker; in dev its
// `load` event can lag well past the default navigation timeout while the
// HTML (all this suite reads) is already there. Wait for DOMContentLoaded.
async function visit(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
}

test.describe.configure({ timeout: 180_000 });

const STATS_SECTION = 'section[aria-labelledby="home-library-statistics"]';

/** The statistics block sits at the very bottom of the homepage, behind
 *  Suspense boundaries that stream in after DOMContentLoaded — wait for it
 *  explicitly rather than assuming it is present the moment the shell is. */
async function statsSection(page: Page) {
  const section = page.locator(STATS_SECTION);
  await expect(section).toBeAttached({ timeout: 60_000 });
  return section;
}

type StatKey = "total" | "books" | "theses" | "publications";

/** Read the <dd> for one metric. Keyed on data-stat rather than on the
 *  translated label, so the same helper works in English and Khmer. */
async function homepageStat(page: Page, key: StatKey): Promise<number> {
  await statsSection(page);
  const dd = page.locator(`${STATS_SECTION} [data-stat="${key}"] dd`);
  await expect(dd).toHaveCount(1, { timeout: 30_000 });
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
    const count = listingCount(await page.locator("body").innerText(), BOOKS_NOUN);
    expect(count).not.toBeNull();
    // Unfiltered listing: one figure, and it is the canonical e-book total.
    expect(count!.global).toBeNull();
    expect(count!.filtered).toBe(homepageBooks);
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
    const body = await page.locator("body").innerText();
    const m = body.match(/([\d,]+)\s+publications?\b/i);
    expect(m).not.toBeNull();
    expect(Number(m![1].replace(/,/g, ""))).toBe(homepagePublications);
  });
});

test.describe("filtered counts are distinguished from global totals", () => {
  test("/books shows 'N of M' once a filter narrows the list", async ({ page }) => {
    await visit(page, "/books");
    const unfiltered = listingCount(await page.locator("body").innerText(), BOOKS_NOUN)!;
    expect(unfiltered.filtered).toBeGreaterThan(0);
    const globalTotal = unfiltered.filtered;

    await visit(page, "/books?language=English");
    const narrowed = listingCount(await page.locator("body").innerText(), BOOKS_NOUN);
    expect(narrowed).not.toBeNull();

    if (narrowed!.global !== null) {
      // "N of M" — the denominator is the collection size, unchanged.
      expect(narrowed!.global).toBe(globalTotal);
      expect(narrowed!.filtered).toBeLessThanOrEqual(narrowed!.global);
    } else {
      // The filter matched everything — a single figure is right, and it must
      // still be the global total, never the number of cards on this page.
      expect(narrowed!.filtered).toBe(globalTotal);
    }
  });

  test("paging does not change the stated total", async ({ page }) => {
    await visit(page, "/books");
    const page1 = listingCount(await page.locator("body").innerText(), BOOKS_NOUN)!;
    await visit(page, "/books?page=2");
    const page2 = listingCount(await page.locator("body").innerText(), BOOKS_NOUN)!;
    expect(page2.filtered).toBe(page1.filtered);
  });

  test("the physical catalog is counted separately from digital resources", async ({ page }) => {
    await visit(page, "/");
    const digitalTotal = await homepageStat(page, "total");

    await visit(page, "/catalogs");
    const catalogCount = listingCount(await page.locator("body").innerText(), /books?\b/);
    // The catalog figure is its own metric; it must not be the digital total.
    expect(catalogCount).not.toBeNull();
    if (digitalTotal > 0) expect(catalogCount!.filtered).not.toBe(digitalTotal);
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
