import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { installSeededReaderSession } from "./utils/auth";
import { makeLargeTestPdf } from "./utils/pdf";
import { routeBookFileTo, startPdfServer, type PdfServer } from "./utils/pdf-server";
import { READER_BUDGETS } from "../lib/reader/budgets";

// ─────────────────────────────────────────────────────────────────────────────
// Reader interaction cost: zoom, rotation, thumbnails, search and touch
// gestures, on a large document, with the canvas count and interaction
// latency measured rather than assumed.
//
// Separate from reader-performance.spec.ts because these are about what the
// reader does per INTERACTION, not per byte. Runs on every configured project;
// the gesture cases skip themselves where there is no touch screen.
// ─────────────────────────────────────────────────────────────────────────────

const BOOK_SLUG = "foundations-of-education";
const REPORT_DIR = path.resolve(__dirname, "../test-results/reader-performance");
const PAGES = 500;

const pageIndicator = (page: Page) =>
  page.locator('[data-reader-hud] button[aria-label^="Page "]:visible').first();
const zoomButton = (page: Page) => page.locator('[data-reader-hud] button[aria-label^="Zoom —"]:visible').first();

async function reveal(page: Page) {
  await page.keyboard.press("Shift");
  await expect(pageIndicator(page)).toBeVisible({ timeout: 5_000 });
}

async function counts(page: Page) {
  return page.evaluate(() => ({
    mounted: document.querySelectorAll("[data-page]").length,
    canvases: document.querySelectorAll("canvas").length,
    // Canvas backing store, the figure WebKit actually budgets.
    canvasMB:
      Math.round(
        (Array.from(document.querySelectorAll("canvas")).reduce((s, c) => s + c.width * c.height * 4, 0) /
          1048576) *
          10,
      ) / 10,
  }));
}

function writeReport(name: string, data: unknown) {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(path.join(REPORT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

async function openReader(page: Page, isMobile: boolean, server: PdfServer) {
  await page.addInitScript(`try { for (const k of Object.keys(localStorage)) if (k.startsWith("ebook:")) localStorage.removeItem(k); } catch {}`);
  await routeBookFileTo(page, server);
  const signedIn = await installSeededReaderSession(page, {
    email: isMobile ? "staff@ptec.local" : "student@ptec.local",
  });
  test.skip(!signedIn, "seeded reader session unavailable — is the local Supabase stack up?");
  await page.goto(`/books/${BOOK_SLUG}/read`);
  await expect(page.locator(".react-pdf__Page canvas").first()).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");
}

test.describe("reader interaction cost", () => {
  test.slow();

  test("zoom stays bounded and re-sharpens the page being read first", async ({ page, isMobile, browserName }, testInfo) => {
    test.setTimeout(6 * 60_000);
    const pdf = makeLargeTestPdf({ pages: PAGES, bytesPerPage: 24 * 1024, label: "PTEC zoom" });
    const server = await startPdfServer(pdf);
    try {
      await openReader(page, isMobile, server);
      await reveal(page);
      const rows: Array<Record<string, unknown>> = [];
      // Fit-width is the starting point, and what percentage that is depends
      // on the viewport — so the sweep asserts the DIRECTION and the bounds,
      // not a fixed ladder of percentages.
      const percent = async () => Number((await zoomButton(page).textContent())?.replace(/[^\d]/g, ""));
      let previous = await percent();
      // Three steps each way. A phone at fit-width starts near the bottom of
      // the range, so a fourth step down would sit on the 50% floor and change
      // nothing — which is correct behaviour, not a zoom step.
      for (const step of ["+", "+", "+", "-", "-", "-"] as const) {
        await reveal(page);
        const before = previous;
        const t0 = Date.now();
        await page.keyboard.press(step);
        await expect
          .poll(async () => (step === "+" ? (await percent()) > before : (await percent()) < before), { timeout: 20_000 })
          .toBe(true);
        // The page being read must be sharp again before the step is "done".
        await expect(page.locator("[data-page] canvas").first()).toBeVisible();
        const ms = Date.now() - t0;
        previous = await percent();
        const c = await counts(page);
        rows.push({ zoom: `${previous}%`, ms, ...c });
        expect(c.mounted, `mounted at ${previous}%`).toBeLessThanOrEqual(READER_BUDGETS.MAX_MOUNTED_PAGES);
      }
      writeReport(`zoom-${testInfo.project.name.replace(/\s+/g, "-")}`, { browser: browserName, rows });
      console.log(`\n[reader-zoom ${testInfo.project.name}] ` + rows.map((r) => `${r.zoom}: ${r.ms}ms ${r.mounted}p ${r.canvasMB}MB`).join(" | "));
      // Canvas memory is bounded across the whole sweep.
      const worst = Math.max(...rows.map((r) => r.canvasMB as number));
      expect(worst, "peak canvas backing store (MB)").toBeLessThanOrEqual(
        READER_BUDGETS.MAX_CANVAS_BYTES[isMobile ? "touch" : "desktop"] / 1048576,
      );
    } finally {
      await server.close();
    }
  });

  test("rotation keeps the page, the page count and the mounted window", async ({ page, isMobile }) => {
    test.setTimeout(6 * 60_000);
    const pdf = makeLargeTestPdf({ pages: PAGES, bytesPerPage: 24 * 1024, label: "PTEC rotate" });
    const server = await startPdfServer(pdf);
    try {
      await openReader(page, isMobile, server);
      await reveal(page);
      await pageIndicator(page).click();
      const dialog = page.getByRole("dialog", { name: /go to page/i });
      await dialog.getByRole("textbox").fill("120");
      await page.keyboard.press("Enter");
      await expect(pageIndicator(page)).toHaveAttribute("aria-label", `Page 120 of ${PAGES}`);
      for (const degrees of [90, 180, 270, 0]) {
        await reveal(page);
        await page.keyboard.press("r");
        await expect(page.locator('[data-page="120"] canvas').first()).toBeVisible({ timeout: 30_000 });
        await expect(pageIndicator(page)).toHaveAttribute("aria-label", `Page 120 of ${PAGES}`);
        const pages = await page.$$eval("[data-page]", (els) => els.map((e) => Number(e.getAttribute("data-page"))));
        expect(new Set(pages).size, `duplicate rows at ${degrees}°`).toBe(pages.length);
        expect(pages.length, `mounted at ${degrees}°`).toBeLessThanOrEqual(READER_BUDGETS.MAX_MOUNTED_PAGES);
        expect(pages).toContain(120);
      }
    } finally {
      await server.close();
    }
  });

  test("the thumbnail panel renders a window, not a book", async ({ page, isMobile }, testInfo) => {
    test.setTimeout(6 * 60_000);
    const pdf = makeLargeTestPdf({ pages: PAGES, bytesPerPage: 24 * 1024, label: "PTEC thumbs" });
    const server = await startPdfServer(pdf);
    try {
      await openReader(page, isMobile, server);
      const before = await counts(page);
      // Open the panel and switch to Pages, three times over — a sidebar that
      // leaks canvases leaks them on the second open, not the first.
      let peak = before;
      for (let i = 0; i < 3; i++) {
        await reveal(page);
        await page.getByRole("button", { name: /reader navigation/i }).first().click();
        await page.getByRole("tab", { name: /pages/i }).click();
        await expect(page.locator(".react-pdf__Page canvas").nth(1)).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(1_200);
        const open = await counts(page);
        if (open.canvases > peak.canvases) peak = open;
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }
      const after = await counts(page);
      writeReport(`thumbnails-${testInfo.project.name.replace(/\s+/g, "-")}`, { before, peak, after });
      console.log(`\n[reader-thumbs ${testInfo.project.name}] before ${before.canvases} canvases → peak ${peak.canvases} (${peak.canvasMB} MB) → after ${after.canvases}`);
      // A 500-page book must not put 500 thumbnails in the DOM.
      expect(peak.canvases).toBeLessThanOrEqual(
        READER_BUDGETS.MAX_MOUNTED_PAGES + READER_BUDGETS.MAX_THUMBNAILS_MOUNTED + 2,
      );
      // Closing gives the memory back: what remains is the reader's own
      // mounted window (which grows as prefetch settles), not the column.
      expect(after.canvases).toBeLessThanOrEqual(after.mounted + 2);
    } finally {
      await server.close();
    }
  });

  test("search over 500 pages stays cancellable and never blocks the reader", async ({ page, isMobile }, testInfo) => {
    test.setTimeout(6 * 60_000);
    const pdf = makeLargeTestPdf({ pages: PAGES, bytesPerPage: 8 * 1024, label: "PTEC search" });
    const server = await startPdfServer(pdf);
    try {
      await openReader(page, isMobile, server);
      await reveal(page);
      await page.keyboard.press("/");
      const input = page.getByRole("searchbox", { name: /search this book/i });
      await expect(input).toBeFocused();
      // Type a prefix, then refine: the first scan must be cancelled, not
      // finished, or the reader pays for both.
      const t0 = Date.now();
      await input.fill("page 4");
      await page.waitForTimeout(500);
      await input.fill("page 431");
      await expect(page.getByText(/1 of 1/)).toBeVisible({ timeout: 90_000 });
      const ms = Date.now() - t0;
      await expect(pageIndicator(page)).toHaveAttribute("aria-label", `Page 431 of ${PAGES}`);
      // The reader is still interactive while/after searching.
      await page.keyboard.press("Escape");
      await reveal(page);
      await page.keyboard.press("Home");
      await expect(pageIndicator(page)).toHaveAttribute("aria-label", `Page 1 of ${PAGES}`);
      const c = await counts(page);
      writeReport(`search-${testInfo.project.name.replace(/\s+/g, "-")}`, { ms, ...c });
      console.log(`\n[reader-search ${testInfo.project.name}] refined search over ${PAGES} pages: ${ms} ms, ${c.mounted} pages mounted, ${c.canvasMB} MB canvas`);
      expect(c.mounted).toBeLessThanOrEqual(READER_BUDGETS.MAX_MOUNTED_PAGES);
    } finally {
      await server.close();
    }
  });

  test("touch gestures: swipe turns a page, double tap zooms, a zoomed swipe pans", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch only");
    test.setTimeout(6 * 60_000);
    const pdf = makeLargeTestPdf({ pages: 40, bytesPerPage: 24 * 1024, label: "PTEC gestures" });
    const server = await startPdfServer(pdf);
    try {
      await openReader(page, isMobile, server);
      // Single-page mode is where a swipe turns a page.
      await reveal(page);
      await page.getByRole("button", { name: /more options/i }).first().click();
      await page.getByRole("menuitemradio", { name: /single page/i }).click();
      await expect(page.locator(".react-pdf__Page canvas").first()).toBeVisible({ timeout: 30_000 });
      await expect(pageIndicator(page)).toHaveAttribute("aria-label", "Page 1 of 40");

      const box = (await page.locator("[data-reader-root]").boundingBox())!;
      const midY = box.y + box.height / 2;
      // Playwright's touchscreen offers tap only, so a swipe is dispatched as
      // the touch sequence a finger produces — real Touch objects, real
      // TouchEvents, through the same listeners the reader binds.
      const doSwipe = (dx: number) =>
        page.evaluate(
          ({ dx, y }) => {
            // The DOCUMENT AREA, not the root: the gesture listeners are
            // bound there, and a DOM event dispatched on an ancestor never
            // reaches a descendant's listener.
            const el = document.querySelector("[data-reader-doc]")!;
            const start = 300;
            const touch = (x: number) => [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })];
            el.dispatchEvent(new TouchEvent("touchstart", { touches: touch(start), bubbles: true, cancelable: true }));
            el.dispatchEvent(new TouchEvent("touchmove", { touches: touch(start + dx / 2), bubbles: true, cancelable: true }));
            el.dispatchEvent(
              new TouchEvent("touchend", {
                touches: [],
                changedTouches: touch(start + dx),
                bubbles: true,
                cancelable: true,
              }),
            );
          },
          { dx, y: Math.round(midY) },
        );

      await doSwipe(-120); // right-to-left → next page
      await expect(pageIndicator(page)).toHaveAttribute("aria-label", "Page 2 of 40");
      await doSwipe(120); // back
      await expect(pageIndicator(page)).toHaveAttribute("aria-label", "Page 1 of 40");

      // Double tap zooms in; a swipe while zoomed must PAN, not turn the page.
      const zoomBefore = await zoomButton(page).textContent();
      await page.touchscreen.tap(box.x + box.width / 2, midY);
      await page.touchscreen.tap(box.x + box.width / 2, midY);
      await expect(zoomButton(page)).not.toHaveText(zoomBefore ?? "", { timeout: 15_000 });
      await doSwipe(-120);
      await expect(pageIndicator(page)).toHaveAttribute("aria-label", "Page 1 of 40");
    } finally {
      await server.close();
    }
  });
});
