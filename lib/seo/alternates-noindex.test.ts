// A noindex page publishes its canonical and no hreflang (docs/seo F5, Phase 1.4).
import { describe, expect, it } from "vitest";
import { dropHreflangWhenNoindex, localeAlternates, robotsSaysNoindex } from "./alternates";
import { buildListingMetadata } from "./listing-metadata";

describe("dropHreflangWhenNoindex", () => {
  const alternates = localeAlternates("/books", "en");

  it("keeps hreflang on an indexable page (negative control)", () => {
    expect(dropHreflangWhenNoindex({ alternates }).alternates?.languages).toBeTruthy();
    expect(dropHreflangWhenNoindex({ alternates, robots: { index: true } }).alternates?.languages).toBeTruthy();
  });

  it("drops hreflang and keeps the canonical when robots says noindex, in either form", () => {
    for (const robots of [{ index: false, follow: true }, "noindex, follow", "none"]) {
      const out = dropHreflangWhenNoindex({ alternates, robots });
      expect(out.alternates).toEqual({ canonical: alternates.canonical });
    }
  });

  it("reads robots the way a crawler would", () => {
    expect(robotsSaysNoindex(undefined)).toBe(false);
    expect(robotsSaysNoindex("index, follow")).toBe(false);
    expect(robotsSaysNoindex({ index: false })).toBe(true);
  });

  it("applies to every filtered listing, and not to a clean one", () => {
    const base = { path: "/books", locale: "km", title: "t", description: "d", page: 1 };
    expect(buildListingMetadata({ ...base, hasFilters: true }).alternates).toEqual({ canonical: "https://library.ptec.edu.kh/km/books" });
    expect(buildListingMetadata({ ...base, hasFilters: false }).alternates?.languages).toBeTruthy();
  });
});
