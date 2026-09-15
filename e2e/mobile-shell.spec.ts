import { expect, test, type Page } from "@playwright/test";

// The phone shell (docs/MOBILE-GLASS-UI.md §2, Shell): Home · Explore ·
// Search · Saved · More, a sliding indicator, a one-tap search overlay, and a
// sticky top bar that steps aside on scroll-down and returns on scroll-up.
// Desktop (≥ 1024 px) must not change at all.
//
// Two things about running this against `next dev`: the dev-tools badge sits
// in the bottom-left corner — exactly over the Home tab at 360 px — so the
// Home tab is activated from the keyboard (a real path, and one the badge
// cannot intercept); and the first request for a route compiles it, so a
// navigation gets a navigation-sized timeout.

const NAVIGATION = { timeout: 20_000 };

const tabBar = (page: Page) => page.getByRole("navigation", { name: "Main navigation" });

/** The sheets and the overlay mount at browser idle; before that the Search
 *  tab is a plain link to /search and a sheet tab has to fetch its code. Tests
 *  that exercise them wait for the shell to be ready. */
async function shellReady(page: Page) {
  await page.locator("[data-search-overlay]").waitFor({ state: "attached", timeout: 20_000 });
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

test.describe("phone shell at 360 px", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test("five labelled tabs, Search in the centre, every target at least 44 px", async ({ page }) => {
    await page.goto("/");
    const items = tabBar(page).getByRole("listitem");
    await expect(items).toHaveText(["Home", "Explore", "Search", "Saved", "More"]);
    const boxes = await items.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      }),
    );
    for (const box of boxes) {
      expect(box.w).toBeGreaterThanOrEqual(44);
      expect(box.h).toBeGreaterThanOrEqual(44);
    }
    await expect(tabBar(page).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    // No hamburger any more: the sheets carry what the drawer did.
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBe(false);
  });

  test("the indicator slides, by transform only, to the tab that owns the route", async ({ page }) => {
    await page.goto("/books");
    const indicator = page.locator("[data-tab-indicator]");
    const explore = tabBar(page).getByRole("button", { name: "Explore" });
    await expect(indicator).toHaveAttribute("data-tab-indicator", "explore");
    await expect(explore).toHaveAttribute("aria-current", "true");
    // Geometry, not just the attribute: the pill is centred over Explore.
    await expect
      .poll(async () => {
        const [a, b] = await Promise.all([indicator.boundingBox(), explore.boundingBox()]);
        return Math.abs(a!.x + a!.width / 2 - (b!.x + b!.width / 2));
      })
      .toBeLessThanOrEqual(2);
    const transition = await indicator.evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(transition.split(",").map((s) => s.trim()).sort()).toEqual(["opacity", "transform"]);

    await tabBar(page).getByRole("link", { name: "Home" }).press("Enter");
    await expect(page).toHaveURL(/\/$/, NAVIGATION);
    await expect(indicator).toHaveAttribute("data-tab-indicator", "home");
  });

  test("Search opens the overlay with the field focused — one tap, no navigation", async ({ page }) => {
    await page.goto("/books");
    await shellReady(page);
    const searchTab = tabBar(page).getByRole("link", { name: "Search" });
    await searchTab.click();

    const dialog = page.getByRole("dialog", { name: "Search the library" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("searchbox")).toBeFocused();
    await expect(page).toHaveURL(/\/books$/);
    await expect(page.locator("[data-tab-indicator]")).toHaveAttribute("data-tab-indicator", "search");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(searchTab).toBeFocused();
  });

  test("the top bar's search button opens the same overlay", async ({ page }) => {
    await page.goto("/");
    await shellReady(page);
    await page.locator("header").getByRole("link", { name: "Search the library" }).click();
    await expect(page.getByRole("dialog", { name: "Search the library" }).getByRole("searchbox")).toBeFocused();
    await expect(page).toHaveURL(/\/$/);
  });

  test("a submitted query goes to the search page", async ({ page }) => {
    await page.goto("/");
    await shellReady(page);
    await tabBar(page).getByRole("link", { name: "Search" }).click();
    const field = page.getByRole("dialog", { name: "Search the library" }).getByRole("searchbox");
    await field.fill("education");
    await field.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=education$/, NAVIGATION);
  });

  test("the top bar is sticky, steps aside on scroll-down and returns on scroll-up", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header.site-header");
    await expect(header).toHaveCSS("position", "sticky");

    // Its height is the token the page-level sticky bars offset against.
    const { height, token } = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.height = "var(--ptec-topbar-height)";
      document.body.append(probe);
      const measured = probe.getBoundingClientRect().height;
      probe.remove();
      return {
        height: document.querySelector("header.site-header")!.getBoundingClientRect().height,
        token: measured,
      };
    });
    expect(Math.abs(height - token)).toBeLessThanOrEqual(1);

    const topbar = () => page.evaluate(() => document.documentElement.dataset.topbar);
    await page.evaluate(() => window.scrollTo(0, 900));
    await expect.poll(topbar).toBe("hidden");
    await expect.poll(() => header.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(1);

    await page.evaluate(() => window.scrollTo(0, 700));
    await expect.poll(topbar).toBe("shown");
    await expect.poll(() => header.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0);
    // The tab bar never hides.
    await expect(tabBar(page)).toBeVisible();
  });

  test("Explore leads with Learning Paths; Saved and More carry what the drawer did", async ({ page }) => {
    await page.goto("/");
    await shellReady(page);

    await tabBar(page).getByRole("button", { name: "Explore" }).click();
    const explore = page.getByRole("dialog", { name: "Browse the library" });
    await expect(explore.getByRole("link").first()).toHaveAttribute("href", /\/paths$/);
    await page.keyboard.press("Escape");
    await expect(explore).toBeHidden();

    await tabBar(page).getByRole("button", { name: "Saved" }).click();
    const saved = page.getByRole("dialog", { name: "Saved & downloaded" });
    await expect(saved.getByRole("link", { name: /Downloaded books/ })).toBeVisible();
    await expect(saved.getByRole("link", { name: "Login" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(saved).toBeHidden();

    await tabBar(page).getByRole("button", { name: "More" }).click();
    const more = page.getByRole("dialog", { name: "More" });
    await expect(more.getByRole("link", { name: /News & Events/ })).toBeVisible();
    await expect(more.getByRole("button", { name: /^About$/ })).toBeVisible();
    await expect(more.getByRole("button", { name: /Switch to (dark|light) theme/ })).toBeVisible();
    await expect(more.locator('a[href^="tel:"]')).toHaveCount(1);
    await expect(more.locator('a[href^="mailto:"]')).toHaveCount(1);
    await expect(more.getByRole("link", { name: "Login" })).toBeVisible();
  });

  test("a direct load of a Khmer URL lights the right tab, labelled in Khmer", async ({ page }) => {
    await page.goto("/km/search");
    const nav = page.getByRole("navigation", { name: "ការរុករកចម្បង" });
    await expect(nav.getByRole("listitem")).toHaveText(["ទំព័រដើម", "រុករក", "ស្វែងរក", "រក្សាទុក", "បន្ថែម"]);
    await expect(nav.getByRole("link", { name: "ស្វែងរក" })).toHaveAttribute("aria-current", "page");
    // Every label fits its slot — none is cut off.
    const clipped = await nav
      .locator("li span:last-child")
      .evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
    expect(clipped).toBe(0);
    expect(await horizontalOverflow(page)).toBe(false);
  });
});

test.describe("desktop at 1280 px is untouched", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("no tab bar, no sticky phone header, the full navigation", async ({ page }) => {
    await page.goto("/");
    await expect(tabBar(page)).toBeHidden();
    await expect(page.locator("header.site-header")).toHaveCSS("position", "relative");
    await expect(page.locator("header").getByRole("button", { name: /Digital Library/ })).toBeVisible();
    // The search button stays a plain link here: it navigates, no overlay.
    await shellReady(page);
    await page.locator("header").getByRole("link", { name: "Search the library" }).first().click();
    await expect(page).toHaveURL(/\/search$/, NAVIGATION);
    await expect(page.getByRole("dialog", { name: "Search the library" })).toHaveCount(0);
  });
});
