import { expect, test, type Page } from "@playwright/test";

// The navbar's priority+ collapse (PriorityNav) must keep the right-side
// actions zone (search, theme, login/avatar) inside the viewport at every
// width and in both locales — long Khmer labels collapse into a "More" menu
// instead of pushing actions off-screen.

async function settleNavbar(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  // Khmer webfonts change label widths; PriorityNav re-measures on font load.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectActionsOnScreen(page: Page) {
  const login = page.locator('header a[href*="/auth/login"]');
  await expect(login).toBeVisible();
  const box = await login.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
}

test.describe("Responsive navbar", () => {
  test("km @1366: no overflow, actions stay on-screen", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/km");
    await settleNavbar(page);

    await expectNoHorizontalOverflow(page);
    await expectActionsOnScreen(page);
  });

  test("km @1024: overflow items collapse into More and stay reachable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/km");
    await settleNavbar(page);

    await expectNoHorizontalOverflow(page);
    await expectActionsOnScreen(page);

    const more = page.getByRole("button", { name: "បន្ថែម" });
    await expect(more).toBeVisible();
    await expect(more).toHaveAttribute("aria-expanded", "false");

    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");

    // Collapsed destinations remain reachable inside the More panel.
    const header = page.locator("header");
    await expect(
      header.getByRole("link", { name: "ព័ត៌មាន និងព្រឹត្តិការណ៍" }),
    ).toBeVisible();
    await expect(
      header.getByRole("link", { name: "ក្រុមការងារបណ្ណាល័យ" }),
    ).toBeVisible();

    // Escape closes and returns focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(more).toBeFocused();
  });

  test("en @1280: every top-level item fits without a More menu", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await settleNavbar(page);

    await expectNoHorizontalOverflow(page);
    const header = page.locator("header");
    await expect(header.getByRole("link", { name: /^Home$/ })).toBeVisible();
    await expect(
      header.getByRole("button", { name: /Digital Library/ }),
    ).toBeVisible();
    await expect(
      header.getByRole("link", { name: /Physical Library/ }),
    ).toBeVisible();
    await expect(
      header.getByRole("link", { name: /News & Events/ }),
    ).toBeVisible();
    await expect(header.getByRole("button", { name: /^About/ })).toBeVisible();
    await expect(header.getByRole("button", { name: /^More/ })).toBeHidden();
  });

  test("resizing while More is open removes it cleanly", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/km");
    await settleNavbar(page);

    const more = page.getByRole("button", { name: "បន្ថែម" });
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");

    await page.setViewportSize({ width: 1920, height: 900 });
    await expect(more).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });

  test("km @390: compact header with search and menu, no overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/km");
    await settleNavbar(page);

    await expectNoHorizontalOverflow(page);
    const header = page.locator("header");
    await expect(
      header.getByRole("link", { name: "ស្វែងរកក្នុងបណ្ណាល័យ" }),
    ).toBeVisible();
    await expect(
      header.getByRole("button", { name: "បើកម៉ឺនុយ" }),
    ).toBeVisible();

    const menuBox = await header
      .getByRole("button", { name: "បើកម៉ឺនុយ" })
      .boundingBox();
    const viewport = page.viewportSize()!;
    expect(menuBox).not.toBeNull();
    expect(menuBox!.x + menuBox!.width).toBeGreaterThanOrEqual(
      viewport.width - 20,
    );
  });
});
