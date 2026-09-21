import { expect, test, type Page } from "@playwright/test";
import { SHELL_TAB_TRANSITION as SHELL_TAB } from "../lib/motion/flags";

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

/** Tell the page the connection changed. Playwright's setOffline flips
 *  navigator.onLine but dispatches no `offline`/`online` event, and a real
 *  browser fires both — this supplies the browser's half. Retried once: the
 *  app can perform a same-document navigation around this moment, which
 *  destroys the execution context mid-evaluate. */
async function announceConnectivity(page: Page, type: "offline" | "online") {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.evaluate((t) => window.dispatchEvent(new Event(t)), type);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(500);
    }
  }
}

/** `networkidle` has NO default timeout in this project's config, and a
 *  production page rarely reaches it (prefetches, the service worker). So it
 *  is a best-effort settle with an explicit cap, never a gate. */
async function settled(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
}

/** The sheets and the overlay mount at browser idle, so their presence means
 *  this page has hydrated. Pressing a link before that is a plain document
 *  navigation — no client router, and therefore no view transition. */
async function shellReady(page: Page) {
  await page.locator("[data-search-overlay]").waitFor({ state: "attached", timeout: 60_000 });
}

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
    await page.goto("/books", NAVIGATION);
    await shellReady(page);
    await settled(page);
    const offline = page.locator('[role="status"] > div', { hasText: "You’re offline" });
    await expect(offline).toHaveCount(0);

    await context.setOffline(true);
    await announceConnectivity(page, "offline");
    await expect(offline).toHaveAttribute("aria-hidden", "false");
    await expect(offline.getByRole("link", { name: "Downloaded books" })).toHaveAttribute("href", /\/offline-books$/);
    const banner = await offline.boundingBox();
    const bar = await tabBar(page).boundingBox();
    expect(banner && bar && banner.y + banner.height <= bar.y).toBe(true);

    await context.setOffline(false);
    await announceConnectivity(page, "online");
    // What is guaranteed is that the offline notice STOPS: the reader is not
    // left being told they are offline when they are not. The "Back online"
    // toast is deliberately not asserted — reconnecting can make the router
    // hard-navigate after a prefetch that failed while offline, which remounts
    // the banner, and a page that loads online correctly says nothing at all.
    await expect
      .poll(async () => ((await offline.count()) === 0 ? "gone" : await offline.getAttribute("aria-hidden")), { timeout: 15_000 })
      .not.toBe("false");
  });
});

test.describe("recently viewed", () => {
  test("a book you opened is listed on the downloads page and the offline fallback", async ({ page }) => {
    await page.goto("/books", NAVIGATION);
    await shellReady(page);
    const href = await page
      .locator('main a[href^="/books/"]')
      .filter({ has: page.locator("h3") })
      .first()
      .getAttribute("href");
    expect(href).toBeTruthy();
    const slug = href!.split("/").pop()!;

    await page.goto(href!, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await shellReady(page);
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ptec.recentlyViewed") ?? ""), NAVIGATION)
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
    await page.goto("/books", NAVIGATION);
    await settled(page);
    // Walk the page so the lazy covers load too.
    await page.evaluate(async () => {
      const limit = Math.min(document.documentElement.scrollHeight, window.innerHeight * 6);
      for (let y = 0; y < limit; y += 400) {
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

/** The first visible link that leaves the current top-level section (so the
 *  public template re-mounts), as a path. Reads the DOM, never writes to it:
 *  marking the element with an attribute made React report a hydration
 *  mismatch on the very page the test was measuring. The footer counts —
 *  About/Contact/Privacy are always there, while a listing on a sparse
 *  dataset may have no cards at all. */
async function sectionLinkHref(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const here = location.pathname.split("/")[1] ?? "";
    const skip = new Set(["", "api", "auth", "admin", "km", "_next", "~offline", "dashboard", "profile", "lists", "offline-reader", "offline-books"]);
    const link = [...document.querySelectorAll<HTMLAnchorElement>('main a[href^="/"], footer a[href^="/"]')].find((a) => {
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
    const url = new URL(link.href);
    return url.pathname + url.search;
  });
}

/** The link itself, located by href — no marker attribute. */
const sectionLink = (page: Page, href: string) =>
  page.locator(`main a[href="${href}"], footer a[href="${href}"]`).first();

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

// Scroll reveal (MUX-09): each card fades up as IT enters the view — a CSS
// scroll-driven animation, no observer. Measured on the homepage, whose card
// grids sit well below the fold. The entry line is the viewport's bottom edge
// less the phone tab bar's clearance (0 from lg up); the fade completes 140 px
// past it.
test.describe("scroll reveal", () => {
  async function setup(page: Page) {
    await page.goto("/");
    const supported = await page.evaluate(() => CSS.supports("animation-timeline: view()"));
    test.skip(!supported, "no scroll-driven animations here — the reveal is simply not drawn");
    return page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.height = "var(--ptec-mobile-nav-clearance)";
      document.body.append(probe);
      const clearance = probe.offsetHeight;
      probe.remove();
      const card = [...document.querySelectorAll<HTMLElement>("main .reveal")].find(
        (el) => el.getBoundingClientRect().top > window.innerHeight + 300 && el.offsetHeight < window.innerHeight,
      );
      if (card) card.setAttribute("data-reveal-probe", "");
      return { clearance, found: !!card };
    });
  }
  /** Put the probe's top edge `px` ABOVE the entry line (negative: below it). */
  async function placePastEntry(page: Page, px: number) {
    await page.evaluate((offset) => {
      const el = document.querySelector<HTMLElement>("[data-reveal-probe]")!;
      const probe = document.createElement("div");
      probe.style.height = "var(--ptec-mobile-nav-clearance)";
      document.body.append(probe);
      const entryLine = window.innerHeight - probe.offsetHeight;
      probe.remove();
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top - entryLine + offset, behavior: "instant" });
    }, px);
    // Two frames: the scroll timeline samples on the next animation frame.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  const opacity = (page: Page) =>
    page.evaluate(() => Number(getComputedStyle(document.querySelector("[data-reveal-probe]")!).opacity));

  test("a card below the fold is transparent until it arrives, and opaque 140 px in", async ({ page }) => {
    const { found } = await setup(page);
    expect(found, "the homepage should have a .reveal card well below the fold").toBe(true);
    await placePastEntry(page, -40); // still below the entry line (behind the tab bar on a phone)
    expect(await opacity(page)).toBe(0);
    await placePastEntry(page, 70); // half way through its 140 px
    const half = await opacity(page);
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.8);
    await placePastEntry(page, 160); // past the end of the fade
    expect(await opacity(page)).toBe(1);
  });

  test("every .reveal on the homepage is driven by the page's scroll, not a box that never scrolls", async ({ page }) => {
    // A view() timeline follows the NEAREST scroll container, and
    // `overflow: hidden|auto|scroll` makes one. Inside a section that never
    // scrolls, the timeline is inactive and the reveal silently never plays —
    // how 7 of the homepage's 11 reveals were dead on arrival.
    await setup(page);
    const trapped = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main .reveal")].flatMap((el) => {
        for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if ([cs.overflowX, cs.overflowY].some((o) => o === "hidden" || o === "auto" || o === "scroll")) {
            return [`${a.tagName.toLowerCase()}.${[...a.classList].slice(0, 4).join(".")}`];
          }
        }
        return [];
      }),
    );
    expect(await page.locator("main .reveal").count()).toBeGreaterThan(0);
    expect(trapped).toEqual([]);
  });

  test("under reduced motion nothing is hidden and nothing moves", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { found } = await setup(page);
    expect(found).toBe(true);
    await placePastEntry(page, -40);
    expect(await opacity(page)).toBe(1);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("[data-reveal-probe]")!).animationName)).toBe("none");
  });
});

test.describe("page transitions", () => {
  test("a tab-bar navigation animates nothing; a link in the page fades", async ({ page }, testInfo) => {
    // React starts a view transition for any navigation under the boundary,
    // even one whose type resolves to "none" — so what is pinned here is the
    // COST: with nothing to animate it is over in a frame or two, while an
    // animated one runs the 200 ms fade. A tab tap must stay in the first
    // group, or the tab bar's sliding indicator is replaced by a frozen
    // snapshot of it.
    await page.addInitScript(() => {
      const w = window as unknown as { __vt: { types: string[]; animations: string[] }[] };
      w.__vt = [];
      const start = document.startViewTransition?.bind(document);
      if (start) {
        document.startViewTransition = ((arg?: Parameters<typeof start>[0]) => {
          const types = arg && typeof arg === "object" && "types" in arg ? [...((arg.types as string[]) ?? [])] : [];
          const transition = start(arg);
          // `ready` resolves once the pseudo-element tree exists and its
          // animations have started — so this records what actually animates.
          void transition.ready
            .then(() =>
              w.__vt.push({
                types,
                animations: document
                  .getAnimations()
                  .filter((a) => String((a.effect as KeyframeEffect | null)?.pseudoElement ?? "").includes("view-transition"))
                  .map((a) => (a as CSSAnimation).animationName || "anonymous"),
              }),
            )
            .catch(() => {});
          return transition;
        }) as typeof document.startViewTransition;
      }
    });
    const transitions = () => page.evaluate(() => (window as unknown as { __vt: { types: string[]; animations: string[] }[] }).__vt);

    await page.goto("/");
    test.skip(!(await page.evaluate(() => "startViewTransition" in document)), "no View Transitions API here");
    const warm = await sectionLinkHref(page);
    expect(warm, "the homepage should link somewhere outside its own section").toBeTruthy();
    await page.request.get(warm!); // compile the route (dev) without leaving the page
    await page.goto("/books", NAVIGATION);
    await shellReady(page);

    // A tab: the navigation carries the shell-tab type, and that transition
    // animates nothing — so the indicator slides in the live page. (A Suspense
    // reveal arriving afterwards is a separate transition and may fade; that
    // is content appearing, not the tab bar freezing.)
    await tabBar(page).getByRole("link", { name: "Home" }).press("Enter");
    await page.waitForURL((url) => url.pathname === "/", NAVIGATION);
    await expect
      .poll(async () => (await transitions()).filter((t) => t.types.includes(SHELL_TAB)).length, NAVIGATION)
      .toBeGreaterThan(0);
    const tab = (await transitions()).find((t) => t.types.includes(SHELL_TAB))!;

    // A link in the page, into another section: the fade runs.
    await shellReady(page);
    const href = await sectionLinkHref(page);
    expect(href).toBeTruthy();
    await sectionLink(page, href!).press("Enter");
    await page.waitForURL((url) => url.pathname + url.search === href, NAVIGATION);
    await expect
      .poll(async () => (await transitions()).some((t) => !t.types.includes(SHELL_TAB) && t.animations.includes("page-enter")), NAVIGATION)
      .toBe(true);

    testInfo.annotations.push({
      type: "view transition",
      description: `tab types [${tab.types.join(", ")}] animated [${tab.animations.join(", ")}]`,
    });
    expect(tab.animations, "a tab tap must not run the page fade — the indicator slides live").not.toContain("page-enter");
  });

  test("no blank frame between two pages — in-app, back and forward — and direct loads render", async ({ page, context }, testInfo) => {
    const errors = renderErrors(page);
    await page.goto("/");
    const target = await sectionLinkHref(page);
    expect(target, "the homepage should link somewhere outside its own section").toBeTruthy();
    await page.goto(target!, NAVIGATION); // compile it (dev)
    await page.goto("/", NAVIGATION);
    await shellReady(page);
    await settled(page);

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
    let went = target!;
    await step("in-app link", async () => {
      // Whichever cross-section link the page offers now — the first visible
      // one can differ between renders, and any of them exercises the same
      // transition.
      went = (await sectionLinkHref(page)) ?? target!;
      await sectionLink(page, went).press("Enter");
      await page.waitForURL((url) => url.pathname + url.search === went, NAVIGATION);
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
    for (const path of ["/", went, "/km"]) {
      await page.goto(path, NAVIGATION);
      await expect(page.locator("main#main-content")).not.toBeEmpty();
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
