import { expect, test } from "@playwright/test";

test.describe("About navigation", () => {
  test("desktop popover is grouped, keyboard-friendly, and route-aware", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/about/rules");

    const trigger = page.getByRole("button", { name: /^About$/i });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    const aboutNav = page.getByRole("navigation", {
      name: "About PTEC Library",
    });
    await expect(aboutNav.getByText("General")).toBeVisible();
    await expect(aboutNav.getByText("Library Information")).toBeVisible();

    const rulesLink = aboutNav.getByRole("link", {
      name: /^Library Rules$/i,
    });
    await expect(rulesLink).toHaveAttribute("aria-current", "page");

    const teamLink = aboutNav.getByRole("link", {
      name: /^Library Team$/i,
    });
    await expect(teamLink).toHaveAttribute("href", /\/about\/team$/);

    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Space");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    await expect(aboutNav.getByRole("link", { name: /^Our Journey$/i })).toBeFocused();

    await page.mouse.click(8, 8);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("mobile drawer presents About as an accordion", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/about/team");

    await page.getByRole("button", { name: "Open menu" }).click();

    const trigger = page.getByRole("button", { name: /^About$/i });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    // Scope to the panel this trigger controls, the way the desktop test
    // scopes to the About navigation region. A page-wide locator was unique
    // only by accident: /about/team also renders the About section's own
    // sticky sub-navigation, which correctly marks the same current page —
    // two navigation landmarks each flagging their own current link is valid
    // ARIA, so the test has to say WHICH one it means.
    const panelId = await trigger.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const aboutPanel = page.locator(`[id="${panelId}"]`);

    const teamLink = aboutPanel.getByRole("link", { name: /^Library Team$/i });
    await expect(teamLink).toHaveAttribute("href", /\/about\/team$/);
    await expect(teamLink).toHaveAttribute("aria-current", "page");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
