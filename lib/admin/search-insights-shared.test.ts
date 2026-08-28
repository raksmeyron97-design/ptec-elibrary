import { describe, expect, it } from "vitest";
import {
  bucketDaysFor,
  computeKpis,
  DEFAULT_PAGE_SIZE,
  EMPTY_SUMMARY,
  languageOf,
  paginate,
  parseSearchInsightsFilters,
  percentChange,
  rangeBounds,
  resolveRangeWindow,
  serializeSearchInsightsFilters,
  DEFAULT_SEARCH_FILTERS,
} from "./search-insights-shared";

const NOW = new Date("2026-08-27T12:00:00.000Z");

describe("parseSearchInsightsFilters", () => {
  it("defaults everything when the URL is empty", () => {
    expect(parseSearchInsightsFilters({}, NOW)).toEqual(DEFAULT_SEARCH_FILTERS);
  });

  it("whitelists every enumerated field rather than trusting the URL", () => {
    const filters = parseSearchInsightsFilters(
      {
        range: "'; drop table search_queries; --",
        lang: "sql",
        status: "__proto__",
        sort: "count desc; delete",
        size: "9999",
        page: "-4",
        astatus: "anything",
      },
      NOW,
    );
    expect(filters.range).toBe("30d");
    expect(filters.lang).toBe("all");
    expect(filters.status).toBe("all");
    expect(filters.sort).toBe("count");
    expect(filters.size).toBe(DEFAULT_PAGE_SIZE);
    expect(filters.page).toBe(1);
    expect(filters.astatus).toBe("all");
  });

  it("accepts a valid custom range and rejects an inverted or future one", () => {
    expect(parseSearchInsightsFilters({ range: "custom", from: "2026-08-01", to: "2026-08-20" }, NOW))
      .toMatchObject({ range: "custom", from: "2026-08-01", to: "2026-08-20" });
    // start after end
    expect(parseSearchInsightsFilters({ range: "custom", from: "2026-08-20", to: "2026-08-01" }, NOW).range).toBe("30d");
    // starts in the future
    expect(parseSearchInsightsFilters({ range: "custom", from: "2027-01-01", to: "2027-02-01" }, NOW).range).toBe("30d");
    // malformed
    expect(parseSearchInsightsFilters({ range: "custom", from: "yesterday", to: "today" }, NOW).range).toBe("30d");
  });

  it("bounds a free-text query instead of passing an unbounded string down", () => {
    const filters = parseSearchInsightsFilters({ q: "x".repeat(500) }, NOW);
    expect(filters.q).toHaveLength(120);
  });

  it("round-trips through the URL, omitting defaults", () => {
    const filters = parseSearchInsightsFilters({ range: "90d", lang: "km", status: "needsReview", page: "3", size: "25" }, NOW);
    const qs = serializeSearchInsightsFilters(filters);
    expect(qs).toContain("range=90d");
    expect(qs).not.toContain("sort=");
    expect(parseSearchInsightsFilters(Object.fromEntries(new URLSearchParams(qs)), NOW)).toEqual(filters);
  });
});

describe("resolveRangeWindow", () => {
  it("gives every section one window, plus the preceding one of equal length", () => {
    const window = resolveRangeWindow({ ...DEFAULT_SEARCH_FILTERS, range: "7d" }, NOW);
    expect(window.days).toBe(7);
    expect(window.since).toBe("2026-08-20T12:00:00.000Z");
    expect(window.until).toBe("2026-08-27T12:00:00.000Z");
    expect(window.previousSince).toBe("2026-08-13T12:00:00.000Z");
    expect(window.previousUntil).toBe("2026-08-20T12:00:00.000Z");
  });

  it("derives the comparison window from a custom range's own length", () => {
    const window = resolveRangeWindow(
      { ...DEFAULT_SEARCH_FILTERS, range: "custom", from: "2026-08-01", to: "2026-08-10" },
      NOW,
    );
    expect(window.days).toBe(10);
    expect(window.previousSince.slice(0, 10)).toBe("2026-07-22");
  });

  it("never plots hundreds of daily ticks on a long range", () => {
    expect(bucketDaysFor(30)).toBe(1);
    expect(bucketDaysFor(90)).toBe(7);
    expect(bucketDaysFor(180)).toBe(30);
  });
});

describe("computeKpis", () => {
  it("uses the documented formulas", () => {
    const kpis = computeKpis(
      { ...EMPTY_SUMMARY, totalSearches: 1000, zeroResultSearches: 136, clicks: 421 },
      30,
    );
    expect(kpis.successRate).toBe(86.4);
    expect(kpis.zeroResultRate).toBe(13.6);
    expect(kpis.clickRate).toBe(42.1);
    expect(kpis.avgPerDay).toBe(33.3);
  });

  it("excludes pre-0064 rows with no result_count from the rate denominators", () => {
    // 100 searches, 40 of them logged before result_count existed. 12 of the
    // 60 measurable ones found nothing → 20%, not 12%.
    const kpis = computeKpis(
      { ...EMPTY_SUMMARY, totalSearches: 100, unknownResultSearches: 40, zeroResultSearches: 12 },
      10,
    );
    expect(kpis.zeroResultRate).toBe(20);
    expect(kpis.successRate).toBe(80);
    expect(kpis.unmeasured).toBe(40);
  });

  it("returns null rather than 0, NaN or Infinity when nothing is measurable", () => {
    const kpis = computeKpis(EMPTY_SUMMARY, 30);
    expect(kpis.successRate).toBeNull();
    expect(kpis.zeroResultRate).toBeNull();
    expect(kpis.clickRate).toBeNull();
    expect(kpis.avgPerDay).toBe(0);
  });

  it("handles a period where every single search failed", () => {
    const kpis = computeKpis({ ...EMPTY_SUMMARY, totalSearches: 25, zeroResultSearches: 25 }, 7);
    expect(kpis.zeroResultRate).toBe(100);
    expect(kpis.successRate).toBe(0);
  });
});

describe("percentChange", () => {
  it("compares against the previous window", () => {
    expect(percentChange(1248, 1093)).toBe(14.2);
    expect(percentChange(50, 100)).toBe(-50);
  });

  it("refuses to invent a delta when there is nothing to compare with", () => {
    expect(percentChange(1248, 0)).toBeNull();
    expect(percentChange(1248, null)).toBeNull();
    expect(percentChange(null, 100)).toBeNull();
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 137 }, (_, index) => index + 1);

  it("slices the first, a middle and the final page", () => {
    expect(paginate(items, 1, 10).items[0]).toBe(1);
    expect(paginate(items, 5, 10).items).toEqual([41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
    const last = paginate(items, 14, 10);
    expect(last.items).toEqual([131, 132, 133, 134, 135, 136, 137]);
    expect(last.totalPages).toBe(14);
  });

  it("clamps a page past the end instead of returning nothing", () => {
    expect(paginate(items, 99, 25).page).toBe(6);
    expect(paginate(items, 0, 25).page).toBe(1);
  });

  it("reports one empty page for an empty collection", () => {
    expect(paginate([], 3, 10)).toEqual({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
  });

  it("maps a page to PostgREST range bounds", () => {
    expect(rangeBounds(1, 25)).toEqual({ from: 0, to: 24 });
    expect(rangeBounds(3, 25)).toEqual({ from: 50, to: 74 });
  });
});

describe("languageOf", () => {
  it("trusts the logged language and falls back to script detection", () => {
    expect(languageOf("km", "anything")).toBe("km");
    expect(languageOf("en", "anything")).toBe("en");
    expect(languageOf("fr", "bonjour")).toBe("other");
    expect(languageOf(null, "ការស្រាវជ្រាវ")).toBe("km");
    expect(languageOf(undefined, "psychology")).toBe("en");
  });
});
