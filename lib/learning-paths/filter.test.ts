// lib/learning-paths/filter.test.ts

import { describe, it, expect } from "vitest";
import { parsePathsFilterParams, filterAndSortPaths } from "./filter";
import type { LearningPathSummary } from "@/app/actions/learning-paths";

function createMockPath(overrides: Partial<LearningPathSummary>): LearningPathSummary {
  return {
    id: "path-1",
    slug: "sample-path",
    title: "Sample Path",
    title_km: "ផ្លូវគំរូ",
    description: "A sample learning path description",
    description_km: "ការពិពណ៌នាផ្លូវគំរូ",
    audience: "Teachers",
    cover_url: null,
    is_published: true,
    status: "published",
    featured: false,
    difficulty: "beginner",
    subject: "Mathematics",
    language: "en",
    tags: ["math", "primary"],
    position: 1,
    stepCount: 5,
    moduleCount: 2,
    durationMinutes: 45,
    updated_at: "2026-01-01T00:00:00Z",
    published_at: "2026-01-01T00:00:00Z",
    stepResources: [],
    ...overrides,
  };
}

describe("parsePathsFilterParams", () => {
  it("defaults unknown or missing values to safe defaults", () => {
    expect(parsePathsFilterParams(undefined)).toEqual({ level: "all", q: "", sort: "popular" });
    expect(parsePathsFilterParams({})).toEqual({ level: "all", q: "", sort: "popular" });
    expect(parsePathsFilterParams({ level: "invalid", sort: "unknown" })).toEqual({
      level: "all",
      q: "",
      sort: "popular",
    });
  });

  it("parses valid levels correctly (case-insensitive)", () => {
    expect(parsePathsFilterParams({ level: "beginner" }).level).toBe("beginner");
    expect(parsePathsFilterParams({ level: "INTERMEDIATE" }).level).toBe("intermediate");
    expect(parsePathsFilterParams({ level: "advanced" }).level).toBe("advanced");
    expect(parsePathsFilterParams({ level: "all" }).level).toBe("all");
  });

  it("parses valid sorts correctly", () => {
    expect(parsePathsFilterParams({ sort: "popular" }).sort).toBe("popular");
    expect(parsePathsFilterParams({ sort: "shortest" }).sort).toBe("shortest");
    expect(parsePathsFilterParams({ sort: "longest" }).sort).toBe("longest");
  });

  it("trims and clamps query strings", () => {
    expect(parsePathsFilterParams({ q: "  mathematics  " }).q).toBe("mathematics");
    const longQ = "a".repeat(150);
    expect(parsePathsFilterParams({ q: longQ }).q.length).toBe(100);
  });

  it("handles URLSearchParams object", () => {
    const params = new URLSearchParams("level=intermediate&sort=shortest&q=science");
    expect(parsePathsFilterParams(params)).toEqual({
      level: "intermediate",
      sort: "shortest",
      q: "science",
    });
  });
});

describe("filterAndSortPaths", () => {
  const p1 = createMockPath({
    id: "p1",
    title: "Primary Math",
    title_km: "គណិតវិទ្យាបឋម",
    difficulty: "beginner",
    durationMinutes: 30,
    position: 1,
    tags: ["arithmetic"],
  });
  const p2 = createMockPath({
    id: "p2",
    title: "Science Inquiries",
    title_km: "ការស៊ើបអង្កេតវិទ្យាសាស្ត្រ",
    difficulty: "intermediate",
    subject: "Science",
    durationMinutes: 90,
    position: 2,
    tags: ["biology"],
  });
  const p3 = createMockPath({
    id: "p3",
    title: "Advanced Action Research",
    title_km: "ការស្រាវជ្រាវសកម្មភាពកម្រិតខ្ពស់",
    difficulty: "advanced",
    subject: "Education",
    durationMinutes: 180,
    position: 3,
    tags: ["research"],
  });

  const all = [p1, p2, p3];

  it("filters by level", () => {
    const beginners = filterAndSortPaths(all, { level: "beginner", q: "", sort: "popular" });
    expect(beginners.map((p) => p.id)).toEqual(["p1"]);

    const advanced = filterAndSortPaths(all, { level: "advanced", q: "", sort: "popular" });
    expect(advanced.map((p) => p.id)).toEqual(["p3"]);

    const allLevels = filterAndSortPaths(all, { level: "all", q: "", sort: "popular" });
    expect(allLevels.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("filters by search query in English and Khmer", () => {
    const mathMatch = filterAndSortPaths(all, { level: "all", q: "math", sort: "popular" });
    expect(mathMatch.map((p) => p.id)).toEqual(["p1"]);

    const khmerMatch = filterAndSortPaths(all, { level: "all", q: "វិទ្យាសាស្ត្រ", sort: "popular" });
    expect(khmerMatch.map((p) => p.id)).toEqual(["p2"]);

    const tagMatch = filterAndSortPaths(all, { level: "all", q: "biology", sort: "popular" });
    expect(tagMatch.map((p) => p.id)).toEqual(["p2"]);

    const noMatch = filterAndSortPaths(all, { level: "all", q: "nonexistent", sort: "popular" });
    expect(noMatch).toEqual([]);
  });

  it("sorts by shortest and longest duration", () => {
    const shortest = filterAndSortPaths(all, { level: "all", q: "", sort: "shortest" });
    expect(shortest.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);

    const longest = filterAndSortPaths(all, { level: "all", q: "", sort: "longest" });
    expect(longest.map((p) => p.id)).toEqual(["p3", "p2", "p1"]);
  });

  it("sorts by popularity based on enrollment counts", () => {
    const counts = new Map([
      ["p1", 5],
      ["p2", 20],
      ["p3", 12],
    ]);
    const popular = filterAndSortPaths(all, { level: "all", q: "", sort: "popular" }, counts);
    expect(popular.map((p) => p.id)).toEqual(["p2", "p3", "p1"]);
  });
});
