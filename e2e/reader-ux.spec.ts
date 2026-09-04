import { test, expect, type Page } from "@playwright/test";
import { installSeededReaderSession } from "./utils/auth";
import { makeTestPdf } from "./utils/pdf";

// ─────────────────────────────────────────────────────────────────────────────
// PDF reader UX — real pdf.js, real layout, a generated multi-page PDF.
//
// The file route is stubbed with a genuine PDF so the specs exercise the whole
// reader (worker, text layer, virtualiser, HUD, dialogs) without depending on
// the storage service. Auth comes from installSeededReaderSession() — a real
// GoTrue password grant — because /books/[slug]/read is gated.
// ─────────────────────────────────────────────────────────────────────────────

const BOOK_SLUG = "foundations-of-education";
const PAGES = 40;
const PDF = makeTestPdf(PAGES, "PTEC reader UX spec");

async function stubBookFile(page: Page) {
  await page.route("**/api/books/*/file*", async (route) => {
    const range = route.request().headers()["range"];
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? Number(m[1]) : 0;
      const end = m && m[2] ? Math.min(Number(m[2]), PDF.length - 1) : PDF.length - 1;
      await route.fulfill({
        status: 206,
        headers: {
          "content-type": "application/pdf",
          "content-length": String(end - start + 1),
          "content-range": `bytes ${start}-${end}/${PDF.length}`,
          "accept-ranges": "bytes",
          "cache-control": "private, no-store",
        },
        body: PDF.subarray(start, end + 1),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-length": String(PDF.length),
        "accept-ranges": "bytes",
        "cache-control": "private, no-store",
      },
      body: PDF,
    });
  });
}

/**
 * Reading progress is per ACCOUNT, and two things make it leak between tests
 * that share one:
 *   • the two Playwright projects run in parallel, so one worker's autosave
 *     becomes the other's resume position;
 *   • since the teardown flush became a `keepalive` beacon it deliberately
 *     OUTLIVES its page, so a request fired as one test's page closed can
 *     land while the next test is already running. (That is the feature: close
 *     a tab at page 7, reopen the book, resume at page 7.)
 *
 * So every project reads as a different seeded user, and the one test that
 * asserts on a resumed position takes an account of its own — no other test's
 * beacon can reach its row.
 */
function readerAccount(isMobile: boolean, isolated = false): string {
  if (isolated) return isMobile ? "admin@ptec.local" : "librarian@ptec.local";
  return isMobile ? "staff@ptec.local" : "student@ptec.local";
}

async function openReader(page: Page, isMobile: boolean, opts: { isolatedAccount?: boolean } = {}) {
  await stubBookFile(page);
  const signedIn = await installSeededReaderSession(page, {
    email: readerAccount(isMobile, opts.isolatedAccount),
  });
  test.skip(!signedIn, "seeded reader session unavailable — is the local Supabase stack up?");
  await page.goto(`/books/${BOOK_SLUG}/read`);
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("ebook:")) localStorage.removeItem(k);
  });
  await page.reload();
  await expect(page.locator(".react-pdf__Page canvas").first()).toBeVisible({ timeout: 30_000 });
  // The seeded account keeps server-side progress across runs, so a previous
  // run's last page would be resumed (correctly). Start every spec at page 1
  // and let the autosave record that, so the NEXT run starts there too.
  const indicator = pageIndicator(page);
  if ((await indicator.getAttribute("aria-label")) !== "Page 1 of 40") {
    await page.keyboard.press("Escape"); // the welcome-back card, if any
    await page.keyboard.press("Home");
    await expect(indicator).toHaveAttribute("aria-label", "Page 1 of 40");
    await page.waitForTimeout(1800); // AUTOSAVE_MS + margin
  }
}

const reader = (page: Page) => page.locator("[data-reader-root]");
const topBar = (page: Page) => page.locator('[data-reader-hud="top"]');
// CSS, not role: a hidden HUD is aria-hidden and would vanish from role
// queries mid-test. The label is asserted the same way either way.
const pageIndicator = (page: Page) => page.locator('[data-reader-hud] button[aria-label^="Page "]:visible').first();

test.describe("PDF reader", () => {
  test.slow();

  test("paints page 1 promptly and never mounts the whole book", async ({ page, isMobile }) => {
    // The reader's own measure (docs/LARGE-PDF-PERFORMANCE-AUDIT.md): the
    // pdf_first_page beacon carries time-to-first-paint and the request count
    // behind it. Wall-clock from goto() would mostly measure the dev server.
    const beacons: Array<Record<string, unknown>> = [];
    await page.route("**/api/reader-events", async (route) => {
      try {
        beacons.push(JSON.parse(route.request().postData() ?? "{}"));
      } catch {
        /* not JSON */
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" });
    });
    await openReader(page, isMobile);
    await expect(pageIndicator(page)).toHaveAttribute("aria-label", "Page 1 of 40");
    await expect.poll(() => beacons.find((b) => b.type === "pdf_first_page"), { timeout: 10_000 }).toBeTruthy();
    const first = beacons.find((b) => b.type === "pdf_first_page")!;
    expect(first.durationMs as number).toBeLessThan(10_000);
    expect(first.requests as number).toBeLessThanOrEqual(3); // a small generated PDF is one range or two
    expect(first).not.toHaveProperty("text");
    expect(beacons.filter((b) => b.type === "pdf_first_page")).toHaveLength(1);
    // Visible window + at most 3 rows of overscan per side — never the book.
    const mounted = await page.locator("[data-page]").count();
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(PAGES / 2);
    // No horizontal overflow at this viewport.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("HUD hides after inactivity, returns on movement, and is inert while hidden", async ({ page, isMobile }) => {
    await openReader(page, isMobile);
    const vp = page.viewportSize()!;

    // The contract is "activity shows, idle hides" — not "the HUD is up when
    // this test happens to start looking". Opening the reader can itself take
    // longer than the 3 s idle delay, so establish the visible state with a
    // deliberate act. Moving onto the page also parks Playwright's pointer,
    // which starts at (0,0) — inside the top bar, where hovering legitimately
    // pauses hiding.
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.waitForTimeout(150);
    expect(await topBar(page).getAttribute("inert")).toBeNull();

    await page.waitForTimeout(3600);
    await expect(topBar(page)).toHaveAttribute("inert", "");

    // Reveal with the gesture the device actually has. A phone has no hover:
    // a reader brings the controls back by TAPPING the page, which the hook
    // hears as pointerdown/touchstart. Driving a synthetic mouse move at a
    // touch-emulated viewport tests an input that device cannot produce.
    if (isMobile) {
      await page.touchscreen.tap(vp.width / 2, vp.height / 2);
    } else {
      await page.mouse.move(200, 300);
      await page.mouse.move(240, 320);
    }
    // Read the state ONCE, shortly after the gesture, rather than letting a
    // retrying assertion poll: the controls hide again 3 s after the last
    // activity, so a poll that is starved for a few seconds under parallel
    // load would observe the NEXT hide and report the reveal as broken.
    await page.waitForTimeout(150);
    expect(await topBar(page).getAttribute("inert")).toBeNull();
  });

  test("page navigation: keyboard, Go to page with clamping, Escape", async ({ page, isMobile }) => {
    await openReader(page, isMobile);
    await page.keyboard.press("ArrowRight");
    await expect(pageIndicator(page)).toHaveAttribute("aria-label", "Page 2 of 40");
    await page.keyboard.press("End");
    await expect(pageIndicator(page)).toHaveAttribute("aria-label", "Page 40 of 40");
    await pageIndicator(page).click();
    const dialog = page.getByRole("dialog", { name: "Go to page" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox").fill("999");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(pageIndicator(page)).toHaveAttribute("aria-label", "Page 40 of 40");
    await pageIndicator(page).click();
    await dialog.getByRole("textbox").fill("5");
    await page.keyboard.press("Enter");
    await expect(pageIndicator(page)).toHaveAttribute("aria-label", "Page 5 of 40");
    await pageIndicator(page).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("focus reading mode fills the viewport and Escape leaves it", async ({ page, isMobile }) => {
    await openReader(page, isMobile);
    await page.keyboard.press("f");
    await expect(reader(page)).toHaveAttribute("role", "dialog");
    const box = await reader(page).boundingBox();
    const vp = page.viewportSize()!;
    expect(box?.width).toBe(vp.width);
    expect(box?.height).toBe(vp.height);
    await page.keyboard.press("Escape");
    await expect(reader(page)).not.toHaveAttribute("role", "dialog");
  });

  test("search finds text across pages and highlights the active match", async ({ page, isMobile }) => {
    await openReader(page, isMobile);
    await page.keyboard.press("/");
    const input = page.getByRole("searchbox", { name: "Search this book" });
    await expect(input).toBeFocused();
    await input.fill("page 7");
    await expect(page.getByText("1 of 1")).toBeVisible({ timeout: 20_000 });
    await expect(pageIndicator(page)).toHaveAttribute("aria-label", "Page 7 of 40");
    await expect(page.locator(".ebook-mark-current")).toHaveCount(1, { timeout: 10_000 });
  });

  test("bookmarks persist and resume returns to the exact page with a prompt", async ({ page, isMobile }) => {
    await openReader(page, isMobile, { isolatedAccount: true });
    // A reader reads before turning: the page-1 autosave (1.5 s debounce +
    // server latency) must be clearly OLDER than the position written below,
    // or the resume rule rightly treats the two as concurrent.
    await page.waitForTimeout(3500);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("b");
    await expect(page.getByRole("button", { name: "Remove bookmark" }).first()).toBeVisible();
    // Let the exact-page position persist, then come back.
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.locator(".react-pdf__Page canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect(pageIndicator(page)).toHaveAttribute("aria-label", "Page 3 of 40");
    await expect(page.getByText("Welcome back")).toBeVisible();
    await page.getByRole("button", { name: "Start from beginning" }).click();
    await expect(pageIndicator(page)).toHaveAttribute("aria-label", "Page 1 of 40");
    const bookmarks = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith("ebook:bm:"))?.[1]);
    expect(bookmarks).toBe("[3]");
  });

  test("every HUD control is touch-sized on a phone and the panel is a bottom sheet", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layout only");
    await openReader(page, isMobile);
    for (const bar of await page.locator("[data-reader-hud]").all()) {
      for (const control of await bar.locator("button:visible, a:visible").all()) {
        const box = await control.boundingBox();
        expect(box?.width, await control.getAttribute("aria-label") ?? "").toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.keyboard.press("Shift"); // measuring took a while — bring the HUD back
    await page.getByRole("button", { name: "Reader navigation" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Reader navigation" });
    await expect(sheet).toBeVisible();
    // Anchored to the bottom of the READER, which itself stops above the
    // site's fixed tab bar on phones (ReaderViewportFill).
    const sheetBox = await sheet.boundingBox();
    const readerBox = await reader(page).boundingBox();
    expect(Math.abs(sheetBox!.y + sheetBox!.height - (readerBox!.y + readerBox!.height))).toBeLessThanOrEqual(2);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });

  test("no horizontal overflow at the narrow phone widths", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop project drives the viewport loop");
    await openReader(page, isMobile);
    for (const width of [320, 360, 375, 390, 414]) {
      await page.setViewportSize({ width, height: 740 });
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        reader: (() => {
          const r = document.querySelector("[data-reader-root]")!;
          return r.scrollWidth - r.clientWidth;
        })(),
      }));
      expect(overflow.doc, `document overflow at ${width}`).toBeLessThanOrEqual(0);
      expect(overflow.reader, `reader overflow at ${width}`).toBeLessThanOrEqual(0);
    }
  });
});
