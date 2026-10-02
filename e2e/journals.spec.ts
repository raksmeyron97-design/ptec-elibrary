import { expect, test } from "@playwright/test";
import { PTEC_PUBLICATIONS_URL } from "../lib/journals/urls";
import { mergedSitemap } from "./utils/sitemap";
import { jsonLdNodes } from "./utils/jsonld";

/**
 * Publications → Journals (migration 0148, docs/JOURNALS-ARCHITECTURE.md).
 *
 * Runs against the seeded stack (supabase/seed.sql §11): three published
 * journals, one unpublished one, CJTE Vol. 7 No. 2 with an article and
 * CJTE Vol. 7 No. 3 published but EMPTY, and a draft article.
 */
const CJTE = "cambodian-journal-of-teacher-education";
const ARTICLE = "first-posting-graduates-longitudinal";

test.describe("legacy /publications URLs: one 301 hop, locale kept", () => {
  for (const [from, to] of [
    ["/publications", "/journals"],
    ["/en/publications", "/journals"],
    ["/km/publications", "/km/journals"],
    [`/publications/${ARTICLE}`, `/journals/articles/${ARTICLE}`],
    [`/en/publications/${ARTICLE}`, `/journals/articles/${ARTICLE}`],
    [`/km/publications/${ARTICLE}`, `/km/journals/articles/${ARTICLE}`],
    ["/publications?journal=Journal%20of%20Chemical%20Education", "/journals?journal=Journal%20of%20Chemical%20Education"],
  ] as const) {
    test(`${from} → ${to}`, async ({ request }) => {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status()).toBe(301);
      const location = new URL(res.headers()["location"], "http://x");
      expect(`${location.pathname}${location.search}`).toBe(to);
      // …and the destination answers 200 itself: no chain, no dead end.
      const final = await request.get(to, { maxRedirects: 0 });
      expect(final.status()).toBe(200);
    });
  }
});

test.describe("journal routes answer real statuses", () => {
  for (const [path, status] of [
    ["/journals", 200],
    ["/km/journals", 200],
    [`/journals/${CJTE}`, 200],
    [`/journals/${CJTE}/issues`, 200],
    [`/journals/${CJTE}/issues/vol-7-issue-2`, 200],
    [`/km/journals/${CJTE}/issues/vol-7-issue-2`, 200],
    [`/journals/articles/${ARTICLE}`, 200],
    // A published issue with no article is not a page (no orphan issue).
    [`/journals/${CJTE}/issues/vol-7-issue-3`, 404],
    ["/journals/ptec-working-papers", 404], // unpublished journal
    ["/journals/articles/multigrade-teaching-working-paper", 404], // draft article
    ["/journals/no-such-journal", 404],
    ["/journals/no-such-journal/issues", 404],
    ["/journals/articles/no-such-article", 404],
  ] as const) {
    test(`${path} → ${status}`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(status);
    });
  }
});

test.describe("the article sits inside the journal graph", () => {
  test("canonical, Scholar tags and the Issue → Volume → Periodical chain", async ({ page }) => {
    await page.goto(`/journals/articles/${ARTICLE}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/journals/articles/${ARTICLE}$`));
    await expect(page.locator('meta[name="citation_journal_title"]')).toHaveAttribute("content", "Cambodian Journal of Teacher Education");
    await expect(page.locator('meta[name="citation_volume"]')).toHaveAttribute("content", "7");
    await expect(page.locator('meta[name="citation_issue"]')).toHaveAttribute("content", "2");
    const article = (await jsonLdNodes(page)).find((b) => b["@type"] === "ScholarlyArticle");
    expect(article.isPartOf["@type"]).toBe("PublicationIssue");
    expect(article.isPartOf.isPartOf["@type"]).toBe("PublicationVolume");
    expect(article.isPartOf.isPartOf.isPartOf["@type"]).toBe("Periodical");
    // The breadcrumb names the journal and the issue as real pages.
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.getByRole("link", { name: "Journals" })).toHaveAttribute("href", "/journals");
  });

  test("the journal page is a Periodical and links its issues", async ({ page }) => {
    await page.goto(`/journals/${CJTE}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cambodian Journal of Teacher Education");
    expect((await jsonLdNodes(page)).some((b) => b["@type"] === "Periodical")).toBe(true);
    await expect(page.locator(`a[href="/journals/${CJTE}/issues/vol-7-issue-2"]`).first()).toBeVisible();
    // The invalid fixture ISSN (2789-0001) is never displayed.
    await expect(page.getByText("2789-0001")).toHaveCount(0);
  });
});

test.describe("navigation: Journals inside, Publications ↗ outside", () => {
  test("desktop menu and footer", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: /Digital Library/i }).click();
    const menu = page.getByRole("navigation", { name: "Digital Library" });
    await expect(menu.getByRole("link", { name: /^Journals/ })).toHaveAttribute("href", "/journals");
    const external = menu.locator(`a[href="${PTEC_PUBLICATIONS_URL}"]`);
    await expect(external).toHaveAttribute("target", "_blank");
    await expect(external).toHaveAttribute("rel", /noopener/);
    // Nothing on the page links the retired internal collection.
    expect(await page.locator('a[href^="/publications"], a[href^="/km/publications"]').count()).toBe(0);

    const footer = page.locator("footer");
    await expect(footer.locator('a[href="/journals"]')).toBeVisible();
    await expect(footer.locator(`a[href="${PTEC_PUBLICATIONS_URL}"]`)).toHaveAttribute("target", "_blank");
  });
});

test.describe("sitemap", () => {
  test("advertises journal, issue and article URLs and no /publications URL", async ({ request }) => {
    const xml = await mergedSitemap(request);
    expect(xml).toContain(`/journals/${CJTE}</loc>`);
    expect(xml).toContain(`/journals/${CJTE}/issues/vol-7-issue-2</loc>`);
    expect(xml).toContain(`/journals/articles/${ARTICLE}</loc>`);
    expect(xml).not.toContain(`/journals/${CJTE}/issues/vol-7-issue-3<`);
    expect(xml).not.toContain("ptec-working-papers");
    expect(xml).not.toMatch(/\/publications[/<]/);
  });
});

/**
 * Journals redesign (0166, decision 2026-10-02: the library INDEXES journals).
 * Seed: CJTE has an OFFICIAL Khmer title, open access and a PTEC-staff author
 * (Sok Dara); JCE's Khmer title is a LIBRARY TRANSLATION.
 */
const JCE = "journal-of-chemical-education";

test.describe("journal page: identity, contents and trust", () => {
  test("a library translation is labelled and is never the journal's name", async ({ page }) => {
    await page.goto(`/km/journals/${JCE}`);
    // The H1 on the Khmer page stays the publisher's own title.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Journal of Chemical Education");
    await expect(page.getByText("ការបកប្រែរបស់បណ្ណាល័យ").first()).toBeVisible();
    const periodical = (await jsonLdNodes(page)).find((b) => b["@type"] === "Periodical");
    expect(periodical.alternateName).toBeUndefined();
    expect(periodical.isAccessibleForFree).toBeUndefined(); // hybrid claims nothing
  });

  test("an official Khmer title IS the name on /km, and an open journal claims free access", async ({ page }) => {
    await page.goto(`/km/journals/${CJTE}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ទស្សនាវដ្ដីគរុកោសល្យកម្ពុជា");
    const periodical = (await jsonLdNodes(page)).find((b) => b["@type"] === "Periodical");
    expect(periodical.alternateName).toBe("ទស្សនាវដ្ដីគរុកោសល្យកម្ពុជា");
    expect(periodical.isAccessibleForFree).toBe(true);
  });

  test("the current issue's table of contents leads, and nothing is listed twice", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/journals/${CJTE}`);
    const current = page.locator("#journal-current");
    await expect(current.getByRole("heading", { level: 2 })).toHaveText("Current issue");
    const tocLinks = await current.locator('a[href^="/journals/articles/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    const moreLinks = await page.locator('#journal-more a[href^="/journals/articles/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(tocLinks.length).toBeGreaterThan(0);
    expect(moreLinks.filter((h) => tocLinks.includes(h))).toEqual([]);
    // DOIs are full https://doi.org links (Crossref display guidelines).
    const doi = current.locator('a[href^="https://doi.org/"]').first();
    await expect(doi).toHaveText(/^https:\/\/doi\.org\//);
  });

  test("the rail starts level with the masthead, and states quality and access", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/journals/${CJTE}`);
    const masthead = await page.locator("#journal-masthead").boundingBox();
    const rail = await page.locator("aside").filter({ has: page.locator("#journal-glance") }).boundingBox();
    expect(Math.abs((rail?.y ?? 0) - (masthead?.y ?? 0))).toBeLessThan(2);
    const trust = page.locator('section[aria-labelledby="journal-trust"]');
    await expect(trust).toContainText("Open access");
    await expect(trust).toContainText("Double-blind peer review");
    await expect(trust).toContainText("CC BY 4.0");
  });

  test("PTEC authors in this journal comes from the staff flag", async ({ page }) => {
    await page.goto(`/journals/${CJTE}`);
    const block = page.locator("#journal-ptec-authors");
    await expect(block).toContainText("Sok Dara");
    // Chan Sophea co-authors here but is not flagged as PTEC staff.
    await expect(block).not.toContainText("Chan Sophea");
  });

  test("labelled ISSN chips: print and online are different numbers", async ({ page }) => {
    await page.goto(`/journals/${JCE}`);
    const masthead = page.locator("#journal-masthead");
    await expect(masthead).toContainText("Print ISSN 0021-9584");
    await expect(masthead).toContainText("Online ISSN 1938-1328");
  });
});
