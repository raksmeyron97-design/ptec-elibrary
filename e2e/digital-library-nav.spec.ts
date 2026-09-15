import { expect, test } from "@playwright/test";

test.describe("Digital Library navigation", () => {
  test("desktop popover is clickable, keyboard-friendly, and route-aware", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/books");

    const trigger = page.getByRole("button", { name: /Digital Library/i });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    const libraryNav = page.getByRole("navigation", {
      name: "Digital Library",
    });
    const booksLink = libraryNav.getByRole("link", { name: /^Books/i });
    await expect(booksLink).toBeVisible();
    await expect(booksLink).toHaveAttribute("aria-current", "page");

    const svaLink = page.locator('a[href="https://svacamelib.org/"]');
    await expect(svaLink.locator('img[src*="sva.jpg"]')).toBeVisible();
    await expect(svaLink).toHaveAttribute("target", "_blank");
    await expect(svaLink).toHaveAttribute("rel", /noopener/);
    await expect(svaLink).toHaveAttribute("rel", /noreferrer/);

    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    await expect(booksLink).toBeFocused();

    await page.mouse.click(8, 8);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("phone Explore sheet lists every collection, Learning Paths first", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/books");

    // The ☰ drawer is gone below lg; the tab bar's Explore sheet carries the
    // Digital Library, and its tab lights because /books is in its section.
    const explore = page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Explore" });
    await expect(explore).toHaveAttribute("aria-current", "true");
    await explore.click();

    const sheet = page.getByRole("dialog", { name: "Browse the library" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link").first()).toHaveAttribute("href", /\/paths$/);

    const booksLink = sheet.getByRole("link", { name: /^Books/i });
    await expect(booksLink).toHaveAttribute("aria-current", "page");

    const svaLink = sheet.getByRole("link", { name: /SVA Library/i });
    await expect(svaLink).toHaveAttribute("target", "_blank");
    await expect(svaLink).toHaveAttribute("rel", /noopener/);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
