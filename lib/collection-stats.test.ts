// lib/collection-stats.test.ts
//
// Pins the public counting rule, the failure behaviour and the formatters.
// If the rule ever changes, change it HERE, in lib/collection-stats.ts and in
// supabase/migrations/0103_public_resource_statistics.sql together — every
// public counter reads from that one service, which reads that one view.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  // Pass-through: tests exercise the compute function, not Next's cache.
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

// The single row the fake `public_resource_statistics` view returns. Set to
// an Error to simulate the view being unreadable.
let viewRow: Record<string, unknown> | Error = {};
/** When set, the fake view read fails with this PostgREST error code, which
 *  is how "migration not applied yet" reaches the service. */
let viewErrorCode: string | null = null;
/** Per-table counts served to the degraded base-table path. */
const tableCounts: Record<string, number> = {};

vi.mock("./supabase/public", () => ({
  createPublicClient: () => ({
    from: (table: string) => ({
      select: () => ({
        // Canonical path: one row from the view.
        single: async () => {
          if (viewErrorCode) {
            return { data: null, error: { message: "missing", code: viewErrorCode } };
          }
          if (viewRow instanceof Error) {
            return { data: null, error: { message: viewRow.message, code: "XX000" } };
          }
          return { data: viewRow, error: null };
        },
        // Degraded path: head-count per base table.
        eq: async () => ({ count: tableCounts[table] ?? 0, error: null }),
      }),
    }),
  }),
}));

import {
  computeCollectionStats,
  getCollectionStats,
  formatApproximateCount,
  formatCount,
  DIGITAL_RESOURCE_KEYS,
  RESOURCE_SOURCES,
} from "./collection-stats";

/** The counts a healthy view returns. PostgREST hands back bigint as a
 *  string, which is why these are strings — the parser must cope. */
function row(over: Record<string, unknown> = {}) {
  return {
    books: "116",
    theses: "2",
    publications: "1",
    physical_catalogs: "4",
    learning_paths: "3",
    digital_resources: "119",
    searchable_resources: "110",
    ...over,
  };
}

beforeEach(() => {
  viewRow = row();
  viewErrorCode = null;
  for (const k of Object.keys(tableCounts)) delete tableCounts[k];
  Object.assign(tableCounts, {
    books: 116,
    research_reports: 2,
    publications: 1,
    catalog_books: 4,
    learning_paths: 3,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("counting rule", () => {
  it("totalDigitalResources = books + theses + publications", async () => {
    const stats = await computeCollectionStats();
    expect(stats!.totalDigitalResources).toBe(119);
    expect(DIGITAL_RESOURCE_KEYS).toEqual(["books", "theses", "publications"]);
  });

  it("EXCLUDES physical catalog records from the digital total", async () => {
    const stats = await computeCollectionStats();
    expect(stats!.physicalCatalogs).toBe(4);
    // 116 + 2 + 1 = 119. Adding the 4 physical records would give 123 — the
    // exact shape of the old homepage-vs-/books mismatch.
    expect(stats!.totalDigitalResources).toBe(119);
    expect(stats!.totalDigitalResources).not.toBe(123);
  });

  it("EXCLUDES learning paths from the digital total", async () => {
    const stats = await computeCollectionStats();
    expect(stats!.learningPaths).toBe(3);
    expect(stats!.totalDigitalResources).toBe(119);
  });

  it("reports each collection separately", async () => {
    const stats = await computeCollectionStats();
    expect(stats).toMatchObject({
      books: 116,
      theses: 2,
      publications: 1,
      physicalCatalogs: 4,
      learningPaths: 3,
      searchableResources: 110,
    });
  });

  it("parses bigint-as-string without turning counts into strings", async () => {
    const stats = await computeCollectionStats();
    for (const key of DIGITAL_RESOURCE_KEYS) {
      expect(typeof stats![key]).toBe("number");
    }
  });

  it("stamps calculatedAt with a parseable ISO timestamp", async () => {
    const stats = await computeCollectionStats();
    expect(Number.isNaN(Date.parse(stats!.calculatedAt))).toBe(false);
  });

  it("getCollectionStats delegates to the same compute (cache is pass-through in tests)", async () => {
    const stats = await getCollectionStats();
    expect(stats!.totalDigitalResources).toBe(119);
  });
});

describe("failure behaviour — never invent a number", () => {
  it("returns null when the view is unreadable", async () => {
    viewRow = new Error("relation does not exist");
    expect(await computeCollectionStats()).toBeNull();
  });

  it("returns null rather than 0 when a count is missing", async () => {
    viewRow = row({ books: null });
    expect(await computeCollectionStats()).toBeNull();
  });

  it("rejects a negative count", async () => {
    viewRow = row({ theses: "-1" });
    expect(await computeCollectionStats()).toBeNull();
  });

  it("rejects a non-numeric count instead of coercing it", async () => {
    viewRow = row({ publications: "many" });
    expect(await computeCollectionStats()).toBeNull();
  });

  it("rejects a total that disagrees with its own parts", async () => {
    // The view's digital_resources expression drifting out of step with
    // DIGITAL_RESOURCE_KEYS must fail loudly, not publish a wrong total.
    viewRow = row({ digital_resources: "200" });
    expect(await computeCollectionStats()).toBeNull();
  });

  it("rejects a searchable count larger than the total", async () => {
    viewRow = row({ searchable_resources: "500" });
    expect(await computeCollectionStats()).toBeNull();
  });
});

describe("formatCount", () => {
  it("formats exactly, with locale grouping", () => {
    expect(formatCount(116, "en")).toBe("116");
    expect(formatCount(1240, "en")).toBe("1,240");
    expect(formatCount(12500, "en")).toBe("12,500");
  });

  it("uses Western digits in Khmer (the rest of the UI does)", () => {
    expect(formatCount(116, "km")).toBe("116");
    expect(formatCount(12500, "km")).toMatch(/^12.500$/);
  });

  it("never renders NaN, undefined or a negative", () => {
    expect(formatCount(Number.NaN)).toBe("0");
    expect(formatCount(-5)).toBe("0");
  });
});

describe("formatApproximateCount", () => {
  it("floors to the decade with a plus", () => {
    expect(formatApproximateCount(116)).toBe("110+");
    expect(formatApproximateCount(120)).toBe("120+");
    expect(formatApproximateCount(129)).toBe("120+");
    expect(formatApproximateCount(10)).toBe("10+");
  });

  it("shows exact values below ten (no misleading '0+')", () => {
    expect(formatApproximateCount(0)).toBe("0");
    expect(formatApproximateCount(9)).toBe("9");
  });

  it("never renders NaN or a negative", () => {
    expect(formatApproximateCount(Number.NaN)).toBe("0");
    expect(formatApproximateCount(-5)).toBe("0");
  });
});

describe("degraded path (view not applied yet)", () => {
  it.each(["42P01", "PGRST205"])(
    "falls back to base-table counts on %s and applies the SAME rule",
    async (code) => {
      viewErrorCode = code;
      const stats = await computeCollectionStats();
      expect(stats).toMatchObject({
        books: 116,
        theses: 2,
        publications: 1,
        physicalCatalogs: 4,
        learningPaths: 3,
        // 116 + 2 + 1 — physical catalog and learning paths still excluded.
        totalDigitalResources: 119,
      });
    },
  );

  it("reports 0 searchable rather than guessing when the view is missing", async () => {
    viewErrorCode = "42P01";
    expect((await computeCollectionStats())!.searchableResources).toBe(0);
  });

  it("does NOT fall back on a genuine database error", async () => {
    // A real outage must blank the figure, not silently re-query five tables.
    viewRow = new Error("connection reset");
    expect(await computeCollectionStats()).toBeNull();
  });
});

describe("RESOURCE_SOURCES is the one predicate declaration", () => {
  it("covers every counted metric exactly once", () => {
    expect(RESOURCE_SOURCES.map((s) => s.key)).toEqual([
      "books",
      "theses",
      "publications",
      "physicalCatalogs",
      "learningPaths",
    ]);
  });

  it("uses is_active only for the physical catalog", () => {
    for (const source of RESOURCE_SOURCES) {
      const expected = source.table === "catalog_books" ? "is_active" : "is_published";
      expect(source.flag).toBe(expected);
    }
  });

  it("maps the digital keys onto the three digital tables", () => {
    const digitalTables = RESOURCE_SOURCES.filter((s) =>
      (DIGITAL_RESOURCE_KEYS as readonly string[]).includes(s.key),
    ).map((s) => s.table);
    expect(digitalTables).toEqual(["books", "research_reports", "publications"]);
  });
});
