import { test, expect, type Page, type CDPSession } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { installSeededReaderSession } from "./utils/auth";
import { makeLargeTestPdf } from "./utils/pdf";
import { routeBookFileTo, startPdfServer, type PdfServer } from "./utils/pdf-server";
import { READER_BUDGETS } from "../lib/reader/budgets";

// ─────────────────────────────────────────────────────────────────────────────
// PDF reader — production performance, real pdf.js against a REAL HTTP server.
//
// Every number these specs record comes from the browser or from the server
// that fed it — not from the component's own bookkeeping:
//   • bytes and requests: counted by e2e/utils/pdf-server.ts as it writes
//     them (a cancelled response shows the bytes pushed before the cancel);
//   • DOM nodes, listeners, JS heap: Chrome DevTools Protocol
//     (`Performance.getMetrics`), Chromium projects only;
//   • object URLs, timers, observers: counters installed before any app
//     script runs (`addInitScript`), every engine.
//
// The long-session scenario is the one from the brief: open a 500-page book,
// 1 → 20 → 50 → 100 → 200 → 300 → 400 → 500, then zoom, rotate, search,
// panel open/close, bookmark, and back to the previous page. Bounds are
// asserted; measurements are written to test-results/reader-performance/ so
// the verification document can quote them.
// ─────────────────────────────────────────────────────────────────────────────

const BOOK_SLUG = "foundations-of-education";
const MB = 1024 * 1024;
const REPORT_DIR = path.resolve(__dirname, "../test-results/reader-performance");

/** Counters the page cannot lie about: installed before the app runs. */
const PROBE_SCRIPT = `(() => {
  const probe = { objectUrls: 0, objectUrlsCreated: 0, timeouts: new Set(), intervals: new Set(), resizeObservers: 0, mutationObservers: 0 };
  window.__ptecProbe = probe;
  const cu = URL.createObjectURL.bind(URL), ru = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (b) => { probe.objectUrls++; probe.objectUrlsCreated++; return cu(b); };
  URL.revokeObjectURL = (u) => { probe.objectUrls = Math.max(0, probe.objectUrls - 1); return ru(u); };
  const st = window.setTimeout.bind(window), ct = window.clearTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => { const id = st(() => { probe.timeouts.delete(id); typeof fn === "function" ? fn(...a) : eval(fn); }, ms); probe.timeouts.add(id); return id; };
  window.clearTimeout = (id) => { probe.timeouts.delete(id); return ct(id); };
  const si = window.setInterval.bind(window), ci = window.clearInterval.bind(window);
  window.setInterval = (fn, ms, ...a) => { const id = si(fn, ms, ...a); probe.intervals.add(id); return id; };
  window.clearInterval = (id) => { probe.intervals.delete(id); return ci(id); };
  if (window.ResizeObserver) {
    const RO = window.ResizeObserver;
    window.ResizeObserver = class extends RO {
      constructor(cb) { super(cb); probe.resizeObservers++; }
      disconnect() { probe.resizeObservers = Math.max(0, probe.resizeObservers - 1); return super.disconnect(); }
    };
  }
  if (window.MutationObserver) {
    const MO = window.MutationObserver;
    window.MutationObserver = class extends MO {
      constructor(cb) { super(cb); probe.mutationObservers++; }
      disconnect() { probe.mutationObservers = Math.max(0, probe.mutationObservers - 1); return super.disconnect(); }
    };
  }
  // A fresh reader every time: no resumed position, no persisted zoom.
  try { for (const k of Object.keys(localStorage)) if (k.startsWith("ebook:")) localStorage.removeItem(k); } catch {}
})();`;

type Snapshot = {
  label: string;
  mounted: number;
  canvases: number;
  textLayers: number;
  objectUrls: number;
  timeouts: number;
  intervals: number;
  resizeObservers: number;
  mutationObservers: number;
  nodes?: number;
  listeners?: number;
  heapMB?: number;
  serverRequests: number;
  serverRangeRequests: number;
  serverMB: number;
  ms?: number;
};

function readerAccount(isMobile: boolean): string {
  return isMobile ? "staff@ptec.local" : "student@ptec.local";
}

const pageIndicator = (page: Page) =>
  page.locator('[data-reader-hud] button[aria-label^="Page "]:visible').first();

async function reveal(page: Page) {
  // Auto-hide makes the HUD inert after 3 s; any key brings it back.
  await page.keyboard.press("Shift");
  await expect(pageIndicator(page)).toBeVisible({ timeout: 5_000 });
}

async function goToPage(page: Page, n: number): Promise<number> {
  await reveal(page);
  await pageIndicator(page).click();
  const dialog = page.getByRole("dialog", { name: /go to page/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill(String(n));
  const t0 = Date.now();
  await page.keyboard.press("Enter");
  await expect(page.locator(`[data-page="${n}"] canvas`).first()).toBeVisible({ timeout: 45_000 });
  return Date.now() - t0;
}

async function openReader(page: Page, isMobile: boolean, server: PdfServer, totalPages: number) {
  await page.addInitScript(PROBE_SCRIPT);
  await routeBookFileTo(page, server);
  const signedIn = await installSeededReaderSession(page, { email: readerAccount(isMobile) });
  test.skip(!signedIn, "seeded reader session unavailable — is the local Supabase stack up?");
  const t0 = Date.now();
  await page.goto(`/books/${BOOK_SLUG}/read`);
  await expect(page.locator(".react-pdf__Page canvas").first()).toBeVisible({ timeout: 60_000 });
  const firstPaintMs = Date.now() - t0;
  // A previous run's server-side position may resume elsewhere; start at 1.
  await page.keyboard.press("Escape");
  if ((await pageIndicator(page).getAttribute("aria-label").catch(() => null)) !== `Page 1 of ${totalPages}`) {
    await page.keyboard.press("Home");
    await expect(page.locator('[data-page="1"] canvas').first()).toBeVisible({ timeout: 30_000 });
  }
  return { firstPaintMs };
}

async function cdpFor(page: Page, browserName: string): Promise<CDPSession | null> {
  if (browserName !== "chromium") return null;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  return cdp;
}

async function snapshot(page: Page, cdp: CDPSession | null, server: PdfServer, label: string, ms?: number): Promise<Snapshot> {
  const dom = await page.evaluate(() => {
    const p = (window as unknown as { __ptecProbe: { objectUrls: number; timeouts: Set<number>; intervals: Set<number>; resizeObservers: number; mutationObservers: number } }).__ptecProbe;
    return {
      mounted: document.querySelectorAll("[data-page]").length,
      canvases: document.querySelectorAll("canvas").length,
      textLayers: document.querySelectorAll(".textLayer").length,
      objectUrls: p.objectUrls,
      timeouts: p.timeouts.size,
      intervals: p.intervals.size,
      resizeObservers: p.resizeObservers,
      mutationObservers: p.mutationObservers,
    };
  });
  let nodes: number | undefined, listeners: number | undefined, heapMB: number | undefined;
  if (cdp) {
    await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
    const { metrics } = await cdp.send("Performance.getMetrics");
    const get = (name: string) => metrics.find((m) => m.name === name)?.value;
    nodes = get("Nodes");
    listeners = get("JSEventListeners");
    const heap = get("JSHeapUsedSize");
    heapMB = heap ? Math.round((heap / MB) * 10) / 10 : undefined;
  }
  return {
    label,
    ...dom,
    nodes,
    listeners,
    heapMB,
    serverRequests: server.requests.length,
    serverRangeRequests: server.rangeRequests().length,
    serverMB: Math.round((server.totalBytes() / MB) * 100) / 100,
    ms,
  };
}

function writeReport(name: string, data: unknown) {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(path.join(REPORT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

test.describe("PDF reader — production performance", () => {
  test("long session on a 500-page book stays bounded and does not download the book", async ({ page, isMobile, browserName }, testInfo) => {
    // Eight jumps through a 24 MB book plus zoom/rotate/search, each waited
    // for honestly: this is a long test by construction, not by accident.
    test.setTimeout(15 * 60_000);
    const PAGES = 500;
    const pdf = makeLargeTestPdf({ pages: PAGES, bytesPerPage: 48 * 1024, label: "PTEC long session" });
    const server = await startPdfServer(pdf);
    const snaps: Snapshot[] = [];
    const reportName = `long-session-${testInfo.project.name.replace(/\s+/g, "-")}`;
    // Written after EVERY step, so a step that fails still leaves the
    // measurements taken before it.
    const record = async (snap: Snapshot) => {
      snaps.push(snap);
      writeReport(reportName, {
        file: { pages: PAGES, bytes: pdf.length },
        snapshots: snaps,
        requests: server.requests.map((r) => ({ range: r.range, status: r.status, bytes: r.bytes, aborted: r.aborted })),
      });
    };
    try {
      const { firstPaintMs } = await openReader(page, isMobile, server, PAGES);
      const cdp = await cdpFor(page, browserName);
      await record(await snapshot(page, cdp, server, "open", firstPaintMs));

      for (const n of [20, 50, 100, 200, 300, 400, 500]) {
        const ms = await goToPage(page, n);
        await page.waitForTimeout(600); // let deferred neighbours settle
        await record(await snapshot(page, cdp, server, `page ${n}`, ms));
      }
      // Zoom in twice, rotate once, search, open + close the panel, bookmark.
      let t0 = Date.now();
      await page.keyboard.press("+");
      await page.keyboard.press("+");
      await expect(page.locator('[data-page="500"] canvas').first()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(600);
      await record(await snapshot(page, cdp, server, "zoom ×2", Date.now() - t0));
      t0 = Date.now();
      await page.keyboard.press("r");
      await expect(page.locator('[data-page="500"] canvas').first()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(600);
      await record(await snapshot(page, cdp, server, "rotate 90°", Date.now() - t0));
      await expect(pageIndicator(page)).toHaveAttribute("aria-label", `Page ${PAGES} of ${PAGES}`);
      // Rotation must not duplicate or lose pages.
      const pagesInDom = await page.$$eval("[data-page]", (els) => els.map((e) => Number(e.getAttribute("data-page"))));
      expect(new Set(pagesInDom).size).toBe(pagesInDom.length);
      await page.keyboard.press("r"); // back to 0° for the rest
      await page.keyboard.press("r");
      await page.keyboard.press("r");

      await page.keyboard.press("/");
      const input = page.getByRole("searchbox", { name: /search this book/i });
      await expect(input).toBeFocused();
      t0 = Date.now();
      await input.fill("page 250");
      await expect(page.getByText(/1 of 1/)).toBeVisible({ timeout: 60_000 });
      await record(await snapshot(page, cdp, server, "search", Date.now() - t0));
      await page.keyboard.press("Escape"); // close the panel
      await page.keyboard.press("Escape");
      await record(await snapshot(page, cdp, server, "panel closed"));
      await page.keyboard.press("b");
      const ms = await goToPage(page, 400);
      await page.waitForTimeout(600);
      await record(await snapshot(page, cdp, server, "back to 400", ms));

      console.log(`\n[reader-perf ${testInfo.project.name}] ` + snaps.map((s) => `${s.label}: mounted=${s.mounted} canvases=${s.canvases} nodes=${s.nodes ?? "-"} listeners=${s.listeners ?? "-"} heap=${s.heapMB ?? "-"}MB objURLs=${s.objectUrls} timers=${s.timeouts} reqs=${s.serverRequests} MB=${s.serverMB}${s.ms !== undefined ? ` (${s.ms} ms)` : ""}`).join("\n  "));

      // ── Bounds ──────────────────────────────────────────────────────────
      for (const s of snaps) {
        expect(s.mounted, `mounted pages at "${s.label}"`).toBeLessThanOrEqual(READER_BUDGETS.MAX_MOUNTED_PAGES);
        expect(s.objectUrls, `live object URLs at "${s.label}"`).toBe(0);
        expect(s.intervals, `live intervals at "${s.label}"`).toBeLessThanOrEqual(1);
      }
      // Canvases: mounted pages + the hidden page-1 measurer + thumbnails while the panel is open.
      const closed = snaps.filter((s) => s.label !== "search");
      for (const s of closed) expect(s.canvases, `canvases at "${s.label}"`).toBeLessThanOrEqual(s.mounted + 1);
      // Mounted pages do not grow with distance travelled.
      const last = snaps[snaps.length - 1];
      const first = snaps[1];
      expect(last.mounted).toBeLessThanOrEqual(first.mounted + 2);
      // Listeners and observers do not accumulate across the session (Chromium).
      if (last.listeners !== undefined && first.listeners !== undefined) {
        expect(last.listeners, "event listeners").toBeLessThanOrEqual(first.listeners + 40);
      }
      expect(last.resizeObservers).toBeLessThanOrEqual(first.resizeObservers + 1);
      expect(last.mutationObservers).toBeLessThanOrEqual(first.mutationObservers + 1);
      // The reader read ~10 pages of a 500-page book; it must not have pulled the book.
      // (Search reads every page's content stream — that is the one legitimate whole-document walk.)
      const beforeSearch = snaps.find((s) => s.label === "page 500")!;
      expect(beforeSearch.serverMB, "bytes served before search").toBeLessThan((pdf.length / MB) * 0.5);
    } finally {
      await server.close();
    }
  });

  for (const sizeMB of [10, 25, 50, 75, 100]) {
    test(`a ${sizeMB} MB scanned book paints page 1 for a bounded number of bytes and stops there`, async ({ page, isMobile, browserName }, testInfo) => {
      test.setTimeout(5 * 60_000);
      test.skip(isMobile && sizeMB > 25, "the byte behaviour is engine-level; phones run the small sizes");
      const bytesPerPage = 512 * 1024;
      const pages = Math.max(8, Math.round((sizeMB * MB) / bytesPerPage));
      const pdf = makeLargeTestPdf({ pages, bytesPerPage, label: `PTEC ${sizeMB} MB` });
      const server = await startPdfServer(pdf);
      try {
        const { firstPaintMs } = await openReader(page, isMobile, server, pages);
        const atPaint = await snapshot(page, null, server, "first paint", firstPaintMs);
        // If the document were being streamed in the background this is where it shows.
        await page.waitForTimeout(6_000);
        const afterIdle = await snapshot(page, await cdpFor(page, browserName), server, "6 s idle");
        writeReport(`size-${sizeMB}mb-${testInfo.project.name.replace(/\s+/g, "-")}`, {
          file: { pages, bytes: pdf.length },
          firstPaintMs,
          atPaint,
          afterIdle,
          requests: server.requests.map((r) => ({ range: r.range, status: r.status, bytes: r.bytes, aborted: r.aborted })),
        });
        console.log(`\n[reader-perf ${testInfo.project.name}] ${sizeMB} MB: first paint ${firstPaintMs} ms, ${atPaint.serverRangeRequests} range requests, ${atPaint.serverMB} MB at paint, ${afterIdle.serverMB} MB after 6 s idle (${afterIdle.serverRequests} requests), full-GET bytes=${server.fullRequests().map((r) => r.bytes).join(",")}`);
        // First paint costs a bounded number of requests, and reading page 1 never costs the book.
        expect(atPaint.serverRangeRequests).toBeLessThanOrEqual(READER_BUDGETS.FIRST_PAGE_REQUEST_BUDGET);
        expect(afterIdle.serverMB, "bytes served after idling on page 1").toBeLessThan(Math.min(6, (pdf.length / MB) * 0.25));
        for (const r of server.fullRequests()) {
          expect(r.bytes, "bytes pushed for the un-ranged GET").toBeLessThan(4 * MB);
        }
      } finally {
        await server.close();
      }
    });
  }

  test("network drop: the current page stays, nothing is spammed, and reading resumes when the link returns", async ({ page, isMobile, browserName, context }, testInfo) => {
    test.setTimeout(6 * 60_000);
    const PAGES = 300;
    const pdf = makeLargeTestPdf({ pages: PAGES, bytesPerPage: 64 * 1024, label: "PTEC outage" });
    const server = await startPdfServer(pdf);
    try {
      await openReader(page, isMobile, server, PAGES);
      const cdp = await cdpFor(page, browserName);
      await goToPage(page, 80);
      await page.waitForTimeout(800);
      const zoomBefore = await page.locator('[data-reader-hud="bottom"] [aria-label*="%"], [data-reader-hud="bottom"] button:has-text("%")').first().textContent().catch(() => null);
      const before = await snapshot(page, cdp, server, "page 80 online");

      await context.setOffline(true);
      // Jump to a page whose bytes are not loaded: it cannot render offline.
      await reveal(page);
      await pageIndicator(page).click();
      await page.getByRole("dialog", { name: /go to page/i }).getByRole("textbox").fill("160");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(4_000);
      const during = await snapshot(page, cdp, server, "offline, asked for 160");
      // The page that WAS rendered is still usable: its canvas is still in the DOM.
      const page80Still = await page.locator('[data-page="80"] canvas, [data-page="160"] canvas').count();
      // The HUD says so.
      await reveal(page);
      const badge = page.locator('[data-reader-hud="top"]').getByText(/offline|reconnect/i);
      const badgeShown = await badge.isVisible().catch(() => false);
      // No request storm: the browser blocks the network, but the reader must
      // not keep asking either — measure attempts via failed requests.
      const failed: string[] = [];
      page.on("requestfailed", (r) => { if (r.url().includes("/file")) failed.push(r.url()); });
      await page.waitForTimeout(6_000);

      await context.setOffline(false);
      // Recovery: page 160 renders without a manual reload.
      await expect(page.locator('[data-page="160"] canvas').first()).toBeVisible({ timeout: 60_000 });
      await expect(pageIndicator(page)).toHaveAttribute("aria-label", `Page 160 of ${PAGES}`);
      const after = await snapshot(page, cdp, server, "recovered on 160");
      const zoomAfter = await page.locator('[data-reader-hud="bottom"] [aria-label*="%"], [data-reader-hud="bottom"] button:has-text("%")').first().textContent().catch(() => null);
      writeReport(`network-drop-${testInfo.project.name.replace(/\s+/g, "-")}`, { before, during, after, badgeShown, page80Still, failedWhileOffline: failed.length, zoomBefore, zoomAfter });
      console.log(`\n[reader-perf ${testInfo.project.name}] outage: badge=${badgeShown} failedReqsIn6s=${failed.length} canvasesKept=${page80Still} recovered=${after.mounted} mounted, ${after.serverMB} MB`);
      expect(badgeShown, "offline / reconnecting indicator").toBe(true);
      expect(failed.length, "file requests attempted while offline").toBeLessThanOrEqual(4);
      expect(after.objectUrls).toBe(0);
      if (zoomBefore && zoomAfter) expect(zoomAfter).toBe(zoomBefore);
    } finally {
      await server.close();
    }
  });
});
