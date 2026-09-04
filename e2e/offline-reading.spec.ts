import { test, expect, type Page } from "@playwright/test";
import { installSeededReaderSession } from "./utils/auth";
import { makeTestPdf } from "./utils/pdf";

// ─────────────────────────────────────────────────────────────────────────────
// Offline reading — against REAL browser Cache Storage.
//
// The suite deliberately does not mock `window.caches`: the bug this feature
// existed to fix (a saved PDF that could not be opened) lived precisely in the
// gap between "a fake cache said yes" and what a browser actually stores, keys
// and matches. Everything below opens the same Cache Storage the service
// worker uses, under the same names.
//
// The service worker is DISABLED in development (next.config.ts), and the
// Playwright webServer runs `npm run dev`. So the specs are split:
//
//   • Page-level behaviour — save + verify, availability, the reader reading
//     from cache instead of the network, removal — runs everywhere. Network
//     independence is proved by ABORTING the file endpoint, which is a
//     stronger statement than "the browser was offline": the request would
//     fail even if something tried to make it.
//   • True offline navigation (document loads with the radio off) needs the
//     worker, so it is skipped unless one is controlling the page. Run it
//     against a production build: `npm run build && npm run start`, then
//     `npx playwright test e2e/offline-reading.spec.ts`.
// ─────────────────────────────────────────────────────────────────────────────

const BOOK_SLUG = "foundations-of-education";
const BOOK_ID = "33333333-3333-4333-8333-333333333301";
const PDF = makeTestPdf();
const PDF_B64 = PDF.toString("base64");
const OFFLINE_CACHE = "offline-books";

/** Serve a real PDF for the book file endpoint, whatever the storage backend
 *  would have done. Returns a counter of how many times it was asked. */
async function stubBookFile(page: Page) {
  const calls = { count: 0 };
  await page.route("**/api/books/*/file*", async (route) => {
    calls.count += 1;
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
  return calls;
}

/** Put a book into Cache Storage + localStorage exactly as a save would. */
async function seedSavedBook(
  page: Page,
  opts: { withBytes?: boolean; ownerKey?: string | null } = {},
) {
  const { withBytes = true, ownerKey = null } = opts;
  await page.evaluate(
    async ({ id, b64, withBytes, ownerKey }) => {
      if (withBytes) {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const cache = await caches.open("offline-books");
        await cache.put(
          `/api/books/${id}/file?offline=1`,
          new Response(bytes, {
            status: 200,
            headers: {
              "content-type": "application/pdf",
              "content-length": String(bytes.length),
            },
          }),
        );
      }
      localStorage.setItem(
        "ptec_offline_books",
        JSON.stringify([
          {
            id,
            slug: "foundations-of-education",
            title: "Foundations of Education",
            author: "Seeded Author",
            coverUrl: null,
            pdfUrl: `/api/books/${id}/file`,
            cachedPdfUrl: `/api/books/${id}/file?offline=1`,
            sizeBytes: 600,
            savedAt: Date.now(),
            ownerKey,
            version: 2,
          },
        ]),
      );
      if (ownerKey) localStorage.setItem("ptec_offline_owner", ownerKey);
    },
    { id: BOOK_ID, b64: PDF_B64, withBytes, ownerKey },
  );
}

/** What is actually in Cache Storage, asked the way the reader asks. */
async function inspectCache(page: Page) {
  return page.evaluate(async ({ id, cacheName }) => {
    const cache = await caches.open(cacheName);
    const keys = (await cache.keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search);
    // The saved copy is keyed with ?offline=1; the reader asks for the bare
    // URL. ignoreSearch is the bridge, and it is the whole storage contract.
    const bare = await cache.match(`/api/books/${id}/file`, { ignoreSearch: true });
    return {
      keys,
      matchedByBareUrl: !!bare,
      bytes: bare ? (await bare.blob()).size : 0,
    };
  }, { id: BOOK_ID, cacheName: OFFLINE_CACHE });
}

async function clearOfflineState(page: Page) {
  await page.evaluate(async () => {
    localStorage.removeItem("ptec_offline_books");
    localStorage.removeItem("ptec_offline_owner");
    for (const name of await caches.keys()) {
      if (name === "offline-books" || name === "book-covers") await caches.delete(name);
    }
  });
}

// The pdf.js page canvas specifically: the footer draws a canvas of its own,
// which used to satisfy this wait before the reader chunk had even loaded.
const readerCanvas = (page: Page) => page.locator(".react-pdf__Page canvas").first();

test.describe("offline reading", () => {
  test.describe("saving", () => {
    // A real page load, a download, a cache write and a read-back verification
    // do not fit the 30 s default.
    test.slow();

    test("stores a VERIFIED copy under ?offline=1, findable by the bare reader URL", async ({ page }) => {
      const stub = await stubBookFile(page);
      const signedIn = await installSeededReaderSession(page);
      test.skip(!signedIn, "seeded reader session unavailable — is the local Supabase stack up?");

      await page.goto(`/books/${BOOK_SLUG}`);
      await clearOfflineState(page);
      await page.reload();

      const save = page.getByRole("button", { name: /save this book for offline reading/i });
      await expect(save).toBeVisible();
      await save.click();

      // The button must not claim success before the read-back succeeded.
      await expect(page.getByRole("button", { name: /remove this book from offline storage/i }))
        .toContainText(/saved offline/i, { timeout: 30_000 });

      const cache = await inspectCache(page);
      expect(cache.keys).toContain(`/api/books/${BOOK_ID}/file?offline=1`);
      expect(cache.matchedByBareUrl).toBe(true);
      expect(cache.bytes).toBe(PDF.length);
      expect(stub.count).toBeGreaterThan(0);
    });

    test("a failing download leaves NO record and NO partial cache entry", async ({ page }) => {
      await page.route("**/api/books/*/file*", (route) =>
        route.fulfill({ status: 500, body: "boom" }),
      );
      const signedIn = await installSeededReaderSession(page);
      test.skip(!signedIn, "seeded reader session unavailable — is the local Supabase stack up?");

      await page.goto(`/books/${BOOK_SLUG}`);
      await clearOfflineState(page);
      await page.reload();

      await page.getByRole("button", { name: /save this book for offline reading/i }).click();
      // Scoped by text: Next's route announcer is also role="alert".
      await expect(page.getByText(/couldn.t save this book offline/i)).toBeVisible({ timeout: 30_000 });

      const state = await page.evaluate(async () => ({
        records: localStorage.getItem("ptec_offline_books"),
        keys: (await (await caches.open("offline-books")).keys()).length,
      }));
      expect(state.records === null || state.records === "[]").toBe(true);
      expect(state.keys).toBe(0);
    });

    test("reading a book ONLINE does not put it in offline storage", async ({ page }) => {
      // The privacy/storage boundary: only an explicit save owns cache space.
      // Meaningful whenever a worker is running — rule 1 in app/sw.ts is the
      // only thing standing between a reader fetch and a 15 MB cache write.
      await stubBookFile(page);
      const signedIn = await installSeededReaderSession(page);
      test.skip(!signedIn, "seeded reader session unavailable — is the local Supabase stack up?");

      await page.goto(`/books/${BOOK_SLUG}/read`);
      await clearOfflineState(page);
      await page.reload();
      await expect(readerCanvas(page)).toBeVisible({ timeout: 30_000 });

      const keys = await page.evaluate(async () =>
        (await (await caches.open("offline-books")).keys()).map((r) => r.url),
      );
      expect(keys).toEqual([]);
    });
  });

  test.describe("the offline library", () => {
    test("lists a saved book as available and links to the offline reader", async ({ page }) => {
      await page.goto("/offline-books");
      await seedSavedBook(page);
      await page.reload();

      await expect(page.getByRole("heading", { name: /downloaded books/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Foundations of Education" })).toBeVisible();
      await expect(page.getByText(/available offline/i).first()).toBeVisible({ timeout: 15_000 });

      const open = page.getByRole("link", { name: /read offline/i }).first();
      await expect(open).toHaveAttribute("href", new RegExp(`/offline-reader\\?id=${BOOK_ID}`));
    });

    test("detects a record whose bytes are gone and offers a re-download", async ({ page }) => {
      await page.goto("/offline-books");
      await seedSavedBook(page, { withBytes: false });
      await page.reload();

      await expect(page.getByText(/offline copy unavailable/i)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("link", { name: /download again/i })).toBeVisible();
      await expect(page.getByRole("link", { name: /read offline/i })).toHaveCount(0);
    });

    test("removing a book deletes the cached bytes, not just the record", async ({ page }) => {
      await page.goto("/offline-books");
      await seedSavedBook(page);
      await page.reload();
      await expect(page.getByText(/available offline/i).first()).toBeVisible({ timeout: 15_000 });

      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: /remove foundations of education/i }).click();

      await expect(page.getByText(/no books saved for offline/i)).toBeVisible();
      const cache = await inspectCache(page);
      expect(cache.keys).toEqual([]);
      expect(cache.matchedByBareUrl).toBe(false);
    });
  });

  test.describe("the offline reader", () => {
    test("renders the saved PDF from Cache Storage with the file endpoint dead", async ({ page }) => {
      await page.goto("/offline-books");
      await seedSavedBook(page);

      // Nothing may reach the network for this book. Aborting is stronger than
      // going offline: a request would fail loudly rather than be served.
      const attempts: string[] = [];
      await page.route("**/api/**", (route) => {
        attempts.push(route.request().url());
        return route.abort();
      });

      await page.goto(`/offline-reader?id=${BOOK_ID}`);
      await expect(page.getByText(/available offline/i).first()).toBeVisible({ timeout: 15_000 });
      // level 1: the reader chrome. The viewer renders its own <h2> title too.
      await expect(page.getByRole("heading", { level: 1, name: "Foundations of Education" })).toBeVisible();
      await expect(readerCanvas(page)).toBeVisible({ timeout: 30_000 });

      expect(attempts.filter((u) => u.includes("/file"))).toEqual([]);
    });

    test("page navigation works on the saved copy", async ({ page }) => {
      await page.goto("/offline-books");
      await seedSavedBook(page);
      await page.goto(`/offline-reader?id=${BOOK_ID}`);
      await expect(readerCanvas(page)).toBeVisible({ timeout: 30_000 });

      // The page count comes out of the PDF pdf.js parsed, not from metadata:
      // the seeded record claims nothing about length.
      // CSS rather than role: the reader HUD auto-hides (aria-hidden) after
      // 3 s of inactivity, and a role query would then find nothing.
      const indicator = page.locator('[data-reader-hud] button[aria-label^="Page "]:visible').first();
      await expect(indicator).toHaveAttribute("aria-label", "Page 1 of 3");
      await page.keyboard.press("ArrowRight");
      await expect(indicator).toHaveAttribute("aria-label", "Page 2 of 3", { timeout: 10_000 });
    });

    test("explains itself when the bytes are missing instead of failing blankly", async ({ page }) => {
      await page.goto("/offline-books");
      await seedSavedBook(page, { withBytes: false });
      await page.goto(`/offline-reader?id=${BOOK_ID}`);
      await expect(page.getByText(/no longer available/i)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /remove this entry/i })).toBeVisible();
    });

    test("an unknown id is a clear message, not a crash", async ({ page }) => {
      await page.goto("/offline-reader?id=not-a-real-book");
      await expect(page.getByText(/not on this device/i)).toBeVisible({ timeout: 15_000 });
    });

    test("fits a phone viewport without sideways scrolling", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("/offline-books");
      await seedSavedBook(page);
      await page.goto(`/offline-reader?id=${BOOK_ID}`);
      await expect(readerCanvas(page)).toBeVisible({ timeout: 30_000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });

  // ── The acceptance test. Needs a real service worker. ─────────────────────
  test.describe("with the network switched off", () => {
    test("reloads and reads a saved book with no connection", async ({ page, context }) => {
      test.slow(); // installing the worker precaches the whole build
      await page.goto("/offline-books");
      // Registration happens after hydration and `clientsClaim` lands a beat
      // later still, so "is there a controller yet" has to be waited for, not
      // sampled. A reload is the fallback: a page loaded after activation is
      // always controlled.
      const controlled = await page
        .evaluate(async () => {
          if (!("serviceWorker" in navigator)) return false;
          const deadline = Date.now() + 30_000;
          while (Date.now() < deadline) {
            if (navigator.serviceWorker.controller) return true;
            const regs = await navigator.serviceWorker.getRegistrations();
            if (regs.some((r) => r.active)) {
              await navigator.serviceWorker.ready;
              if (navigator.serviceWorker.controller) return true;
            }
            await new Promise((r) => setTimeout(r, 500));
          }
          return false;
        })
        .catch(() => false);
      test.skip(
        !controlled,
        "no service worker controls the page — dev disables it; run against `npm run build && npm run start`",
      );

      await seedSavedBook(page);
      await context.setOffline(true);
      try {
        await page.reload();
        await expect(page.getByRole("heading", { name: /downloaded books/i })).toBeVisible();
        await expect(page.getByText(/available offline/i).first()).toBeVisible({ timeout: 15_000 });

        await page.getByRole("link", { name: /read offline/i }).first().click();
        await expect(readerCanvas(page)).toBeVisible({ timeout: 30_000 });
      } finally {
        await context.setOffline(false);
      }
    });
  });
});
