import { expect, test, type Page } from "@playwright/test";

/**
 * The announcement banner, and the layout shift it used to cost.
 *
 * It was a client component that returned `null` until it had hydrated and
 * read its dismissal list — so every public page grew by the banner's height
 * about a second after load. Measured on the journal article page before the
 * fix: the masthead moved from 174 px to 218 px between 600 ms and 1200 ms.
 *
 * That was not only a visual defect. A control pressed inside that window
 * takes its `pointerdown` and its `mouseup` on two different elements, so the
 * browser produces NO click at all — the third test here is that symptom,
 * reproduced directly rather than inferred.
 *
 * Fixture: supabase/seed.sql §announcements, one dismissible banner.
 */
const BANNER_ID = "77777777-7777-4777-8777-777777777701";
const PAGE = "/journals/articles/first-posting-graduates-longitudinal";

/**
 * Cumulative layout shift, recorded by the browser from navigation start.
 *
 * Sampling an element's position from the test was tried first and is not
 * sensitive enough: the first sample cannot be taken until something is
 * visible, and on a warm server the shift has already happened by then — the
 * measurement passed against the very regression it was written for. A
 * buffered `layout-shift` observer sees every shift since the navigation
 * began, including ones that land before the test can ask a question.
 */
async function observeLayoutShift(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function layoutShift(page: Page): Promise<number> {
  // Past the window the banner used to land in (measured at 600-1200 ms).
  await page.waitForTimeout(2_500);
  return page.evaluate(() => (window as unknown as { __cls: number }).__cls);
}

/** Chrome's "good" threshold is 0.1; the banner alone scored well above it. */
const CLS_BUDGET = 0.02;

test.describe("announcement banner", () => {
  test("is in the server's HTML, not added after hydration", async ({ page }) => {
    // The markup itself, before any script has run.
    const res = await page.request.get(PAGE);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(`data-announcement-id="${BANNER_ID}"`);
    expect(html).toContain("announcement-dismiss-init");
  });

  test("nothing moves after load, for a first-time visitor", async ({ page }) => {
    await observeLayoutShift(page);
    await page.goto(PAGE);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(`[data-announcement-id="${BANNER_ID}"]`)).toBeVisible();

    expect(await layoutShift(page)).toBeLessThan(CLS_BUDGET);
  });

  test("a link clicked the instant the page loads still navigates", async ({ page }) => {
    // The regression this whole fix exists for: with the banner arriving late,
    // the anchor moved out from under the cursor between press and release and
    // the click event was never produced.
    await page.goto(PAGE);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "On this page" });
    test.skip((await nav.count()) === 0, "This article has no section navigation");
    await nav.getByRole("link").first().click();
    await expect(page).toHaveURL(/#/);
  });

  test("a dismissed banner is never painted again, and still nothing moves", async ({ page }) => {
    await observeLayoutShift(page);
    await page.addInitScript(
      (id) => {
        try {
          localStorage.setItem("ptec.dismissedAnnouncements", JSON.stringify([id]));
        } catch {}
      },
      BANNER_ID,
    );
    await page.goto(PAGE);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Hidden from the first frame by the pre-paint stylesheet — not hidden
    // later by React, which is what the shift was.
    await expect(page.locator(`[data-announcement-id="${BANNER_ID}"]`)).toBeHidden();
    const rule = await page.evaluate(() => document.getElementById("announcement-dismiss")?.textContent ?? "");
    expect(rule).toContain(BANNER_ID);

    expect(await layoutShift(page)).toBeLessThan(CLS_BUDGET);
  });

  test("dismissing hides it and remembers across a reload", async ({ page }) => {
    await page.goto(PAGE);
    const banner = page.locator(`[data-announcement-id="${BANNER_ID}"]`);
    await expect(banner).toBeVisible();

    await page.getByRole("region").getByRole("button").first().click();
    await expect(banner).toBeHidden();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(`[data-announcement-id="${BANNER_ID}"]`)).toBeHidden();
  });
});
