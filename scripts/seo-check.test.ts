// scripts/seo-check.test.ts — the pure rules inside scripts/seo-check.ts.
//
// The harness is only as good as the rules it applies, and two of them are
// someone else's semantics: robots.txt as Googlebot reads it, and the sitemap
// lastmod format. Each rule is pinned here with the case it must REFUSE beside
// the case it must accept, so a green run cannot come from a rule that
// accepts everything.

import { describe, expect, it } from "vitest";
import {
  ELLIPSIS,
  emptyValuePaths,
  graphemes,
  isPlaceholderLastmod,
  LASTMOD_RE,
  localeOf,
  parseRobots,
  robotsAllows,
  stripBrand,
  totalFromText,
} from "./seo-check";

describe("robots.txt, read as Googlebot reads it", () => {
  it("is a prefix match: `Disallow: /auth` blocks /authors (the 2026-09-09 defect)", () => {
    const r = parseRobots("User-agent: *\nAllow: /\nDisallow: /auth\n");
    expect(robotsAllows(r, "googlebot", "/authors/a-michael-huberman").allowed).toBe(false);
  });

  it("the `$`-anchored pair blocks the segment and spares its sibling", () => {
    const r = parseRobots("User-agent: *\nAllow: /\nDisallow: /auth$\nDisallow: /auth/\n");
    expect(robotsAllows(r, "googlebot", "/auth").allowed).toBe(false);
    expect(robotsAllows(r, "googlebot", "/auth/login").allowed).toBe(false);
    expect(robotsAllows(r, "googlebot", "/authors").allowed).toBe(true);
    expect(robotsAllows(r, "googlebot", "/auth-x").allowed).toBe(true);
  });

  it("the longest matching rule decides, and Allow wins a tie", () => {
    const r = parseRobots("User-agent: *\nDisallow: /api/\nAllow: /api/public/\nAllow: /p\nDisallow: /p\n");
    expect(robotsAllows(r, "googlebot", "/api/private").allowed).toBe(false);
    expect(robotsAllows(r, "googlebot", "/api/public/x").allowed).toBe(true);
    expect(robotsAllows(r, "googlebot", "/p").allowed).toBe(true);
  });

  it("`*` matches any run of characters, including a query", () => {
    const r = parseRobots("User-agent: *\nDisallow: /*?sort=\n");
    expect(robotsAllows(r, "googlebot", "/books?sort=downloads").allowed).toBe(false);
    expect(robotsAllows(r, "googlebot", "/books").allowed).toBe(true);
    expect(robotsAllows(r, "googlebot", "/books?page=2").allowed).toBe(true);
  });

  it("a group naming the crawler replaces `*` for it, and only for it", () => {
    const r = parseRobots("User-agent: *\nDisallow: /x\n\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nAllow: /\n");
    expect(robotsAllows(r, "gptbot", "/x").allowed).toBe(true);
    expect(robotsAllows(r, "claudebot", "/x").allowed).toBe(true);
    expect(robotsAllows(r, "googlebot", "/x").allowed).toBe(false);
  });

  it("reports a directive Google does not know (Cloudflare's Content-Signal) and collects sitemaps", () => {
    const r = parseRobots("User-agent: *\nContent-Signal: search=yes\nAllow: /\nSitemap: https://x.test/sitemap.xml\n");
    expect(r.unknown).toEqual(["Content-Signal: search=yes"]);
    expect(r.sitemaps).toEqual(["https://x.test/sitemap.xml"]);
  });
});

describe("result totals", () => {
  it("reads the English and the Khmer listing line", () => {
    expect(totalFromText(null, "Showing 1–18 of 1,956 results")).toBe(1956);
    expect(totalFromText(null, "បង្ហាញ ១–១៨ នៃ ១,៩៥៦ លទ្ធផល")).toBe(1956);
  });
  it("prefers data-results-total, and says nothing rather than guess", () => {
    expect(totalFromText("1956", "Showing 1–18 of 215 results")).toBe(1956);
    expect(totalFromText(null, "No results")).toBeNull();
  });
});

describe("sitemap lastmod", () => {
  it("accepts a timestamp with a timezone and refuses a bare date", () => {
    expect(LASTMOD_RE.test("2026-09-24T08:42:18.669919+00:00")).toBe(true);
    expect(LASTMOD_RE.test("2026-09-24T08:42Z")).toBe(true);
    expect(LASTMOD_RE.test("2026-09-24")).toBe(false);
    expect(LASTMOD_RE.test("2026-09-24T08:42:18")).toBe(false);
  });
  it("flags midnight on 1 January as a placeholder, and nothing else", () => {
    expect(isPlaceholderLastmod("2023-01-01T00:00:00+00:00")).toBe(true);
    expect(isPlaceholderLastmod("1970-01-01T00:00:00Z")).toBe(true);
    expect(isPlaceholderLastmod("2023-01-01T08:15:00+00:00")).toBe(false);
    expect(isPlaceholderLastmod("2026-09-24T08:42:18.669919+00:00")).toBe(false);
  });
});

describe("titles and descriptions", () => {
  it("finds an ellipsis left by truncation once the brand is stripped", () => {
    expect(ELLIPSIS.test(stripBrand("Development of a Handmade Conductivity Measurement Device… · PTEC Library"))).toBe(true);
    expect(ELLIPSIS.test("…research ethics, analysis and wr...")).toBe(true);
    expect(ELLIPSIS.test(stripBrand("Free Educational Books & Teaching Resources · PTEC Library"))).toBe(false);
  });
  it("strips only the last brand segment", () => {
    expect(stripBrand("A · B · PTEC Library")).toBe("A · B");
    expect(stripBrand("No brand here")).toBe("No brand here");
  });
  it("counts Khmer by grapheme, so a stacked consonant is one unit", () => {
    expect(graphemes("ក្រ")).toBeLessThan([..."ក្រ"].length);
    expect(graphemes("PTEC")).toBe(4);
  });
  it("derives the locale from the path", () => {
    expect(localeOf("/km")).toBe("km");
    expect(localeOf("/km/books?page=2")).toBe("km");
    expect(localeOf("/kmx")).toBe("en");
    expect(localeOf("/books")).toBe("en");
  });
});

describe("JSON-LD empty values", () => {
  it("reports null, blank and stringified-undefined values, and missing required fields", () => {
    const found = emptyValuePaths({ "@type": "Book", name: "", author: null, isbn: "undefined" });
    expect(found).toEqual(expect.arrayContaining(['$.name = ""', "$.author = null", '$.isbn = "undefined"']));
    expect(emptyValuePaths({ "@type": "Thesis", name: "x" })).toEqual(["$ (Thesis) missing author"]);
  });
  it("passes a complete node", () => {
    expect(emptyValuePaths({ "@graph": [{ "@type": "Book", name: "រលក", author: { "@type": "Person", name: "លឹង ថុល" } }] })).toEqual([]);
  });
});
