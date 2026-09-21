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

// Pushed screens (MUX-01): one level below a collection the phone bar draws
// ‹ Back, and the page's title once its <h1> has gone under the bar. Back is
// a history Back when the previous entry is this site, and goes UP to the
// collection when the reader landed here — never off the site.
test.describe("pushed screens at 390 px: Back and the page title", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // Exact: "Back to top" exists too.
  const back = (page: Page) => page.locator(".site-header").getByRole("button", { name: "Back", exact: true });

  test("Back on a pushed screen, and never on a tab root", async ({ page }) => {
    await page.goto("/about/team");
    await expect(back(page)).toBeVisible();
    const box = (await back(page).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    for (const root of ["/books", "/"]) {
      await page.goto(root);
      await expect(page.locator(".site-header .topbar-brand")).toBeVisible();
      await expect(back(page)).toHaveCount(0);
    }
  });

  test("landed from outside the site: Back goes UP to the collection", async ({ page }) => {
    // A fresh page — no in-app history, like a Telegram link or a search result.
    await page.goto("/about/team");
    await back(page).click();
    await expect(page).toHaveURL(/\/about$/, NAVIGATION);
  });

  test("arrived from inside the site: Back is a history Back, to where the reader was", async ({ page }) => {
    await page.goto("/");
    // A book opened from the homepage: UP would be /books, history is /.
    await page.locator('main a[href^="/books/"]').first().click();
    await expect(page).toHaveURL(/\/books\/[^/]+$/, NAVIGATION);
    await back(page).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/, NAVIGATION);
  });

  test("without the Navigation API, a count of in-app navigations decides the same way", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "navigation", { configurable: true, value: undefined });
    });
    await page.goto("/");
    await page.locator('main a[href^="/books/"]').first().click();
    await expect(page).toHaveURL(/\/books\/[^/]+$/, NAVIGATION);
    await back(page).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/, NAVIGATION);

    await page.goto("/about/team"); // a fresh load resets the count: landed
    await back(page).click();
    await expect(page).toHaveURL(/\/about$/, NAVIGATION);
  });

  test("once the heading is under the bar, the bar carries the page's title — its first line", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && /hydrat/i.test(m.text()) && errors.push(m.text()));
    await page.goto("/about/team");
    const title = page.locator(".site-header .topbar-title");
    const brand = page.locator(".site-header .topbar-brand");
    await expect(back(page)).toBeVisible();
    expect(await page.evaluate(() => "topbarTitle" in document.documentElement.dataset)).toBe(false);

    // Scroll the heading away (the bar steps aside on the way down), then a
    // little back up so the bar returns with the heading still out of view.
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, -120);
    await expect(page.locator("html")).toHaveAttribute("data-topbar-title", "");
    await expect(title).toHaveText("Library Team"); // not "Library Team ក្រុមការងារ…"
    await expect(title).toHaveCSS("opacity", "1");
    await expect(title).toHaveAttribute("aria-hidden", "true");
    // The brand steps out of sight AND out of the tab order.
    await expect(brand).toHaveCSS("visibility", "hidden");

    // Back at the top the brand returns.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator("html")).not.toHaveAttribute("data-topbar-title", "");
    await expect(brand).toHaveCSS("visibility", "visible");
    expect(errors).toEqual([]);
  });

  test("Khmer: the Back label and the title are Khmer", async ({ page }) => {
    await page.goto("/km/about/team");
    const backKm = page.locator(".site-header").getByRole("button", { name: "ថយក្រោយ", exact: true });
    await expect(backKm).toBeVisible();
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, -120);
    await expect(page.locator(".site-header .topbar-title")).toHaveText("ក្រុមការងារបណ្ណាល័យ");
    await backKm.click();
    await expect(page).toHaveURL(/\/km\/about$/, NAVIGATION);
  });
});

test.describe("desktop at 1280 px is untouched", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("a pushed screen draws no Back and no title swap", async ({ page }) => {
    await page.goto("/about/team");
    await expect(page.locator(".site-header").getByRole("button", { name: "Back", exact: true })).toBeHidden();
    await expect(page.locator(".site-header .topbar-title")).toBeHidden();
    await expect(page.locator(".site-header .topbar-brand")).toBeVisible();
  });

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
