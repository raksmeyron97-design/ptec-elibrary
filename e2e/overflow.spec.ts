import { test, expect } from "@playwright/test";

/**
 * No route may scroll horizontally at phone widths — a Khmer label or an
 * unwrapped table sneaking past the viewport is a recurring regression class
 * (see the 2026-07-11 navbar rework). Checks the core public templates at
 * the two narrowest supported widths, both locales.
 */

const ROUTES = ["/home", "/books", "/theses", "/catalogs", "/contact"];
const WIDTHS = [320, 390];

for (const width of WIDTHS) {
  for (const route of ROUTES) {
    for (const locale of ["", "/km"]) {
      const path = `${locale}${route}`;
      test(`no horizontal overflow at ${width}px: ${path}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        // networkidle never fires in dev (HMR websocket) — settle on DOM +
        // a short hydration/webfont wait instead.
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500);
        const overflow = await page.evaluate(() => {
          const el = document.documentElement;
          return {
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          };
        });
        // 1px tolerance for subpixel rounding.
        expect(
          overflow.scrollWidth,
          `document scrollWidth ${overflow.scrollWidth} exceeds viewport ${overflow.clientWidth}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1);
      });
    }
  }
}
