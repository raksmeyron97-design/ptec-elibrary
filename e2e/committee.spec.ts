import { test, expect } from "@playwright/test";

/**
 * The public Library Committee page, against the seeded local stack
 * (supabase/seed.sql §10b: two sections, three seats, one of them a draft).
 *
 * What these assert is the contract the page makes, not its styling:
 * a published seat appears, a draft does not, the profile link points at the
 * person's own staff page, both locales render, and the committee is part of
 * the About section rather than a page floating on its own.
 */

const PROD = "https://library.ptec.edu.kh";

test.describe("Library Committee — public page", () => {
  test("renders the committee grouped by section, and hides the draft seat", async ({ page }) => {
    await page.goto("/about/committee");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Library Committee");

    // Sections are admin-named data, not code: the page prints what the
    // database holds.
    await expect(page.getByRole("heading", { name: "Committee Leadership" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Library Officers" })).toBeVisible();

    // The chair is published; the third seat is a draft and must not appear
    // anywhere on the page.
    const roster = page.getByRole("region", { name: /Committee members/i });
    await expect(roster.getByText("Head Librarian", { exact: false }).first()).toBeVisible();
    await expect(roster.getByText("Chair", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Reader Services Assistant")).toHaveCount(0);
  });

  test("links a member to their existing staff profile", async ({ page }) => {
    await page.goto("/about/committee");

    // The accessible name carries the person: a screen-reader link list of
    // identical "View staff profile" links is a WCAG 2.4.4 failure.
    const profileLink = page.getByRole("link", { name: /View staff profile: /i }).first();
    await expect(profileLink).toBeVisible();
    await expect(profileLink).toHaveAttribute("href", /\/about\/team\/[a-z0-9-]+$/);

    await profileLink.click();
    // A generous timeout on purpose: the suite runs against `next dev`, where
    // the FIRST visit to /about/team/[slug] compiles the route, which routinely
    // outlasts the 5s default and would fail as "the link did not navigate".
    await expect(page).toHaveURL(/\/about\/team\/[a-z0-9-]+$/, { timeout: 30_000 });
    // The person exists once: the committee page sent us to the canonical
    // profile rather than to a committee-only copy of them. Assert the NAME,
    // not merely that an h1 is visible — the 404 page has an h1 too, and this
    // test passed for an afternoon while the profile route answered 404.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Head Librarian");
  });

  test("publishes no contact detail for a committee member", async ({ page }) => {
    await page.goto("/about/committee");
    const roster = page.getByRole("region", { name: /Committee members/i });
    // The seeded members all carry a phone number on their team record; the
    // public view does not select it, so it cannot reach this page.
    await expect(roster.getByText("+855 12 000 001")).toHaveCount(0);
    await expect(roster.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(roster.locator('a[href^="tel:"]')).toHaveCount(0);
  });

  test("serves the Khmer page under /km with a Khmer heading", async ({ page }) => {
    await page.goto("/km/about/committee");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("គណៈកម្មការបណ្ណាល័យ");
    // The other language is stacked beneath, never joined on one line.
    await expect(heading).toContainText("Library Committee");
  });

  test("belongs to the About section: breadcrumb, sub-nav and pager", async ({ page }) => {
    await page.goto("/about/committee");

    const subnav = page.getByRole("navigation", { name: /About/i }).first();
    const current = subnav.getByRole("link", { name: /Library Committee/i }).first();
    await expect(current).toHaveAttribute("aria-current", "page");

    // The last page in reading order has a previous and no next.
    await expect(page.getByRole("link", { name: /Library Team/i }).first()).toBeVisible();
  });

  test("declares a canonical URL and both hreflang alternates", async ({ page }) => {
    await page.goto("/about/committee");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${PROD}/about/committee`,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="km"]')).toHaveAttribute(
      "href",
      `${PROD}/km/about/committee`,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      "href",
      `${PROD}/about/committee`,
    );
  });

  test("describes only the people it actually published, in JSON-LD", async ({ page }) => {
    await page.goto("/about/committee");
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const itemList = blocks.map((b) => JSON.parse(b)).find((b) => b["@type"] === "ItemList");
    expect(itemList).toBeTruthy();
    // Two published seats, and the draft is in neither the page nor the markup.
    expect(itemList.numberOfItems).toBe(2);
    expect(JSON.stringify(itemList)).not.toContain("Reader Services Assistant");
  });

  test("reads on a phone without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/km/about/committee");
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});
