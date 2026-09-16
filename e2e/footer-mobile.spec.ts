import { expect, test, type Page } from "@playwright/test";

// The phone footer (< 768 px): ONE compact block — the brand, a one-line
// mission, About · Contact · Privacy · language, the social icons, a single
// "More links" disclosure holding every other link, and the copyright. From
// 768 px up it is the four-column footer it always was.
//
// "More links" is a native <details> revealed by a CSS sibling rule, so it
// works before hydration and without JavaScript — the last test proves it.

async function toFooter(page: Page, path: string) {
  await page.goto(path);
  // The homepage's lower bands use `content-visibility: auto`: each takes its
  // real height only as it is scrolled past, so the footer keeps moving for a
  // moment after the first scroll. A tap aimed at a moving target lands on
  // whatever slid under it — observed: a "More links" click that fired no
  // `toggle` at all. Scroll, then wait until the footer stops moving.
  await page.waitForLoadState("networkidle").catch(() => {});
  const footer = page.locator("footer");
  await expect
    .poll(async () => {
      await footer.scrollIntoViewIfNeeded();
      const before = await footer.boundingBox();
      await page.waitForTimeout(150);
      const after = await footer.boundingBox();
      return before && after ? Math.abs(before.y - after.y) : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(1);
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

const LABELS = {
  en: { quick: "Quick links", more: "More links", about: "About", contact: "Contact", privacy: "Privacy Policy", language: "Language" },
  km: { quick: "តំណរហ័ស", more: "តំណផ្សេងទៀត", about: "អំពីយើង", contact: "ទំនាក់ទំនង", privacy: "គោលការណ៍ឯកជនភាព", language: "ភាសា" },
} as const;

for (const locale of ["en", "km"] as const) {
  const L = LABELS[locale];
  const path = locale === "km" ? "/km" : "/";
  const prefix = locale === "km" ? "/km" : "";

  test.describe(`phone footer at 360 px (${locale})`, () => {
    test.use({ viewport: { width: 360, height: 780 } });

    test("one compact block: a one-line mission, four essential links, no overflow", async ({ page }) => {
      await toFooter(page, path);
      const footer = page.locator("footer");

      const quick = footer.getByRole("navigation", { name: L.quick });
      for (const name of [L.about, L.contact, L.privacy]) {
        const link = quick.getByRole("link", { name, exact: true });
        await expect(link).toBeVisible();
        expect((await link.boundingBox())!.height, `${name} tap target`).toBeGreaterThanOrEqual(44);
      }
      const language = quick.getByRole("button", { name: L.language });
      await expect(language).toBeVisible();
      expect((await language.boundingBox())!.height, "language tap target").toBeGreaterThanOrEqual(44);

      const mission = footer.locator("[data-footer-mission]");
      await expect(mission).toBeVisible();
      expect(await mission.evaluate((el) => el.scrollWidth <= el.clientWidth), "the mission is not cut off").toBe(true);

      // Collapsed, the footer's own content is compact. The bottom padding
      // that clears the floating tab bar is not footer content. Measured at
      // 360 px: 504 px (en) and 508 px (km), against 814 px for the old
      // four-accordion footer — the bound keeps that ~38 % saving honest
      // without failing on a font-metrics pixel.
      const contentHeight = await footer.locator("[data-footer-inner]").evaluate((el) => {
        return el.getBoundingClientRect().height - parseFloat(getComputedStyle(el).paddingBottom);
      });
      expect(contentHeight).toBeLessThanOrEqual(540);
      expect(await horizontalOverflow(page)).toBe(false);
    });

    test("at the bottom of the page, no footer control is covered by a floating one", async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
      // Scroll to the TRUE bottom. The lower bands use `content-visibility:
      // auto` and grow to their real height as they are passed, so a single
      // scrollTo(scrollHeight) lands short of the end — and a control short of
      // the end is simply behind the tab bar, where any scrolling page puts it.
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const height = document.documentElement.scrollHeight;
            window.scrollTo(0, height);
            await new Promise((resolve) => setTimeout(resolve, 200));
            return (
              document.documentElement.scrollHeight === height &&
              Math.ceil(window.scrollY + window.innerHeight) >= height
            );
          }),
        )
        .toBe(true);
      // For every footer control on screen, the element under its centre must
      // be the control itself. The tab bar, the assistant's button and the
      // footer all float or sit at the bottom edge — this is where they meet.
      const covered = await page.evaluate(() => {
        const out: string[] = [];
        const controls = document.querySelectorAll<HTMLElement>("footer a, footer button, footer summary");
        for (const el of controls) {
          if (el.closest('nav[aria-label="Main navigation"], nav[aria-label="ការរុករកចម្បង"]')) continue;
          // A control nobody can reach is not "covered": the closed language
          // menu's options are inert, aria-hidden, transparent and
          // pointer-events: none, so whatever lies under them is correct.
          if (el.closest('[inert], [aria-hidden="true"]')) continue;
          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.pointerEvents === "none" || Number(style.opacity) === 0) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= window.innerHeight) continue;
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (hit && !el.contains(hit)) {
            out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"`);
          }
        }
        return out;
      });
      expect(covered).toEqual([]);
    });

    test("More links folds every other link away — still in the DOM — and opens them all", async ({ page }) => {
      await toFooter(page, path);
      const footer = page.locator("footer");
      const toggle = footer.locator("details.footer-more");
      const more = toggle.locator("summary");
      // The element's own state, not a string compare on its attribute.
      const isOpen = () => toggle.evaluate((el) => (el as HTMLDetailsElement).open);
      await expect(more).toHaveText(L.more);
      expect(await isOpen()).toBe(false);

      const subjects = footer.locator(`a[href="${prefix}/subjects"]`);
      await expect(subjects).toHaveCount(1);
      await expect(subjects).toBeHidden();

      await more.click();
      await expect.poll(isOpen).toBe(true);
      for (const href of ["/subjects", "/authors", "/journals", "/about/rules", "/policy"]) {
        await expect(footer.locator(`a[href="${prefix}${href}"]`).first(), href).toBeVisible();
      }
      expect(await horizontalOverflow(page)).toBe(false);

      await more.click();
      await expect.poll(isOpen).toBe(false);
      await expect(subjects).toBeHidden();
    });
  });
}

test.describe("phone footer without JavaScript", () => {
  test.use({ viewport: { width: 360, height: 780 }, javaScriptEnabled: false });

  test("More links still opens — a tap before hydration is never lost", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    const subjects = footer.locator('a[href="/subjects"]');
    await expect(subjects).toBeHidden();
    // Scroll to the end the way a reader would (End needs no script). An
    // automatic "scroll into view if needed" parks the summary at the very
    // bottom edge — under the fixed tab bar, like any control scrolled only
    // just into view — and the tap goes to the bar instead.
    await page.keyboard.press("End");
    await page.waitForTimeout(500);
    await footer.locator("details.footer-more > summary").click();
    await expect(subjects).toBeVisible();
  });
});

test.describe("from 768 px the footer is the four-column layout", () => {
  for (const width of [768, 1280]) {
    test(`at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await toFooter(page, "/");
      const footer = page.locator("footer");
      await expect(footer.locator("details.footer-more")).toBeHidden();
      await expect(footer.getByRole("navigation", { name: "Quick links" })).toBeHidden();
      for (const id of ["footer-library-heading", "footer-help-heading", "footer-about-heading", "footer-visit-heading"]) {
        await expect(footer.locator(`#${id}`)).toBeVisible();
      }
      await expect(footer.locator("#footer-legal-heading")).toBeHidden();
      await expect(footer.locator('a[href="/journals"]')).toBeVisible();
      // The legal pair lives in the bottom bar from md up.
      await expect(footer.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Borrow & Return Policy" })).toBeVisible();
    });
  }
});
