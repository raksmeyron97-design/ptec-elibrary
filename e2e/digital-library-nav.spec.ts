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

  test("mobile drawer presents Digital Library as an accordion", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/books");

    await page.getByRole("button", { name: "Open menu" }).click();

    const trigger = page.getByRole("button", { name: /Digital Library/i });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    const booksLink = page.getByRole("link", { name: /^Books$/i });
    await expect(booksLink).toHaveAttribute("aria-current", "page");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const svaLink = page.getByRole("link", { name: /SVA Library/i });
    await expect(svaLink).toHaveAttribute("target", "_blank");
    await expect(svaLink.locator('img[src*="sva.jpg"]')).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
