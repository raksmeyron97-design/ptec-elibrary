import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { isPageOutOfRange, buildListingMetadata, LISTING_FALLBACK_OG_IMAGE, parsePageParam } from "@/lib/seo/listing-metadata";

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

describe("isPageOutOfRange", () => {
  it("never calls page 1 out of range, whatever the collection holds", () => {
    expect(isPageOutOfRange(1, 0, 18)).toBe(false);
    expect(isPageOutOfRange(1, 1695, 18)).toBe(false);
  });

  it("marks a page past the last one", () => {
    // 6 physical books at 18/page = 1 page; page 50 is past the end.
    expect(isPageOutOfRange(50, 6, 18)).toBe(true);
    expect(isPageOutOfRange(2, 6, 18)).toBe(true);
  });

  it("leaves a real page alone", () => {
    // 1,695 books at 18/page = 95 pages.
    expect(isPageOutOfRange(95, 1695, 18)).toBe(false);
    expect(isPageOutOfRange(96, 1695, 18)).toBe(true);
  });

  it("treats an UNKNOWN count as in range — a failed read must not noindex", () => {
    // getCollectionStats() answers null when the read failed. Same rule as
    // the isEmpty gate: only a hard number withholds the index entry.
    expect(isPageOutOfRange(50, null, 18)).toBe(false);
    expect(isPageOutOfRange(50, undefined, 18)).toBe(false);
    expect(isPageOutOfRange(50, Number.NaN, 18)).toBe(false);
  });

  it("does not divide by a nonsense page size", () => {
    expect(isPageOutOfRange(50, 6, 0)).toBe(false);
    expect(isPageOutOfRange(50, 6, Number.NaN)).toBe(false);
  });

  it("keeps an empty collection's page 2 out of range", () => {
    // ceil(0/18) = 0 pages, floored to 1: page 2 of nothing is still past it.
    expect(isPageOutOfRange(2, 0, 18)).toBe(true);
  });
});

describe("every paginated listing declares where its collection ends", () => {
  // A SOURCE SCAN. buildListingMetadata self-canonicalises `?page=N` so the
  // whole collection can be indexed; the cost of that choice is that a page
  // past the end is ALSO indexable and self-canonical, at any N, for ever.
  // The helper has always accepted `outOfRange` — four of the six call sites
  // simply never passed it, and production served
  // `/catalogs?page=50` (0 results) and `/theses?page=50` (page 1's rows
  // under its own URL) as indexable pages. The guard is only real if every
  // call site supplies it, so that is what this asserts.
  const ROOT = join(__dirname, "..", "..");
  const PUBLIC_TREE = join(ROOT, "app", "[locale]", "(public)");

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  }

  const callSites = walk(PUBLIC_TREE)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({ file: f.slice(ROOT.length + 1), src: readFileSync(f, "utf8") }))
    .filter(({ src }) => src.includes("buildListingMetadata({"));

  it("finds the listing pages at all", () => {
    expect(callSites.length).toBeGreaterThanOrEqual(6);
  });

  it.each(callSites.map((c) => c.file))("%s bounds its ?page= space", (file) => {
    const { src } = callSites.find((c) => c.file === file)!;
    // `outOfRange` bounds a collection that has pages; `isEmpty` covers the
    // collection that has none. Either answers the question "does this URL
    // show anything?" — passing neither leaves it unanswered.
    const bounded = src.includes("outOfRange") || src.includes("isEmpty:");
    expect(`${file}: ${bounded}`).toBe(`${file}: true`);
  });
});
