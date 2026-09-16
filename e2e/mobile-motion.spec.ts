import { expect, test, type Page } from "@playwright/test";

// Motion and perceived performance on a phone (docs/MOBILE-GLASS-UI.md §4,
// rules 10–11). What this pins:
//   - the reading-progress line is a CSS scroll-driven animation — no script —
//     and is not drawn where unsupported or under reduced motion;
//   - the startup screen belongs to the first document of a session only, and
//     its failsafe is 2 s;
//   - the connectivity banner says so when the network drops, and when it
//     returns, clear of the tab bar;
//   - a book you opened is listed on both offline pages;
//   - no cover that has loaded is left transparent by the fade-in;
//   - page transitions: a tab-bar navigation starts no view transition, a
//     link in the page does, and no frame between two pages is blank — in-app,
//     back and forward.
//
// Against `next dev` the first request for a route compiles it, so every
// route a test navigates to in-app is visited once first.

const NAVIGATION = { timeout: 60_000 };

const tabBar = (page: Page) => page.getByRole("navigation", { name: "Main navigation" });

test.use({ viewport: { width: 360, height: 780 } });
// These tests walk several routes and decode a screencast; against `next dev`
// the first visit to each route also compiles it. The default 30 s per test
// is not enough to tell a slow machine from a broken page.
test.describe.configure({ timeout: 180_000 });

test.describe("reading progress", () => {
  test("is CSS only and follows the scroll position", async ({ page }) => {
    await page.goto("/books");
    const bar = page.locator(".reading-progress");
    await expect(bar).toHaveCount(1);
    const supported = await page.evaluate(() => CSS.supports("animation-timeline: scroll()"));
    test.skip(!supported, "no scroll timelines here — the line is not drawn, by design");

    const scaleAt = async (fraction: number) => {
      await page.evaluate((f) => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, max * f);
      }, fraction);
      await page.waitForTimeout(150);
      return bar.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    };
    expect(await scaleAt(0)).toBeLessThan(0.05);
    const middle = await scaleAt(0.5);
    // content-visibility sections settle their height as they scroll in, so
    // "half way" is approximate.
    expect(middle).toBeGreaterThan(0.25);
    expect(middle).toBeLessThan(0.75);
    await expect.poll(() => scaleAt(1)).toBeGreaterThan(0.95);
  });

  test("is not drawn for a reader who prefers reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/books");
    await expect(page.locator(".reading-progress")).toHaveCSS("display", "none");
    await expect(page.locator(".nav-progress")).toHaveCSS("display", "none");
  });
});

test.describe("startup screen", () => {
  test("covers the first document of a session only, with a 2 s failsafe", async ({ page }) => {
    await page.goto("/");
    const booted = () => page.evaluate(() => document.documentElement.hasAttribute("data-ptec-booted"));
    expect(await booted()).toBe(false);
    await expect(page.locator("#ptec-boot")).toHaveCSS("animation-delay", "2s");

    await page.reload();
    expect(await booted()).toBe(true);
    await expect(page.locator("#ptec-boot")).toHaveCSS("display", "none");
  });
});

test.describe("connectivity", () => {
  test("says so when the connection drops and when it returns, clear of the tab bar", async ({ page, context }) => {
    await page.goto("/books");
    await page.waitForLoadState("networkidle");
    const offline = page.locator('[role="status"] > div', { hasText: "You’re offline" });
    await expect(offline).toHaveCount(0);

    await context.setOffline(true);
    await expect(offline).toHaveAttribute("aria-hidden", "false");
    await expect(offline.getByRole("link", { name: "Downloaded books" })).toHaveAttribute("href", /\/offline-books$/);
    const banner = await offline.boundingBox();
    const bar = await tabBar(page).boundingBox();
    expect(banner && bar && banner.y + banner.height <= bar.y).toBe(true);

    await context.setOffline(false);
    const back = page.locator('[role="status"] > div', { hasText: "Back online." });
    await expect(back).toHaveAttribute("aria-hidden", "false");
    // …and it goes by itself.
    await expect(back).toHaveAttribute("aria-hidden", "true", { timeout: 10_000 });
  });
});

test.describe("recently viewed", () => {
  test("a book you opened is listed on the downloads page and the offline fallback", async ({ page }) => {
    await page.goto("/books");
    const href = await page
      .locator('main a[href^="/books/"]')
      .filter({ has: page.locator("h3") })
      .first()
      .getAttribute("href");
    expect(href).toBeTruthy();
    const slug = href!.split("/").pop()!;

    await page.goto(href!, NAVIGATION);
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ptec.recentlyViewed") ?? ""))
      .toContain(decodeURIComponent(slug));

    await page.goto("/offline-books", NAVIGATION);
    const onDownloads = page.getByRole("region", { name: "Recently viewed on this device" });
    await expect(onDownloads.locator(`a[href$="/books/${slug}"]`)).toBeVisible();

    await page.goto("/~offline", NAVIGATION);
    const onFallback = page.getByRole("region", { name: /Recently viewed/ });
    await expect(onFallback.locator(`a[href$="/books/${slug}"]`)).toBeVisible();
  });
});

test.describe("cover fade-in", () => {
  test("never leaves a loaded cover transparent", async ({ page }) => {
    await page.goto("/books");
    await page.waitForLoadState("networkidle");
    // Walk the page so the lazy covers load too.
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
    });
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              [...document.querySelectorAll('.cover-fade[data-fade="pending"]')].filter((box) => {
                const img = box.querySelector("img");
                return img && img.complete && img.naturalWidth > 0;
              }).length,
          ),
        { timeout: 10_000 },
      )
      .toBe(0);
  });
});

// ── Page transitions ─────────────────────────────────────────────────────────

/** Marks the first visible link in the page body that leaves the current
 *  top-level section (so the public template re-mounts), and returns its
 *  path. Auth-gated and non-page destinations are skipped. */
async function markSectionLink(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    document.querySelectorAll("[data-e2e-nav]").forEach((el) => el.removeAttribute("data-e2e-nav"));
    const here = location.pathname.split("/")[1] ?? "";
    const skip = new Set(["", "api", "auth", "admin", "km", "_next", "~offline", "dashboard", "profile", "lists", "offline-reader", "offline-books"]);
    const link = [...document.querySelectorAll<HTMLAnchorElement>('main a[href^="/"]')].find((a) => {
      const url = new URL(a.href);
      const segment = url.pathname.split("/")[1] ?? "";
      const box = a.getBoundingClientRect();
      return (
        url.origin === location.origin &&
        !url.hash &&
        !skip.has(segment) &&
        segment !== here &&
        !a.target &&
        !a.hasAttribute("download") &&
        box.width > 0 &&
        box.height > 0
      );
    });
    if (!link) return null;
    link.setAttribute("data-e2e-nav", "");
    const url = new URL(link.href);
    return url.pathname + url.search;
  });
}

/** Errors that would mean a transition broke rendering. */
function renderErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /hydrat|ViewTransition|startViewTransition/i.test(m.text())) errors.push(m.text());
  });
  return errors;
}

/** How much of each frame's page body (below the top bar, above the tab bar)
 *  is something other than its most common colour. A blank frame — the page
 *  background with nothing on it — scores ≈ 0. Decoded in a separate blank
 *  page so the analysis cannot disturb the one being measured. */
async function inkOf(analyzer: Page, frames: string[]): Promise<number[]> {
  return analyzer.evaluate(async (list) => {
    const out: number[] = [];
    for (const b64 of list) {
      const blob = await (await fetch(`data:image/jpeg;base64,${b64}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const g = canvas.getContext("2d")!;
      g.drawImage(bitmap, 0, 0);
      const y0 = Math.round(bitmap.height * 0.12);
      const y1 = Math.round(bitmap.height * 0.85);
      const { data } = g.getImageData(0, y0, bitmap.width, y1 - y0);
      const counts = new Map<number, number>();
      let total = 0;
      for (let i = 0; i < data.length; i += 16) {
        const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        total++;
      }
      out.push(1 - Math.max(...counts.values()) / total);
    }
    return out;
  }, frames);
}

test.describe("page transitions", () => {
  test("a tab-bar navigation animates nothing; a link in the page fades", async ({ page }, testInfo) => {
    // React starts a view transition for any navigation under the boundary,
    // even one whose type resolves to "none" — so what is pinned here is the
    // COST: with nothing to animate it is over in a frame or two, while an
    // animated one runs the 200 ms fade. A tab tap must stay in the first
    // group, or the tab bar's sliding indicator is replaced by a frozen
    // snapshot of it.
    await page.addInitScript(() => {
      const w = window as unknown as { __vt: number[] };
      w.__vt = [];
      const start = document.startViewTransition?.bind(document);
      if (start) {
        document.startViewTransition = ((arg?: Parameters<typeof start>[0]) => {
          const t0 = performance.now();
          const transition = start(arg);
          void transition.finished.then(() => w.__vt.push(Math.round(performance.now() - t0))).catch(() => {});
          return transition;
        }) as typeof document.startViewTransition;
      }
    });
    const durations = () => page.evaluate(() => (window as unknown as { __vt: number[] }).__vt);

    await page.goto("/");
    test.skip(!(await page.evaluate(() => "startViewTransition" in document)), "no View Transitions API here");
    const target = await markSectionLink(page);
    expect(target).toBeTruthy();
    await page.goto(target!, NAVIGATION); // compile it (dev)
    await page.goto("/books", NAVIGATION);

    // A tab: nothing animates, so the indicator slides in the live page.
    await tabBar(page).getByRole("link", { name: "Home" }).press("Enter");
    await page.waitForURL((url) => url.pathname === "/", NAVIGATION);
    await expect.poll(async () => (await durations()).length).toBeGreaterThan(0);
    const [tabMs] = await durations();

    // A link in the page, into another section: the fade runs.
    expect(await markSectionLink(page)).toBe(target);
    await page.locator("[data-e2e-nav]").press("Enter");
    await page.waitForURL((url) => url.pathname + url.search === target, NAVIGATION);
    await expect.poll(async () => (await durations()).length).toBeGreaterThan(1);
    const linkMs = (await durations())[1];

    testInfo.annotations.push({ type: "view transition", description: `tab ${tabMs} ms, page link ${linkMs} ms` });
    expect(linkMs, "an animated transition should run the 200 ms fade").toBeGreaterThan(150);
    expect(linkMs - tabMs, "a tab tap must be far cheaper than an animated navigation").toBeGreaterThan(80);
  });

  test("no blank frame between two pages — in-app, back and forward — and direct loads render", async ({ page, context }, testInfo) => {
    const errors = renderErrors(page);
    await page.goto("/");
    const target = await markSectionLink(page);
    expect(target).toBeTruthy();
    await page.goto(target!, NAVIGATION); // compile it (dev)
    await page.goto("/", NAVIGATION);
    await page.waitForLoadState("networkidle");

    const cdp = await context.newCDPSession(page);
    const frames: { t: number; data: string }[] = [];
    cdp.on("Page.screencastFrame", (f) => {
      frames.push({ t: Date.now(), data: f.data });
      void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 });

    const steps: { label: string; t0: number; t1: number }[] = [];
    const step = async (label: string, act: () => Promise<unknown>) => {
      await page.waitForTimeout(700);
      const t0 = Date.now();
      await act();
      await page.waitForTimeout(1500);
      steps.push({ label, t0, t1: Date.now() });
    };
    await step("in-app link", async () => {
      expect(await markSectionLink(page)).toBe(target);
      await page.locator("[data-e2e-nav]").press("Enter");
      await page.waitForURL((url) => url.pathname + url.search === target, NAVIGATION);
    });
    await step("back", () => page.goBack(NAVIGATION));
    await step("forward", () => page.goForward(NAVIGATION));
    await cdp.send("Page.stopScreencast");

    const analyzer = await context.newPage();
    const report: string[] = [];
    for (const { label, t0, t1 } of steps) {
      const before = frames.filter((f) => f.t < t0).at(-1);
      const during = frames.filter((f) => f.t >= t0 && f.t <= t1);
      if (!before || during.length === 0) {
        report.push(`${label}: no frames captured`);
        continue;
      }
      const [inkBefore, ...inks] = await inkOf(analyzer, [before.data, ...during.map((f) => f.data)]);
      const inkAfter = inks.at(-1)!;
      const min = Math.min(...inks);
      const worst = during[inks.indexOf(min)];
      await testInfo.attach(`${label} — least-inked frame`, { body: Buffer.from(worst.data, "base64"), contentType: "image/jpeg" });
      report.push(
        `${label}: ${during.length} frames, ink before ${inkBefore.toFixed(3)}, after ${inkAfter.toFixed(3)}, lowest ${min.toFixed(3)}`,
      );
      // A blank frame is the page background with (almost) nothing on it.
      expect(min, `${label}: a frame with almost nothing on it`).toBeGreaterThan(
        Math.min(0.02, Math.min(inkBefore, inkAfter) * 0.25),
      );
    }
    testInfo.annotations.push({ type: "frames", description: report.join(" | ") });
    await analyzer.close();

    // Direct loads: a document navigation, which no view transition touches.
    for (const path of ["/", target!, "/km"]) {
      await page.goto(path, NAVIGATION);
      await expect(page.locator("main#main-content")).not.toBeEmpty();
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
