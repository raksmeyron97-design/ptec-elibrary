// The sitemap's bytes (docs/seo/AUDIT-VERIFICATION.md F6, Phase 1.5).
import { describe, expect, it } from "vitest";
import { encodeSitemapUrl, renderSitemapIndex, renderUrlset } from "./sitemap-xml";
import { fetchMergedSitemap, rebaseUrl, sitemapIndexChildren } from "../verify/sitemap";

const SITE = "https://library.ptec.edu.kh";
const KHMER = `${SITE}/books/រលក`;
// What Next publishes as the page's canonical for that URL (live, 2026-09-30).
const KHMER_CANONICAL = `${SITE}/books/%E1%9E%9A%E1%9E%9B%E1%9E%80`;

describe("encodeSitemapUrl", () => {
  it("percent-encodes a Khmer path byte-for-byte like the canonical", () => {
    expect(encodeSitemapUrl(KHMER)).toBe(KHMER_CANONICAL);
    expect(encodeSitemapUrl(KHMER_CANONICAL)).toBe(KHMER_CANONICAL); // idempotent
  });

  it("serializes the homepage as the bare origin, like its canonical", () => {
    expect(encodeSitemapUrl(SITE)).toBe(SITE);
    expect(encodeSitemapUrl(`${SITE}/`)).toBe(SITE);
    expect(encodeSitemapUrl(`${SITE}/km`)).toBe(`${SITE}/km`);
  });
});

describe("renderUrlset", () => {
  const xml = renderUrlset([
    {
      url: KHMER,
      lastModified: "2026-09-24T08:42:18.669919+00:00",
      alternates: { languages: { en: KHMER, km: `${SITE}/km/books/រលក`, "x-default": KHMER } },
    },
    { url: `${SITE}/books?page=2&x=1` },
  ]);

  it("writes encoded <loc>, the three alternates and the lastmod", () => {
    expect(xml).toContain(`<loc>${KHMER_CANONICAL}</loc>`);
    expect(xml).toContain(`hreflang="x-default" href="${KHMER_CANONICAL}"`);
    expect(xml).toContain(`hreflang="km" href="${SITE}/km/books/%E1%9E%9A%E1%9E%9B%E1%9E%80"`);
    expect(xml).toContain("<lastmod>2026-09-24T08:42:18.669919+00:00</lastmod>");
    expect(xml).not.toMatch(/<loc>[^<]*[^\x20-\x7e][^<]*<\/loc>/); // no raw Unicode anywhere in a <loc>
  });

  it("escapes XML metacharacters", () => {
    expect(xml).toContain("page=2&amp;x=1");
    expect(xml).not.toContain("page=2&x=1");
  });
});

describe("the index, and reading it back as one urlset", () => {
  const index = renderSitemapIndex([
    { url: `${SITE}/sitemaps/static.xml` },
    { url: `${SITE}/sitemaps/books.xml`, lastModified: "2026-09-24T08:42:18Z" },
  ]);

  it("names every child", () => {
    expect(sitemapIndexChildren(index)).toEqual([`${SITE}/sitemaps/static.xml`, `${SITE}/sitemaps/books.xml`]);
    expect(sitemapIndexChildren(renderUrlset([]))).toBeNull();
  });

  it("re-bases children onto the origin under test", () => {
    expect(rebaseUrl(`${SITE}/sitemaps/books.xml`, "http://localhost:3200")).toBe("http://localhost:3200/sitemaps/books.xml");
  });

  it("merges every child's <url> blocks in index order, and reads a plain urlset unchanged", async () => {
    const served: Record<string, string> = {
      "http://localhost:3200/sitemap.xml": index,
      "http://localhost:3200/sitemaps/static.xml": renderUrlset([{ url: SITE }]),
      "http://localhost:3200/sitemaps/books.xml": renderUrlset([{ url: KHMER }]),
    };
    const fetched: string[] = [];
    const merged = await fetchMergedSitemap("http://localhost:3200", async (u) => {
      fetched.push(u);
      if (!(u in served)) throw new Error(`unexpected ${u}`);
      return served[u];
    });
    expect(fetched).toEqual(Object.keys(served));
    expect([...merged.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])).toEqual([SITE, KHMER_CANONICAL]);

    const flat = renderUrlset([{ url: SITE }]);
    expect(await fetchMergedSitemap("http://x", async () => flat)).toBe(flat);
  });

  it("fails loudly when a child cannot be read, rather than reporting on half a sitemap", async () => {
    await expect(
      fetchMergedSitemap("http://x", async (u) => {
        if (u.endsWith("/sitemap.xml")) return index;
        throw new Error("503");
      }),
    ).rejects.toThrow("503");
  });
});
