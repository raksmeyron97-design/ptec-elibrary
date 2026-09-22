import { test, expect, type Page } from "@playwright/test";
import { makeTestPdf } from "./utils/pdf";

// ─────────────────────────────────────────────────────────────────────────────
// Reader zoom keeps its anchor — deep in a book too.
//
// Every zoom (pinch, double-tap, the presets, Ctrl + wheel, a fit mode)
// re-anchors the viewport on a focal point. The anchor used to scale the
// scroll offset by the width ratio, ignoring each row's fixed padding, so the
// error grew with the page number: on a phone, a pinch at page 150 of 300
// landed pages away from the text under the fingers, and so did stepping
// 75 % → 100 %. `zoomAnchor` in lib/reader/virtual.ts is the fix and its unit
// tests pin the maths; this spec pins it in the real reader.
//
// It uses the OFFLINE reader (/offline-reader): the real PDFViewer, reading
// its bytes from Cache Storage — no session and no database — so it runs on
// any machine. Chromium phone project only: a pinch needs real multi-touch
// input, which only CDP can send.
// ─────────────────────────────────────────────────────────────────────────────

const ID = "e2e-zoom-anchor";
const PAGES = 300;
const DEEP = 150;
const PDF_B64 = makeTestPdf(PAGES, "Zoom anchor").toString("base64");

test.skip(({ browserName, isMobile }) => browserName !== "chromium" || !isMobile, "a pinch needs CDP touch input (Chromium phone project)");

async function openBook(page: Page) {
  await page.goto("/offline-books");
  await page.evaluate(
    async ({ id, b64 }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const cache = await caches.open("offline-books");
      await cache.put(
        `/api/books/${id}/file?offline=1`,
        new Response(bytes, { headers: { "content-type": "application/pdf", "content-length": String(bytes.length) } }),
      );
      localStorage.setItem(
        "ptec_offline_books",
        JSON.stringify([
          {
            id,
            slug: id,
            title: "Zoom anchor",
            author: "E2E",
            coverUrl: null,
            pdfUrl: `/api/books/${id}/file`,
            cachedPdfUrl: `/api/books/${id}/file?offline=1`,
            sizeBytes: bytes.length,
            savedAt: Date.now(),
            ownerKey: null,
            version: 2,
          },
        ]),
      );
      // Continuous scroll at fit width: the reader's defaults, stated.
      localStorage.setItem("ebook:reader:v2:viewMode", "scroll");
      localStorage.setItem("ebook:reader:v2:fitMode", "width");
    },
    { id: ID, b64: PDF_B64 },
  );
  await page.goto(`/offline-reader?id=${ID}`);
  await expect(page.locator(".react-pdf__Page[data-page-number] canvas").first()).toBeVisible({ timeout: 60_000 });
}

type Point = { page: number | null; down: number; across: number; width: number };

/** Which page is under a viewport point, and how far down and across it. */
function pointAt(page: Page, x: number, y: number): Promise<Point> {
  return page.evaluate(
    ({ x, y }) => {
      const el = document
        .elementsFromPoint(x, y)
        .map((e) => e.closest(".react-pdf__Page[data-page-number]"))
        .find(Boolean);
      if (!el) return { page: null, down: 0, across: 0, width: 0 };
      const r = el.getBoundingClientRect();
      return {
        page: Number(el.getAttribute("data-page-number")),
        down: (y - r.top) / r.height,
        across: (x - r.left) / r.width,
        width: r.width,
      };
    },
    { x, y },
  );
}

/** Scroll so page `target` sits under the point (x, y), and wait for it to render there. */
async function goTo(page: Page, target: number, x: number, y: number) {
  await page.evaluate(
    ({ target, y }) => {
      const v = document.querySelector<HTMLElement>(".reader-viewport")!;
      const row = document.querySelector<HTMLElement>("[data-page]")!.offsetHeight;
      const top = v.getBoundingClientRect().top;
      v.scrollTop = 52 + (target - 1) * row + row * 0.4 - (y - top);
    },
    { target, y },
  );
  await expect.poll(async () => (await pointAt(page, x, y)).page, { timeout: 15_000 }).toBe(target);
}

async function pinchOut(page: Page, x: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  const at = (d: number) => [
    { x: x - d, y, id: 0 },
    { x: x + d, y, id: 1 },
  ];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(40) });
  for (let step = 1; step <= 12; step++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(40 + step * 3) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.describe("reader zoom keeps the text under the fingers", () => {
  test("a pinch at page 150 of 300 stays on the same spot of page 150", async ({ page }) => {
    await openBook(page);
    const x = 200;
    const y = 420;
    await goTo(page, DEEP, x, y);
    const before = await pointAt(page, x, y);

    await pinchOut(page, x, y);
    await expect.poll(async () => (await pointAt(page, x, y)).width, { timeout: 15_000 }).toBeGreaterThan(before.width * 1.4);

    const after = await pointAt(page, x, y);
    expect(after.page).toBe(DEEP);
    expect(Math.abs(after.down - before.down)).toBeLessThan(0.03);
    expect(Math.abs(after.across - before.across)).toBeLessThan(0.03);
  });

  test("stepping the zoom presets keeps the page (the 75 % → 100 % case)", async ({ page }) => {
    await openBook(page);
    // Keyboard zoom anchors on the viewport centre.
    const centre = await page.evaluate(() => {
      const r = document.querySelector<HTMLElement>(".reader-viewport")!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await goTo(page, DEEP, centre.x, centre.y);
    const before = await pointAt(page, centre.x, centre.y);

    for (let step = 0; step < 2; step++) {
      const width = (await pointAt(page, centre.x, centre.y)).width;
      await page.keyboard.press("=");
      await expect.poll(async () => (await pointAt(page, centre.x, centre.y)).width, { timeout: 15_000 }).toBeGreaterThan(width + 1);
    }

    const after = await pointAt(page, centre.x, centre.y);
    expect(after.page).toBe(DEEP);
    expect(Math.abs(after.down - before.down)).toBeLessThan(0.03);
  });

  // Zooming OUT is the direction that also SHRINKS the scroll content, and
  // the browser clamps scrollTop to the new maximum the moment the shorter
  // layout is measured — before a layout effect can read the old offset.
  // Past the middle of a book a 2x zoom-out clamps every time, which lands
  // the reader at the END of the document. `scrollPosRef` in PDFViewer is
  // the position from BEFORE the commit; without it this test ends on the
  // last page. (Same clamp, same fix, as rotating at page 500 —
  // e2e/reader-performance.spec.ts.)
  test("zooming OUT deep in the book keeps the page (the content shrinks under it)", async ({ page }) => {
    await openBook(page);
    const centre = await page.evaluate(() => {
      const r = document.querySelector<HTMLElement>(".reader-viewport")!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    // Zoom IN twice first, so there is something to zoom back out of.
    for (let step = 0; step < 2; step++) {
      const width = (await pointAt(page, centre.x, centre.y)).width;
      await page.keyboard.press("=");
      await expect.poll(async () => (await pointAt(page, centre.x, centre.y)).width, { timeout: 15_000 }).toBeGreaterThan(width + 1);
    }
    await goTo(page, DEEP, centre.x, centre.y);
    const before = await pointAt(page, centre.x, centre.y);

    for (let step = 0; step < 2; step++) {
      const width = (await pointAt(page, centre.x, centre.y)).width;
      await page.keyboard.press("-");
      await expect.poll(async () => (await pointAt(page, centre.x, centre.y)).width, { timeout: 15_000 }).toBeLessThan(width - 1);
    }

    const after = await pointAt(page, centre.x, centre.y);
    expect(after.page).toBe(DEEP);
    expect(Math.abs(after.down - before.down)).toBeLessThan(0.03);
  });
});
