import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * The journal article page (docs/JOURNAL-ARTICLE-UX-AUDIT.md).
 *
 * Runs against the seeded stack (supabase/seed.sql §11), whose five published
 * articles cover every access state:
 *
 *   first-posting-graduates-longitudinal   downloadable; figures, references, FAQ
 *   khmer-literacy-assessment-framework    read online only, librarian's reason
 *   from-what-chemistry-can-do-…           third-party rights: read, never download
 *   assessment-literacy-scoping-review     no file at all
 *
 * Both projects run it: the desktop rail and the phone dock each have a test
 * that skips on the other viewport.
 */
const FLAGSHIP = "/journals/articles/first-posting-graduates-longitudinal";
const READ_ONLY = "/journals/articles/khmer-literacy-assessment-framework";
const RIGHTS = "/journals/articles/from-what-chemistry-can-do-to-what-chemists-should-do";
const NO_FILE = "/journals/articles/assessment-literacy-scoping-review";

test.use({ contextOptions: { reducedMotion: "reduce" } });

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await settle(page);
}

/**
 * Wait for the page to stop moving before interacting with it.
 *
 * `AnnouncementBanner` renders nothing until it has hydrated and read its
 * dismissal list from localStorage, then appears — so roughly a second after
 * the h1 is visible the whole document drops by the banner's height. Measured
 * at 44 px on this article. A control the harness pressed before the shift
 * gets its pointerdown and its mouseup on two different elements, so no click
 * is produced at all and the assertion fails on something that works perfectly
 * for a person.
 *
 * This waits for the document height to hold still rather than for the banner
 * specifically: a reader with it dismissed never gets one, and the next piece
 * of late chrome should not need a second helper. The shift itself is a real
 * (pre-existing, site-wide) defect — it is not this suite's to fix, and it is
 * not this suite's to be broken by either.
 */
async function settle(page: Page) {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __settleH?: number; __settleN?: number };
      const h = document.documentElement.scrollHeight;
      if (w.__settleH !== h) {
        w.__settleH = h;
        w.__settleN = 0;
        return false;
      }
      w.__settleN = (w.__settleN ?? 0) + 1;
      // Stillness alone is not enough: before the banner mounts the page is
      // perfectly still, so a short window resolves on the calm BEFORE the
      // shift rather than after it. The floor is measured — the drop landed
      // between 600 ms and 1200 ms after the h1 on every run.
      return w.__settleN >= 8 && performance.now() >= 2_000;
    },
    undefined,
    { timeout: 20_000, polling: 100 },
  );
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

test.describe("journal article: header", () => {
  test("answers what, who, where, DOI and how — in that order", async ({ page }) => {
    await open(page, FLAGSHIP);
    const order = await page.evaluate(() => {
      const top = (el: Element | null) => (el ? el.getBoundingClientRect().top + window.scrollY : -1);
      // Scoped to the masthead: the breadcrumb above it names the journal too.
      const header = document.getElementById("publication-masthead")!;
      const byText = (t: string) => [...header.querySelectorAll("a, p, h1")].find((e) => e.textContent?.trim() === t) ?? null;
      return {
        back: top(byText("Back to issue")),
        journal: top(byText("Cambodian Journal of Teacher Education")),
        title: top(document.querySelector("h1")),
        authors: top(document.querySelector('ul[aria-label="Authors"]')),
        doi: top(document.querySelector('a[href="https://doi.org/10.5281/zenodo.9000001"]')),
        actions: top(document.getElementById("article-actions")),
        abstract: top(document.getElementById("abstract")),
      };
    });
    const sequence = [order.back, order.journal, order.title, order.authors, order.doi, order.actions, order.abstract];
    expect(sequence.every((y) => y >= 0)).toBe(true);
    expect([...sequence].sort((a, b) => a - b)).toEqual(sequence);
  });

  test("one h1, then h2 sections — no skipped level", async ({ page }) => {
    await open(page, FLAGSHIP);
    const levels = await page.locator("main h1, main h2, main h3").evaluateAll((els) =>
      els.filter((e) => e.getClientRects().length > 0 || e.classList.contains("sr-only")).map((e) => Number(e.tagName[1])),
    );
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
  });

  test("the DOI resolves at doi.org and the journal chain links to real pages", async ({ page }) => {
    await open(page, FLAGSHIP);
    await expect(page.getByRole("link", { name: /10\.5281\/zenodo\.9000001/ })).toHaveAttribute(
      "href",
      "https://doi.org/10.5281/zenodo.9000001",
    );
    const back = page.getByRole("link", { name: "Back to issue" });
    await expect(back).toHaveAttribute("href", "/journals/cambodian-journal-of-teacher-education/issues/vol-7-issue-2");
    const res = await page.request.get((await back.getAttribute("href"))!, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });
});

test.describe("journal article: actions follow the access decision", () => {
  test("downloadable: Read + PDF, and the PDF goes through the counted route", async ({ page }) => {
    await open(page, FLAGSHIP);
    const actions = page.locator("#article-actions");
    await expect(actions.getByRole("link", { name: "Read article" })).toBeVisible();
    await expect(actions.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "href",
      "/api/publications/first-posting-graduates-longitudinal/file?download=1",
    );
    // No control anywhere on the page links the storage object itself.
    expect(await page.locator('a[href*="publications/seed/"]').count()).toBe(0);
  });

  test("read online only: no PDF anywhere, and the librarian's reason is stated", async ({ page }) => {
    await open(page, READ_ONLY);
    await expect(page.locator("#article-actions").getByRole("link", { name: "Read article" })).toBeVisible();
    expect(await page.locator('a[href$="?download=1"]').count()).toBe(0);
    await expect(page.getByRole("note")).toContainText("under ministry review");
    // …and the server agrees with the page.
    const res = await page.request.get("/api/publications/khmer-literacy-assessment-framework/file?download=1", { maxRedirects: 0 });
    expect(res.status()).toBe(403);
  });

  test("third-party rights: readable, never downloadable", async ({ page }) => {
    await open(page, RIGHTS);
    await expect(page.locator("#article-actions").getByRole("link", { name: "Read article" })).toBeVisible();
    expect(await page.locator('a[href$="?download=1"]').count()).toBe(0);
  });

  test("no file: nothing to read or download, and the page says why", async ({ page }) => {
    await open(page, NO_FILE);
    await expect(page.locator("#article-actions").getByRole("link", { name: "Read article" })).toHaveCount(0);
    expect(await page.locator('a[href$="?download=1"]').count()).toBe(0);
    await expect(page.getByRole("note")).toContainText("No file attached");
    await expect(page.locator("#fulltext")).toHaveCount(0);
  });
});

test.describe("journal article: navigation", () => {
  test("every 'On this page' entry lands on a section that exists", async ({ page }) => {
    await open(page, FLAGSHIP);
    const nav = page.getByRole("navigation", { name: "On this page" });
    const hrefs = await nav.getByRole("link").evaluateAll((as) =>
      as.map((a) => a.getAttribute("href")).filter((h): h is string => !!h && h.startsWith("#") && h !== "#publication-masthead"),
    );
    expect(hrefs.length).toBeGreaterThanOrEqual(4);
    for (const href of hrefs) await expect(page.locator(href)).toHaveCount(1);
    // The flagship has figures and references; an article without them has
    // no entry for them (NO_FILE has neither).
    await open(page, NO_FILE);
    const bare = page.getByRole("navigation", { name: "On this page" });
    await expect(bare.getByRole("link", { name: "Figures" })).toHaveCount(0);
    await expect(bare.getByRole("link", { name: "References" })).toHaveCount(0);
  });

  test("desktop: the rail stays in view while reading", async ({ page }) => {
    test.skip(isPhone(page), "the rail is a desktop surface");
    await open(page, FLAGSHIP);
    const rail = page.getByRole("navigation", { name: "On this page" });
    // The real interaction: follow the rail's own link.
    await rail.getByRole("link", { name: "References" }).click();
    await expect(page).toHaveURL(/#references$/);
    await expect(rail).toBeInViewport();
    await expect(rail.getByRole("link", { name: "References" })).toHaveAttribute("aria-current", "location");
  });

  test("phone: no sideways scroll, and the action dock appears only after the header", async ({ page }) => {
    test.skip(!isPhone(page), "the dock is a phone surface");
    await open(page, FLAGSHIP);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // CSS, not a role query: while hidden the dock is inert, so its buttons
    // are (correctly) absent from the accessibility tree.
    const dock = page.locator('.glass-surface--strong:has([aria-label="Ask about this article"])');
    await expect(dock).toHaveAttribute("aria-hidden", "true");
    await page.locator("#references").scrollIntoViewIfNeeded();
    await expect(dock).toHaveAttribute("aria-hidden", "false");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(dock).toHaveAttribute("aria-hidden", "true");
  });
});

test.describe("journal article: citation dialog", () => {
  test("opens from Cite, closes on Escape, and returns focus", async ({ page }) => {
    await open(page, FLAGSHIP);
    // Cite is drawn once, and WHERE depends on the width: the tool rail from
    // `lg`, the row under the primary buttons below it. Either way there is
    // exactly one, which is the property worth asserting.
    const cite = page.getByRole("button", { name: "Cite", exact: true });
    await expect(cite).toHaveCount(1);
    await cite.click();
    const dialog = page.getByRole("dialog", { name: "Cite this article" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "BibTeX" }).click();
    await expect(dialog.locator("pre")).toContainText("@article");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(cite).toBeFocused();
  });
});

test.describe("journal article: locales and accessibility", () => {
  test("Khmer: the page is translated, the English title keeps its own language", async ({ page }) => {
    await open(page, `/km${FLAGSHIP}`);
    await expect(page.getByRole("link", { name: "ត្រឡប់ទៅលេខផ្សាយ" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveAttribute("lang", "en");
    await expect(page.getByRole("button", { name: "ដកស្រង់", exact: true })).toBeVisible();
  });

  test("each utility is drawn once, wherever the width puts it", async ({ page }) => {
    await open(page, FLAGSHIP);
    // The rail carries them from `lg` and the inline row below it. Rendering
    // both would give a screen reader four "Share" buttons on one article.
    for (const name of ["Cite", "Save", "Share"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(1);
    }
    const inRail = isPhone(page) ? 0 : 1;
    await expect(page.locator("#article-actions").getByRole("button", { name: "Cite", exact: true })).toHaveCount(1 - inRail);
  });

  test("no WCAG A/AA violations on the article", async ({ page }) => {
    await open(page, FLAGSHIP);
    const results = await new AxeBuilder({ page })
      .include("main")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
