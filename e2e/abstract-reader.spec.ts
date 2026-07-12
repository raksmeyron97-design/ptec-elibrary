import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PUBLICATION_PATH = "/publications/journal-of-chemical-education";

async function openPublicationReader(page: Page, locale: "en" | "km" = "en") {
  const prefix = locale === "km" ? "/km" : "";
  // Publication detail is streamed while remote metadata/auth calls settle;
  // waiting for `commit` avoids coupling this feature test to those requests.
  await page.goto(`${prefix}${PUBLICATION_PATH}`, { waitUntil: "commit", timeout: 20_000 });
  const openName = locale === "km"
    ? "បើកផ្ទាំងអានសេចក្តីសង្ខេប"
    : "Open abstract reader";
  const trigger = page.getByRole("button", { name: openName });
  await trigger.waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
  test.skip((await trigger.count()) === 0, "No publication abstract is available in this environment");
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return { dialog, trigger };
}

test.describe("Publication abstract reader", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("ptec.abstractReader.textSize");
      } catch {}
    });
  });

  test("opens without the native Fullscreen API, traps focus, persists zoom, and closes with Escape", async ({ page }) => {
    const { dialog, trigger } = await openPublicationReader(page);
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(page.getByText("Fullscreen reading mode", { exact: true })).toBeAttached();
    await expect(page.getByRole("button", { name: "Decrease text size" }).last()).toBeFocused();

    const bodyLock = await page.evaluate(() => ({
      overflow: document.body.style.overflow,
      position: document.body.style.position,
    }));
    expect(bodyLock).toEqual({ overflow: "hidden", position: "fixed" });

    await page.getByRole("button", { name: "Increase text size" }).last().click();
    await expect(dialog.getByRole("button", { name: /Current text size: 110%/ })).toBeVisible();
    await dialog.getByRole("button", { name: "Close abstract reader" }).press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Current text size: 110%/ })).toBeVisible();
  });

  test("has no horizontal overflow and keeps 44px controls at supported viewport sizes", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const { dialog } = await openPublicationReader(page);

    const viewports = [
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const dimensions = await dialog.evaluate((element) => {
        const scrollRegion = element.querySelector("main");
        const controls = [...element.querySelectorAll<HTMLButtonElement>("button")].map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
        });
        return {
          dialogScrollWidth: element.scrollWidth,
          dialogClientWidth: element.clientWidth,
          contentScrollWidth: scrollRegion?.scrollWidth ?? 0,
          contentClientWidth: scrollRegion?.clientWidth ?? 0,
          controls,
        };
      });

      expect(dimensions.dialogScrollWidth).toBeLessThanOrEqual(dimensions.dialogClientWidth + 1);
      expect(dimensions.contentScrollWidth).toBeLessThanOrEqual(dimensions.contentClientWidth + 1);
      for (const control of dimensions.controls) {
        expect(control.height).toBeGreaterThanOrEqual(44);
        expect(control.width).toBeGreaterThanOrEqual(44);
        expect(control.left).toBeGreaterThanOrEqual(-1);
        expect(control.right).toBeLessThanOrEqual(viewport.width + 1);
      }
    }
  });

  test("exposes the localized Khmer reader and passes an open-dialog axe scan", async ({ page }) => {
    const { dialog } = await openPublicationReader(page, "km");
    await expect(page.getByText("របៀបអានពេញអេក្រង់", { exact: true })).toBeAttached();
    await expect(dialog.getByRole("button", { name: "បង្កើនទំហំអក្សរ" })).toBeVisible();
    const khmerAbstract = dialog.locator('article > section[lang="km"]').first();
    if ((await khmerAbstract.count()) > 0) {
      await expect(khmerAbstract).toBeVisible();
    } else {
      // Some published records do not yet have a Khmer abstract; the Khmer
      // interface must still expose the reader and retain the English text.
      await expect(dialog.locator('article > section[lang="en"]').first()).toBeVisible();
    }

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
