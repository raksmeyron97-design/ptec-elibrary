import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * The Physical Library (Phase 3 catalogue redesign), against the seeded
 * catalogue in supabase/seed.sql:
 *
 *   Teaching Practice Handbook            Sok Dara        English  Education
 *   អក្សរសាស្ត្រខ្មែរសម័យទំនើប             ឡុង សុវណ្ណារ៉ា   Khmer    Khmer Literature
 *   Educational Statistics with Examples  Pich Chanthou   English  Mathematics
 *
 * Search is exercised with the app's JavaScript bundle BLOCKED: it is a GET
 * form, and a reader on a slow phone whose bundle has not arrived yet — or
 * never does — must still be able to search. Not with JavaScript disabled
 * outright: the route streams behind loading.tsx, and swapping the skeleton
 * for the content is itself an inline script, so with scripts off no streamed
 * public page ever shows its content.
 */

test.use({ contextOptions: { reducedMotion: "reduce" } });

const HANDBOOK = "Teaching Practice Handbook";
const STATS = "Educational Statistics with Examples";

async function cardTitles(page: Page): Promise<string[]> {
  // Every card links to a record page. Its title is the heading-coloured line;
  // a generated cover prints the title too, in its own font-khmer-serif line.
  return page.locator('a[href*="/catalogs/"] p.font-khmer-serif.text-text-heading').allInnerTexts();
}

test.describe("search before the app bundle loads", () => {
  test.beforeEach(async ({ page }) => {
    // Inline scripts still run (the streaming swap); the app never hydrates.
    await page.route(/\/_next\/static\/.*\.js/, (route) => route.abort());
  });

  test("the form submits the query and the scope as URL parameters", async ({ page }) => {
    await page.goto("/catalogs");
    await page.getByLabel("Search terms").fill("Teaching");
    await page.getByLabel("Search in").selectOption({ label: "Title" });
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page).toHaveURL(/[?&]q=Teaching/);
    await expect(page).toHaveURL(/[?&]in=title/);
    await expect.poll(() => cardTitles(page), { timeout: 60_000 }).toEqual([HANDBOOK]);
    // The query survives into the field it was typed in.
    await expect(page.getByLabel("Search terms")).toHaveValue("Teaching");
  });

  test("a scoped search that misses offers to search every field", async ({ page }) => {
    await page.goto("/catalogs?q=Sok+Dara&in=title");
    await expect(page.getByRole("heading", { name: "No books found" })).toBeVisible();
    await page.getByRole("link", { name: "Search all fields" }).click();
    await expect.poll(() => cardTitles(page), { timeout: 60_000 }).toEqual([HANDBOOK]);
  });

  test("an empty result points to the digital library with the same query", async ({ page }) => {
    await page.goto("/catalogs?q=zzqqxxnotarealterm");
    const digital = page.getByRole("link", { name: "Search the digital library" });
    await expect(digital).toHaveAttribute("href", "/search?q=zzqqxxnotarealterm");
  });

  test("an ISBN search reaches the ISBN column only", async ({ page }) => {
    // The seed stores ISBNs hyphenated (the admin form and the importer store
    // digits, which lib/catalogs/search-scope.test.ts covers); the reader's own
    // spelling is searched too, so the hyphenated form finds this row.
    await page.goto(`/catalogs?q=${encodeURIComponent("978-9924-100-03-8")}&in=isbn`);
    await expect.poll(() => cardTitles(page), { timeout: 60_000 }).toEqual([STATS]);
    // The same text is not a title.
    await page.goto(`/catalogs?q=${encodeURIComponent("978-9924-100-03-8")}&in=title`);
    await expect(page.getByRole("heading", { name: "No books found" })).toBeVisible();
  });
});

test.describe("facets", () => {
  test("category pills carry counts and filter to what they count", async ({ page }) => {
    await page.goto("/catalogs");
    const subjects = page.getByRole("group", { name: "Subject" });
    const maths = subjects.getByRole("link", { name: /^Mathematics\s*1$/ });
    await expect(maths).toBeVisible();
    await maths.click();
    await expect(page).toHaveURL(/category=Mathematics/);
    await expect.poll(() => cardTitles(page), { timeout: 60_000 }).toEqual([STATS]);
    await expect(page.getByRole("group", { name: "Subject" }).getByRole("link", { name: /^Mathematics/ }))
      .toHaveAttribute("aria-current", "true");
  });

  test("language pills are disjunctive: choosing one keeps the other's count", async ({ page }) => {
    await page.goto("/catalogs");
    const group = page.getByRole("group", { name: "Language and availability" });
    await group.getByRole("link", { name: /^Khmer\s*1$/ }).click();
    await expect.poll(() => cardTitles(page), { timeout: 60_000 }).toEqual(["អក្សរសាស្ត្រខ្មែរសម័យទំនើប"]);
    await expect(page.getByRole("group", { name: "Language and availability" }).getByRole("link", { name: /^English\s*2$/ }))
      .toBeVisible();
  });

  test("every sort is reachable on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/catalogs");
    const sort = page.getByRole("group", { name: "Sort" });
    for (const name of ["Newest", "A–Z", "Available first"]) {
      await expect(sort.getByRole("link", { name })).toBeVisible();
    }
  });
});

test.describe("record page", () => {
  test("holdings say where and whether, never the barcode", async ({ page }) => {
    await page.goto("/catalogs/teaching-practice-handbook");
    await expect(page.getByRole("heading", { level: 1, name: HANDBOOK })).toBeVisible();
    // The table (≥ sm) and the cards (phone) both carry it; one of them is shown.
    await expect(page.getByText("371.102 SOK").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("BC-000000101")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Barcode" })).toHaveCount(0);
    // The breadcrumb names the listing the way the listing names itself.
    await expect(page.getByRole("navigation", { name: /breadcrumb/i }).getByRole("link", { name: "Physical Library" })).toBeVisible();
  });
});

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.describe("accessibility (axe, WCAG 2.1 A/AA)", () => {
  for (const path of [
    "/catalogs",
    "/km/catalogs",
    "/catalogs?q=Teaching&in=title&category=Education",
    "/catalogs?q=zzqqxxnotarealterm",
    "/catalogs/teaching-practice-handbook",
  ]) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoViolations(page);
    });
  }
});
