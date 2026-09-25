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
  }) => {
    // Take a real subject from the HUB, not from the sitemap. Breadcrumbs are
    // not an indexability question, and since the SEO 3.3 depth gate the
    // sitemap carries only subjects with ≥ 5 resources — on a small seed that
    // is none of them, and sourcing the URL there turned this into a test that
    // silently skipped (lib/subjects/indexability.ts).
    await page.goto("/subjects");
    const first = page.locator('main a[href*="/subjects/"]').first();
    test.skip((await first.count()) === 0, "no subjects with resources in this dataset");
    const href = await first.getAttribute("href");

    await page.goto(decodeURIComponent(href!));

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

  // SEO 3.3 §5: a subject hub is indexed on DEPTH. The sitemap and the page's
  // robots meta are decided by one function (subjectVisibility), so a hub the
  // sitemap omits must say `noindex` — and must still be crawlable and linked.
  test("a subject hub below the depth bar is noindex, follow and out of the sitemap", async ({
    page,
    request,
  }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();

    await page.goto("/subjects");
    const hrefs = await page.locator('main a[href*="/subjects/"]').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""),
    );
    const thin = hrefs.find((h) => h && !sitemap.includes(encodeURI(`${PROD}${h}`)));
    test.skip(!thin, "every linked subject clears the depth bar in this dataset");

    await page.goto(decodeURIComponent(thin!));
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots, "a hub the sitemap omits must not be offered for indexing").toContain("noindex");
    // `follow`, never `nofollow`: the hub's resources are real and must keep
    // receiving the crawl. What is withdrawn is the claim about the PAGE.
    expect(robots).not.toContain("nofollow");
  });

  test("every subject in the sitemap renders resources, not an empty page", async ({
    request,
  }) => {
    // The soft-404 rule: getIndexableSubjects() filters empty subjects out of
    // the sitemap, so anything still listed must have content.
    const sitemap = await (await request.get("/sitemap.xml")).text();
    // Pull every <loc> out with a pattern that knows nothing about hosts, then
    // keep the subject URLs by exact origin. A host written into the pattern
    // instead would have to be escaped by hand to mean one host (an unescaped
    // `.` matches any character), and an unanchored one matches wherever it
    // appears — `startsWith` on the parsed text asks the question directly.
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => m[1])
      .filter((loc) => loc.startsWith(`${PROD}/subjects/`));
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

// ── Open Graph contract ──────────────────────────────────────────────────────
//
// The tags are rendered SERVER-SIDE into <head>, and every defect this section
// was written after was an ABSENCE — Next replaces `openGraph` rather than
// deep-merging it, so a page that hand-wrote the object silently dropped
// whatever it did not repeat and nothing errored anywhere. The unit tests in
// lib/seo/open-graph.test.ts pin the builder; these assert that a page's real
// rendered <head> carries what the builder returns.

const OG_LOCALE = { en: "en_US", km: "km_KH" } as const;

async function og(page: import("@playwright/test").Page, property: string): Promise<string[]> {
  return page.locator(`meta[property="${property}"]`).evaluateAll((els) =>
    els.map((el) => el.getAttribute("content") ?? ""),
  );
}

async function expectOgContract(
  page: import("@playwright/test").Page,
  path: string,
  locale: "en" | "km",
) {
  await page.goto(path);

  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(canonical, `${path} has a canonical`).toBeTruthy();

  for (const property of [
    "og:title",
    "og:type",
    "og:url",
    "og:image",
    "og:image:alt",
    "og:site_name",
    "og:locale",
    "og:locale:alternate",
  ]) {
    const values = await og(page, property);
    expect(values.filter(Boolean), `${path} emits ${property}`).not.toHaveLength(0);
  }

  // og:url IS the canonical. Two URLs for one page split its social identity
  // from its search identity.
  expect((await og(page, "og:url"))[0], `${path} og:url === canonical`).toBe(canonical);

  // Reciprocal, and drawn from the two locales this site publishes.
  expect((await og(page, "og:locale"))[0]).toBe(OG_LOCALE[locale]);
  expect(await og(page, "og:locale:alternate")).toContain(
    locale === "km" ? OG_LOCALE.en : OG_LOCALE.km,
  );

  // Absolute, https, and on no preview or loopback host — a crawler resolves
  // nothing and follows no session.
  const image = (await og(page, "og:image"))[0];
  const url = new URL(image);
  expect(url.protocol, `${path} og:image scheme`).toBe("https:");
  expect(/^(localhost|127\.|\[?::1)/.test(url.hostname), `${path} og:image is not loopback`).toBe(false);
  expect(/\.vercel\.app$/.test(url.hostname), `${path} og:image is not a preview host`).toBe(false);
  // Never the tunnel's FALLBACK hostname: middleware 308s it to the canonical
  // host, and a crawler fetching an image is not obliged to follow a redirect.
  expect(url.hostname, `${path} og:image is not the tunnel fallback host`).not.toBe(
    "library.storage-ptec.online",
  );
}

test.describe("Open Graph contract", () => {
  // One page per builder family, in both locales where the locale half of the
  // contract is what is being checked.
  test("/ carries the full contract in English", async ({ page }) => {
    await expectOgContract(page, "/", "en");
  });

  test("/km carries the full contract in Khmer", async ({ page }) => {
    await expectOgContract(page, "/km", "km");
  });

  test("a listing page carries it", async ({ page }) => {
    await expectOgContract(page, "/books", "en");
  });

  test("the authors hub and an author profile carry it", async ({ page }) => {
    await expectOgContract(page, "/authors", "en");
    // An author with no portrait was the worst case: production served NO
    // og:image at all, because an omitted key on a page-level `openGraph` does
    // not fall through to the root layout's.
    const href = await page
      .locator('a[href*="/authors/"]')
      .first()
      .getAttribute("href");
    test.skip(!href, "no author is listed in this environment");
    await expectOgContract(page, href!, "en");
  });

  // One test per path, not one loop: eight dev-mode page loads share a single
  // 30 s budget and the failure then reads as a contract breach rather than as
  // a slow compile.
  for (const path of [
    "/about",
    "/about/team",
    "/about/rules",
    "/about/timings",
    "/about/collection",
    "/about/our-journey",
    "/about/committee",
    "/contact",
  ]) {
    test(`${path} carries it`, async ({ page }) => {
      await expectOgContract(page, path, "en");
    });
  }

  test("the shared card declares the size it really is", async ({ page, request }) => {
    await page.goto("/about/rules");
    const image = (await og(page, "og:image"))[0];
    expect(image).toContain("/og-default-v2.png");
    expect((await og(page, "og:image:width"))[0]).toBe("1200");
    expect((await og(page, "og:image:height"))[0]).toBe("630");
    // And a crawler with no session gets image bytes from it.
    const res = await request.get("/og-default-v2.png");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/");
  });

  test("a page serving the landscape card does not ask for a square crop", async ({ page }) => {
    // The homepage declared `twitter: { title, description }` with no `card`,
    // which replaced the root layout's `summary_large_image` wholesale — so the
    // site's most-shared URL published its 1200 x 630 card as `summary`.
    for (const path of ["/", "/km", "/subjects", "/policy", "/privacy"]) {
      await page.goto(path);
      const image = (await og(page, "og:image"))[0];
      if (!image.includes("/og-default.")) continue;
      await expect(
        page.locator('meta[name="twitter:card"]'),
        `${path} serves the landscape card`,
      ).toHaveAttribute("content", "summary_large_image");
    }
  });
});
