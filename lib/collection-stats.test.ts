// lib/collection-stats.test.ts
//
// Pins the public counting rule and the approximate-count formatter. If the
// rule ever changes, change it HERE and in lib/collection-stats.ts together —
// every public counter reads from that one service.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  // Pass-through: tests exercise the compute function, not Next's cache.
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

// Table → published count served by the fake client.
const tableCounts: Record<string, number | Error> = {};

vi.mock("./supabase/public", () => ({
  createPublicClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: async () => {
          const v = tableCounts[table];
          if (v instanceof Error) return { count: null, error: { message: v.message } };
          return { count: v ?? 0, error: null };
        },
      }),
    }),
  }),
}));

import {
  computeCollectionStats,
  getCollectionStats,
  formatApproximateCount,
} from "./collection-stats";

beforeEach(() => {
  for (const k of Object.keys(tableCounts)) delete tableCounts[k];
  Object.assign(tableCounts, {
    books: 116,
    research_reports: 2,
    publications: 1,
    catalog_books: 4,
    learning_paths: 3,
  });
});

describe("counting rule", () => {
  it("totalDigitalResources = books + theses + publications, NEVER physical catalog", async () => {
    const stats = await computeCollectionStats();
    expect(stats).not.toBeNull();
    expect(stats!.totalDigitalResources).toBe(116 + 2 + 1);
    // The old get_home_stats() rule blended catalog_books in (116 + 4 = 120,
    // shown as "120+"); this pins that it can never come back.
    expect(stats!.totalDigitalResources).not.toBe(116 + 4);
    expect(stats!.physicalCatalogs).toBe(4);
  });

  it("reports each collection separately", async () => {
    const stats = await computeCollectionStats();
    expect(stats).toMatchObject({
      books: 116,
      theses: 2,
      publications: 1,
      physicalCatalogs: 4,
      learningPaths: 3,
    });
  });

  it("stamps calculatedAt with a parseable ISO timestamp", async () => {
    const stats = await computeCollectionStats();
    expect(Number.isNaN(Date.parse(stats!.calculatedAt))).toBe(false);
  });

  it("returns null (not zeros) when any count fails — callers must omit, not show 0", async () => {
    tableCounts.publications = new Error("connection refused");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const stats = await computeCollectionStats();
    expect(stats).toBeNull();
    expect(spy).toHaveBeenCalled(); // structured failure log
    spy.mockRestore();
  });

  it("getCollectionStats delegates to the same compute (cache is pass-through in tests)", async () => {
    const stats = await getCollectionStats();
    expect(stats!.totalDigitalResources).toBe(119);
  });
});

describe("formatApproximateCount", () => {
  it("floors to the nearest ten with a plus (truthful 'at least N')", () => {
    expect(formatApproximateCount(116)).toBe("110+");
    expect(formatApproximateCount(120)).toBe("120+");
    expect(formatApproximateCount(129)).toBe("120+");
    expect(formatApproximateCount(10)).toBe("10+");
  });

  it("shows small counts exactly", () => {
    expect(formatApproximateCount(0)).toBe("0");
    expect(formatApproximateCount(9)).toBe("9");
  });

  it("never emits NaN/undefined for bad input", () => {
    expect(formatApproximateCount(Number.NaN)).toBe("0");
    expect(formatApproximateCount(-5)).toBe("0");
  });
});
