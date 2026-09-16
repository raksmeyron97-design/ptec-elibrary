import { expect, test } from "@playwright/test";

/**
 * The public end of the curation workflow: what a librarian chose on
 * /admin/books/featured is what a reader sees at the top of /books.
 *
 * The admin end is covered offline by lib/books/featured.test.ts (the rules,
 * plus source scans over the Server Action's gate, its audit rows and the
 * columns it is allowed to write). What only a browser can prove is the three
 * things below: the shelf renders, it renders in the CURATED order rather than
 * the listing's default, and it stays out of the way once a reader has told us
 * what they want.
 *
 * Fixtures come from supabase/seed.sql, which features two books in an order
 * deliberately different from "newest first" — so a shelf that had silently
 * fallen back to recency would fail here rather than look plausible.
 */

const FIRST = "វិធីសាស្ត្របង្រៀនភាសាខ្មែរ"; // featured_position 1, published 2023-01-20
const SECOND = "Foundations of Education"; // featured_position 2, published 2023-06-01

test.describe("Featured by PTEC Library", () => {
  test("renders on the clean listing, in the curated order", async ({ page }) => {
    await page.goto("/books");

    const shelf = page.getByRole("region", { name: /Featured by PTEC Library/i });
    await expect(shelf).toBeVisible();

    // The section names the library, never the individual curator and never
    // the database's words for any of this.
    await expect(shelf).toContainText(/Chosen by our librarians/i);
    await expect(shelf).not.toContainText(/pinned/i);
    await expect(shelf).not.toContainText(/featured_by|is_pinned|featured_position/i);

    const titles = await shelf.getByRole("heading", { level: 3 }).allInnerTexts();
    const first = titles.findIndex((t) => t.includes(FIRST));
    const second = titles.findIndex((t) => t.includes(SECOND));
    expect(first, "position 1 is on the shelf").toBeGreaterThanOrEqual(0);
    expect(second, "position 2 is on the shelf").toBeGreaterThanOrEqual(0);
    // The assertion that distinguishes a curated order from a recency
    // fallback: by published_at, SECOND is the newer of the two.
    expect(first).toBeLessThan(second);
  });

  test("a featured book is still an ordinary member of the collection", async ({ page }) => {
    await page.goto("/books");
    // Not "featured INSTEAD of listed" — promotion is merchandising, and the
    // book has to remain findable where a reader expects it.
    const main = page.locator("main, body");
    const occurrences = await main.getByRole("heading", { level: 3, name: new RegExp(SECOND) }).count();
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  test("steps aside once the reader has narrowed the collection", async ({ page }) => {
    await page.goto("/books?q=assessment");
    await expect(page.getByRole("region", { name: /Featured by PTEC Library/i })).toHaveCount(0);

    await page.goto("/books?page=2");
    await expect(page.getByRole("region", { name: /Featured by PTEC Library/i })).toHaveCount(0);
  });

  test("is translated, not transliterated, in Khmer", async ({ page }) => {
    await page.goto("/km/books");
    const shelf = page.getByRole("region", { name: /បណ្ណាល័យ PTEC/ });
    await expect(shelf).toBeVisible();
    await expect(shelf).not.toContainText(/Featured by PTEC Library/);
  });
});
