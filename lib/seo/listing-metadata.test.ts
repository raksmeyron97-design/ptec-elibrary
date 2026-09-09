import { describe, it, expect } from "vitest";
import { buildListingMetadata, LISTING_FALLBACK_OG_IMAGE, parsePageParam } from "@/lib/seo/listing-metadata";

const base = {
  path: "/theses",
  locale: "en",
  title: "Student Theses",
  description: "Theses from PTEC.",
  page: 1,
  hasFilters: false,
};

describe("buildListingMetadata — social image", () => {
  it("gives every listing an og:image even when the page passes none", () => {
    // /theses, /theses/summary, /catalogs, /publications and /paths all
    // shipped with no og:image (verified live 2026-09-07) because they simply
    // did not pass one. A shared listing link rendered as a bare URL.
    const meta = buildListingMetadata(base);
    expect(meta.openGraph?.images).toEqual([
      { url: LISTING_FALLBACK_OG_IMAGE, alt: expect.any(String) },
    ]);
    expect(meta.twitter?.images).toEqual([LISTING_FALLBACK_OG_IMAGE]);
  });

  it("still prefers an image the page does supply", () => {
    const meta = buildListingMetadata({ ...base, image: "https://example.test/x.png", imageAlt: "X" });
    expect(meta.openGraph?.images).toEqual([{ url: "https://example.test/x.png", alt: "X" }]);
    expect(meta.twitter?.images).toEqual(["https://example.test/x.png"]);
  });
});

describe("buildListingMetadata — indexability (unchanged behaviour)", () => {
  it("self-canonicalises page 1 and leaves it indexable", () => {
    const meta = buildListingMetadata(base);
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.canonical).toContain("/theses");
    expect(meta.alternates?.canonical).not.toContain("?page=");
  });

  it("self-canonicalises deeper pages rather than collapsing onto page 1", () => {
    const meta = buildListingMetadata({ ...base, page: 3 });
    expect(String(meta.alternates?.canonical)).toContain("/theses?page=3");
  });

  it("noindexes filtered and out-of-range variants but keeps them crawlable", () => {
    expect(buildListingMetadata({ ...base, hasFilters: true }).robots).toEqual({ index: false, follow: true });
    expect(buildListingMetadata({ ...base, outOfRange: true }).robots).toEqual({ index: false, follow: true });
  });
});

describe("parsePageParam", () => {
  it("floors junk to page 1", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-4")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam("2.7")).toBe(2);
    expect(parsePageParam("5")).toBe(5);
  });
});

describe("buildListingMetadata — an empty collection is not an index entry", () => {
  // /publications was live, indexable and advertised in sitemap.xml while the
  // table held zero rows, rendering only "No publications are currently
  // available" (verified on production 2026-09-09). That is the same soft-404
  // the project already refuses to submit for empty subjects and empty entity
  // hubs; the rule simply had no way to reach a listing page.
  it("marks a listing with no rows at all noindex, follow", () => {
    const meta = buildListingMetadata({ ...base, isEmpty: true });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("still lets crawlers follow out of an empty listing", () => {
    const meta = buildListingMetadata({ ...base, isEmpty: true });
    expect(meta.robots).toMatchObject({ follow: true });
  });

  it("leaves a populated, unfiltered listing indexable (robots omitted)", () => {
    expect(buildListingMetadata({ ...base, isEmpty: false }).robots).toBeUndefined();
    expect(buildListingMetadata(base).robots).toBeUndefined();
  });

  it("is independent of hasFilters — a filter matching nothing is NOT an empty collection", () => {
    // hasFilters already covers "this filter matched nothing". isEmpty is the
    // different claim that the collection itself holds no rows; conflating them
    // would noindex /books the first time someone searched it for a typo.
    const filtered = buildListingMetadata({ ...base, hasFilters: true, isEmpty: false });
    expect(filtered.robots).toEqual({ index: false, follow: true });
    const emptyUnfiltered = buildListingMetadata({ ...base, hasFilters: false, isEmpty: true });
    expect(emptyUnfiltered.robots).toEqual({ index: false, follow: true });
  });

  it("keeps canonical and hreflang on an empty listing — noindex, not unreachable", () => {
    const meta = buildListingMetadata({ ...base, isEmpty: true });
    expect(meta.alternates?.canonical).toBe("https://library.ptec.edu.kh/theses");
    expect(meta.alternates?.languages).toMatchObject({
      en: "https://library.ptec.edu.kh/theses",
      km: "https://library.ptec.edu.kh/km/theses",
    });
  });
});
