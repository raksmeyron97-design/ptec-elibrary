import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installSeededReaderSession } from "./utils/auth";

/**
 * The thesis record page in every access state (lib/theses/access.ts).
 *
 * The seed (supabase/seed.sql §7) makes each state reachable:
 *
 *   reading-fluency-grade-3        file + 'allow'   sign in · read · download
 *   teacher-motivation-retention   file, inherit    protected (Top 10, #4)
 *   digital-access-study-habits    file + 'block'   protected (library block)
 *   teaching-aids-mathematics…     no file          no PDF deposited
 *
 * and three readers: anonymous, student@ (profile incomplete — may read, not
 * download) and student2@ (complete profile — may do both).
 *
 * The property under test is the one the redesign exists for: the page never
 * draws an action the server refuses. So every state asks the file and
 * download routes directly, with the same cookies the page has, and compares
 * their answer with the controls on screen. The PDFs are keys that exist in no
 * local store, so a route that authorizes answers a redirect or a storage
 * error — anything but 401/403 — and that is exactly the distinction wanted.
 *
 * Both projects run it; the axe scan runs at each project's own viewport
 * (1280 desktop, ~390 phone), and the first-screen check is phone-only.
 */

const READABLE = { id: "44444444-4444-4444-8444-444444444401", path: "/theses/reading-fluency-grade-3" };
const TOP_TEN = { id: "44444444-4444-4444-8444-444444444402", path: "/theses/teacher-motivation-retention" };
const BLOCKED = { id: "44444444-4444-4444-8444-444444444404", path: "/theses/digital-access-study-habits" };
const NO_FILE = { id: "44444444-4444-4444-8444-444444444403", path: "/theses/teaching-aids-mathematics-classrooms" };

const REFUSED = [401, 403];

test.use({ contextOptions: { reducedMotion: "reduce" } });

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

async function open(page: Page, path: string) {
  const res = await page.goto(path);
  test.skip(res?.status() === 404, "The thesis seed is not loaded in this environment");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/**
 * Wait for the document height to hold still. The seeded announcement banner
 * mounts after hydration and drops the page by its height, so a position
 * measured before it lands is a position no reader sees (the same helper as
 * e2e/journal-article.spec.ts, for the same reason).
 */
async function settle(page: Page) {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __settleH?: number; __settleN?: number };
      const h = document.documentElement.scrollHeight;
      if (w.__settleH !== h) {
        w.__settleH = h;
        w.__settleN = 0;
        return false;
      }
      w.__settleN = (w.__settleN ?? 0) + 1;
      return w.__settleN >= 8 && performance.now() >= 2_000;
    },
    undefined,
    { timeout: 20_000, polling: 100 },
  );
}

async function signIn(page: Page, email: string) {
  const ok = await installSeededReaderSession(page, { email });
  test.skip(!ok, "Could not install a seeded session in this environment");
}

/** What the server would answer the page's own reader and download calls. */
async function routeStatus(page: Page, id: string, route: "file" | "download") {
  const res = await page.request.get(`/api/theses/${id}/${route}`, { maxRedirects: 0 });
  return res.status();
}

const panel = (page: Page) => page.locator("#thesis-access");
const panelStatus = (page: Page) => panel(page).getByRole("status");

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.describe("thesis record: every drawn action is one the server honours", () => {
  test("anonymous, readable: sign in to read — and the file route agrees it must", async ({ page }) => {
    await open(page, READABLE.path);
    await expect(panelStatus(page)).toContainText("Sign in to read the full text");
    const signIn = panel(page).getByRole("link", { name: "Sign in to read" });
    await expect(signIn).toHaveAttribute("href", `/auth/login?callbackUrl=${encodeURIComponent(READABLE.path)}`);
    await expect(page.getByRole("button", { name: "Read online" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(0);
    expect(await routeStatus(page, READABLE.id, "file")).toBe(401);
  });

  test("profile incomplete: read online, no download — each exactly as the routes answer", async ({ page }) => {
    await signIn(page, "student@ptec.local");
    await open(page, READABLE.path);
    await expect(panelStatus(page)).toContainText("You can read it here", { timeout: 20_000 });
    await expect(panel(page).getByRole("button", { name: "Read online" })).toBeVisible();
    await expect(panel(page).getByRole("link", { name: "Complete profile to download" })).toHaveAttribute(
      "href",
      /\/dashboard\/settings\?section=download-profile&returnTo=%2Ftheses%2Freading-fluency-grade-3/,
    );
    await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(0);
    expect(REFUSED).not.toContain(await routeStatus(page, READABLE.id, "file"));
    expect(await routeStatus(page, READABLE.id, "download")).toBe(403);
  });

  test("open: read online and download — both authorized", async ({ page }) => {
    await signIn(page, "student2@ptec.local");
    await open(page, READABLE.path);
    await expect(panelStatus(page)).toContainText("Full text available", { timeout: 20_000 });
    await expect(panel(page).getByRole("button", { name: "Read online" })).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "Download PDF" })).toBeVisible();
    expect(REFUSED).not.toContain(await routeStatus(page, READABLE.id, "file"));
    expect(REFUSED).not.toContain(await routeStatus(page, READABLE.id, "download"));
  });

  test("Top 10: says why, draws no read control, and the file route refuses even a signed-in reader", async ({ page }) => {
    await signIn(page, "student2@ptec.local");
    await open(page, TOP_TEN.path);
    await expect(panelStatus(page)).toContainText("Not available to read online");
    await expect(panelStatus(page)).toContainText("most-downloaded theses (#4)");
    await expect(panel(page).getByRole("link", { name: "Contact the library" })).toBeVisible();
    for (const name of ["Read online", "Open reader", "Download PDF"]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
    await expect(page.getByRole("link", { name: "Sign in to read" })).toHaveCount(0);
    // A protected record offers no full-text slot at all.
    await expect(page.locator("#full-text")).toHaveCount(0);
    expect(await routeStatus(page, TOP_TEN.id, "file")).toBe(403);
    expect(await routeStatus(page, TOP_TEN.id, "download")).toBe(403);
  });

  test("library block: says so without inventing a rank, and the file route refuses", async ({ page }) => {
    await signIn(page, "student2@ptec.local");
    await open(page, BLOCKED.path);
    await expect(panelStatus(page)).toContainText("The library has restricted online access");
    await expect(panelStatus(page)).not.toContainText("most-downloaded");
    await expect(page.getByRole("button", { name: "Read online" })).toHaveCount(0);
    expect(await routeStatus(page, BLOCKED.id, "file")).toBe(403);
  });

  test("no file: says so, offers to request a copy, lists no full-text section", async ({ page }) => {
    await open(page, NO_FILE.path);
    await expect(panelStatus(page)).toContainText("No PDF deposited yet");
    await expect(panel(page).getByRole("link", { name: "Request a copy" })).toHaveAttribute("href", /\/contact\?/);
    await expect(page.locator("#full-text")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: /Full text/ })).toHaveCount(0);
    expect(await routeStatus(page, NO_FILE.id, "file")).toBe(404);
  });
});

test.describe("thesis record: the page", () => {
  test("one fact, one place: identity on the title page, the rest in the facts grid", async ({ page }) => {
    await open(page, READABLE.path);
    const title = page.locator("header", { has: page.getByRole("heading", { level: 1 }) });
    await expect(title.locator('p[lang="km"]')).toHaveText("ភាពស្ទាត់ក្នុងការអាន នៅថ្នាក់ទី៣");
    await expect(title).toContainText("Dr. Meas Sokhom");
    const facts = page.getByRole("region", { name: "At a glance" });
    await expect(facts).toContainText("Published");
    // The advisor and the cohort are the title page's; the grid does not repeat them.
    await expect(facts).not.toContainText("Dr. Meas Sokhom");
    await expect(facts).not.toContainText("2023-2024");
  });

  test("the section chips list only sections this record has, with counts", async ({ page }) => {
    await open(page, READABLE.path);
    const nav = page.getByRole("navigation", { name: "On this page" });
    await expect(nav.getByRole("link")).toHaveText(["Abstract", "Contents5", "Full text", "References2"]);
    for (const id of ["abstract", "contents", "full-text", "references"]) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
  });

  test("the HTML carries no storage key — citations are built on the server", async ({ request }) => {
    const res = await request.get(READABLE.path);
    test.skip(res.status() === 404, "The thesis seed is not loaded in this environment");
    const html = await res.text();
    expect(html).not.toContain("research/seed/");
    expect(html).toContain('"@type":"ScholarlyArticle"');
    expect(html).toContain('name="citation_title"');
  });

  test("the staff Edit link follows the registry: a librarian sees it", async ({ page }) => {
    await signIn(page, "librarian@ptec.local");
    await open(page, READABLE.path);
    await expect(page.getByRole("link", { name: "Edit thesis" })).toHaveAttribute(
      "href",
      `/admin/theses/edit/${READABLE.id}`,
      { timeout: 20_000 },
    );
  });

  test("…and a reader does not", async ({ page }) => {
    await signIn(page, "student@ptec.local");
    await open(page, READABLE.path);
    // Wait for the viewer's answer, which is where the link would come from.
    await expect(panelStatus(page)).toContainText("You can read it here", { timeout: 20_000 });
    await expect(page.getByRole("link", { name: "Edit thesis" })).toHaveCount(0);
  });

  test("reads in Khmer on /km", async ({ page }) => {
    await open(page, `/km${TOP_TEN.path}`);
    await expect(panelStatus(page)).toContainText("មិនអាចអានតាមអនឡាញបានទេ");
    await expect(page.getByRole("heading", { level: 1 })).toHaveAttribute("lang", "en");
  });
});

test.describe("thesis record: phone", () => {
  test("the first screen holds the title and the access panel's primary button", async ({ page }) => {
    test.skip(!isPhone(page), "the first-screen budget is a phone property");
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, READABLE.path);
    await settle(page);
    const button = panel(page).getByRole("link", { name: "Sign in to read" });
    await expect(button).toBeVisible();
    const { bottom, limit, h1Bottom } = await button.evaluate((el) => {
      // The tab bar's own reserved height, not a copy of its number.
      const probe = document.createElement("div");
      probe.style.height = "var(--ptec-mobile-nav-clearance)";
      document.body.appendChild(probe);
      const clearance = probe.getBoundingClientRect().height;
      probe.remove();
      return {
        bottom: el.getBoundingClientRect().bottom,
        limit: window.innerHeight - clearance,
        h1Bottom: document.querySelector("h1")!.getBoundingClientRect().bottom,
      };
    });
    expect(h1Bottom).toBeLessThanOrEqual(limit);
    expect(bottom).toBeLessThanOrEqual(limit);
  });

  test("once the panel scrolls away, the dock repeats its verb — and only its verb", async ({ page }) => {
    test.skip(!isPhone(page), "the dock is a phone surface");
    await open(page, READABLE.path);
    await settle(page);
    // Well past the panel, well short of the footer (the dock steps aside for both).
    await page.locator("#contents").scrollIntoViewIfNeeded();
    const ask = page.getByRole("button", { name: "Ask about this thesis" });
    await expect(ask).toBeVisible();
    const dock = ask.locator("..");
    await expect(dock.getByRole("link", { name: "Sign in to read" })).toHaveAttribute(
      "href",
      `/auth/login?callbackUrl=${encodeURIComponent(READABLE.path)}`,
    );
    await expect(dock.getByRole("button", { name: "Read online" })).toHaveCount(0);
  });
});

test.describe("thesis record: accessibility at this project's viewport", () => {
  for (const [label, path] of [
    ["sign in", READABLE.path],
    ["protected", TOP_TEN.path],
    ["no file", NO_FILE.path],
    ["Khmer", `/km${READABLE.path}`],
  ] as const) {
    test(`${label}: no WCAG 2.1 A/AA violations`, async ({ page }) => {
      await open(page, path);
      await axe(page);
    });
  }

  test("signed in (profile incomplete): no WCAG 2.1 A/AA violations", async ({ page }) => {
    await signIn(page, "student@ptec.local");
    await open(page, READABLE.path);
    await expect(panelStatus(page)).toContainText("You can read it here", { timeout: 20_000 });
    await axe(page);
  });
});
