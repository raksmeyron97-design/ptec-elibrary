import { test, expect } from "@playwright/test";

// SEO foundation assertions. The dev server runs with SEO_INDEXING=on
// (playwright.config.ts) so these verify the production-shaped output;
// the environment-gate matrix itself is unit-tested in lib/seo/indexing.test.ts.
//
// Canonicals always use the production origin (lib/seo/site.ts falls back to
// it when NEXT_PUBLIC_SITE_URL is unset), so assertions pin that constant.
const PROD = "https://library.ptec.edu.kh";

test.describe("canonical homepage", () => {
  test("/home 308-redirects to /", async ({ request }) => {
    const res = await request.get("/home", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(new URL(res.headers()["location"], PROD).pathname).toBe("/");
  });

  test("/km/home 308-redirects to /km", async ({ request }) => {
    const res = await request.get("/km/home", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(new URL(res.headers()["location"], PROD).pathname).toBe("/km");
  });

  test("/en and /en/home collapse to / in a single hop", async ({ request }) => {
    for (const path of ["/en", "/en/home"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(301);
      expect(new URL(res.headers()["location"], PROD).pathname, path).toBe("/");
    }
  });

  test("/ renders the homepage with a self-canonical and hreflang pair", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    // Next serializes the root as the bare origin under trailingSlash:false.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", PROD);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      "href",
      PROD,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="km"]')).toHaveAttribute(
      "href",
      `${PROD}/km`,
    );
    expect(await page.locator("h1").count()).toBe(1);
  });

  test("/km renders the Khmer homepage with a /km canonical (no trailing slash)", async ({
    page,
  }) => {
    await page.goto("/km");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${PROD}/km`);
    await expect(page.locator("html")).toHaveAttribute("lang", "km");
  });
});

test.describe("indexing controls", () => {
  test("homepage is indexable in production-shaped output", async ({ page }) => {
    await page.goto("/");
    const robots = page.locator('meta[name="robots"]');
    if (await robots.count()) {
      await expect(robots).not.toHaveAttribute("content", /noindex/);
    }
  });

  test("admin login is noindex via meta and X-Robots-Tag", async ({ page }) => {
    const response = await page.goto("/admin/login");
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("auth login is noindex", async ({ page }) => {
    const response = await page.goto("/auth/login");
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("internal search results are noindex, follow", async ({ page }) => {
    await page.goto("/search?q=teaching");
    const content = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(content).toContain("noindex");
    expect(content).not.toContain("nofollow");
  });

  test("account surfaces send X-Robots-Tag noindex", async ({ request }) => {
    for (const path of ["/offline-books", "/dashboard", "/lists/some-id"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.headers()["x-robots-tag"], path).toContain("noindex");
    }
  });

  test("filtered listings are noindex,follow; deep pages keep self-canonicals", async ({
    page,
  }) => {
    await page.goto("/books?q=math");
    const filtered = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(filtered).toContain("noindex");

    await page.goto("/books?page=2");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${PROD}/books?page=2`,
    );
  });
});

test.describe("robots.txt and sitemap", () => {
  test("robots.txt allows crawling, disallows private paths, references the sitemap", async ({
    request,
  }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("Disallow: /admin/");
    expect(body).toContain("Disallow: /api/");
    expect(body).toContain("Disallow: /auth/");
    expect(body).toContain(`Sitemap: ${PROD}/sitemap.xml`);
  });

  test("sitemap.xml lists the root homepage and never /home or private paths", async ({
    request,
  }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain(`<loc>${PROD}</loc>`);
    expect(body).not.toContain(`<loc>${PROD}/home</loc>`);
    expect(body).not.toContain("/admin");
    expect(body).not.toContain("/dashboard");
    expect(body).not.toContain("/auth/");
  });
});

// ── SEO V2: topic + entity hubs ──────────────────────────────────────────────
//
// Before V2, /subjects/* and /authors/* were advertised in sitemap.xml with no
// internal link path from anywhere on the site, and their breadcrumbs pointed
// at /books and /publications while reading "Subjects" and "Authors"
// (docs/SEO-V2-AUDIT.md F-4, F-5). These pin the fix.

test.describe("subject and author hubs", () => {
  for (const path of ["/subjects", "/authors"]) {
    test(`${path} is a real page with one H1 and reciprocal hreflang`, async ({ page }) => {
      const en = `${PROD}${path}`;
      const km = `${PROD}/km${path}`;

      const res = await page.goto(path);
      expect(res?.status()).toBe(200);

      expect(await page.locator("h1").count()).toBe(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", en);
      await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", en);
      await expect(page.locator('link[rel="alternate"][hreflang="km"]')).toHaveAttribute("href", km);
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
        "href",
        en,
      );

      // Indexable: a hub is a destination, not a filter view.
      const robots = await page.locator('meta[name="robots"]').getAttribute("content");
      if (robots) expect(robots).not.toContain("noindex");
    });
  }

  test("the Khmer hubs resolve and declare lang=km", async ({ page }) => {
    for (const path of ["/km/subjects", "/km/authors"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", "km");
    }
  });

  test("both hubs are reachable from every page's footer", async ({ page }) => {
    await page.goto("/");
    for (const href of ["/subjects", "/authors"]) {
      await expect(
        page.locator(`footer a[href="${href}"]`).first(),
        `footer link to ${href}`,
      ).toHaveCount(1);
    }
  });

  test("a subject page's breadcrumb points at the subject hub, in nav and JSON-LD", async ({
    page,
    request,
  }) => {
    // Take a real subject from the sitemap rather than assuming a slug.
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const match = sitemap.match(new RegExp(`<loc>${PROD}(/subjects/[^<]+)</loc>`));
    test.skip(!match, "no subject URLs in the sitemap for this dataset");

    await page.goto(decodeURIComponent(match![1]));

    // Visible breadcrumb links to /subjects — it used to link to /books.
    await expect(page.locator('nav[aria-label="Breadcrumb"] a[href$="/subjects"]')).toHaveCount(1);

    // …and the emitted BreadcrumbList agrees with it.
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const crumbs = blocks
      .map((b) => JSON.parse(b))
      .find((d) => d["@type"] === "BreadcrumbList");
    expect(crumbs, "BreadcrumbList JSON-LD").toBeTruthy();
    const items: string[] = crumbs.itemListElement.map((i: { item?: string }) => i.item ?? "");
    expect(items).toContain(`${PROD}/subjects`);
    expect(items).not.toContain(`${PROD}/books`);
  });

  test("every subject in the sitemap renders resources, not an empty page", async ({
    request,
  }) => {
    // The soft-404 rule: getIndexableSubjects() filters empty subjects out of
    // the sitemap, so anything still listed must have content.
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const urls = [...sitemap.matchAll(new RegExp(`<loc>(${PROD}/subjects/[^<]+)</loc>`, "g"))].map(
      (m) => m[1],
    );
    test.skip(urls.length === 0, "no subject URLs in the sitemap for this dataset");

    for (const url of urls.slice(0, 8)) {
      const res = await request.get(new URL(url).pathname);
      expect(res.status(), url).toBe(200);
      const html = await res.text();
      expect(html, `${url} is indexable, so it must not be noindex`).not.toMatch(
        /<meta name="robots" content="[^"]*noindex/,
      );
    }
  });
});
