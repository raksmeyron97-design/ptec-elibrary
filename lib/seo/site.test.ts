import { afterEach, describe, expect, it, vi } from "vitest";
import { absoluteUrl, normalizeSiteUrl, PRODUCTION_SITE_URL, SITE_URL } from "@/lib/seo/site";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("normalizeSiteUrl", () => {
  it("falls back to the production origin for unset/blank values", () => {
    expect(normalizeSiteUrl(undefined)).toBe(PRODUCTION_SITE_URL);
    expect(normalizeSiteUrl(null)).toBe(PRODUCTION_SITE_URL);
    expect(normalizeSiteUrl("   ")).toBe(PRODUCTION_SITE_URL);
  });

  it("normalizes to a bare origin: no trailing slash, no path, no query", () => {
    expect(normalizeSiteUrl("https://library.ptec.edu.kh/")).toBe("https://library.ptec.edu.kh");
    expect(normalizeSiteUrl("https://library.ptec.edu.kh/home?x=1#y")).toBe(
      "https://library.ptec.edu.kh",
    );
  });

  it("defaults a bare hostname to https", () => {
    expect(normalizeSiteUrl("library.ptec.edu.kh")).toBe("https://library.ptec.edu.kh");
  });

  it("rejects invalid protocols and unparseable values", () => {
    expect(normalizeSiteUrl("ftp://library.ptec.edu.kh")).toBe(PRODUCTION_SITE_URL);
    expect(normalizeSiteUrl("javascript://alert(1)")).toBe(PRODUCTION_SITE_URL);
    expect(normalizeSiteUrl("http://")).toBe(PRODUCTION_SITE_URL);
  });

  it("allows localhost in non-indexable environments (local dev)", () => {
    expect(normalizeSiteUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("rejects loopback hosts when the environment is indexable", () => {
    vi.stubEnv("SEO_INDEXING", "on");
    expect(normalizeSiteUrl("http://localhost:3000")).toBe(PRODUCTION_SITE_URL);
    expect(normalizeSiteUrl("http://127.0.0.1:3000")).toBe(PRODUCTION_SITE_URL);
    expect(normalizeSiteUrl("https://staging.local")).toBe(PRODUCTION_SITE_URL);
  });
});

describe("absoluteUrl", () => {
  it("returns the trailing-slash origin for the homepage", () => {
    expect(absoluteUrl("/")).toBe(`${SITE_URL}/`);
    expect(absoluteUrl()).toBe(`${SITE_URL}/`);
  });

  it("joins paths with exactly one slash and preserves queries", () => {
    expect(absoluteUrl("/books")).toBe(`${SITE_URL}/books`);
    expect(absoluteUrl("books")).toBe(`${SITE_URL}/books`);
    expect(absoluteUrl("/books?page=2")).toBe(`${SITE_URL}/books?page=2`);
  });
});
