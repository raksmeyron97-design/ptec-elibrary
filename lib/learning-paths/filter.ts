// lib/learning-paths/filter.ts
//
// Pure, dependency-free server-side filter, search, and sort functions for
// the public Learning Paths catalogue (/paths, /km/paths).
// Kept free of React, Next.js server cookies/headers, and Supabase so it can
// run on the server to render initial filtered HTML, inside API routes,
// and in offline unit tests.

import type { LearningPathSummary } from "@/app/actions/learning-paths";

export const VALID_LEVELS = ["all", "beginner", "intermediate", "advanced"] as const;
export type PathLevelFilter = (typeof VALID_LEVELS)[number];

export const VALID_SORTS = ["popular", "shortest", "longest"] as const;
export type PathSortOption = (typeof VALID_SORTS)[number];

export interface PathsFilterParams {
  level: PathLevelFilter;
  q: string;
  sort: PathSortOption;
}

/**
 * Validate and sanitize URL search parameters on the server.
 * Unknown or malicious values degrade gracefully to safe defaults.
 */
export function parsePathsFilterParams(
  raw: Record<string, string | string[] | undefined> | URLSearchParams | undefined,
): PathsFilterParams {
  const getParam = (key: string): string => {
    if (!raw) return "";
    if (raw instanceof URLSearchParams) return raw.get(key) ?? "";
    const val = raw[key];
    if (Array.isArray(val)) return val[0] ?? "";
    return val ?? "";
  };

  const rawLevel = getParam("level").toLowerCase().trim();
  const level: PathLevelFilter = (VALID_LEVELS as readonly string[]).includes(rawLevel)
    ? (rawLevel as PathLevelFilter)
    : "all";

  const rawSort = getParam("sort").toLowerCase().trim();
  const sort: PathSortOption = (VALID_SORTS as readonly string[]).includes(rawSort)
    ? (rawSort as PathSortOption)
    : "popular";

  const rawQ = getParam("q").trim().slice(0, 100);

  return { level, q: rawQ, sort };
}

/**
 * Pure filter and sort implementation for LearningPathSummary items.
 *
 * @param paths The array of published learning paths.
 * @param params Validated filter/search/sort criteria.
 * @param enrollmentCounts Optional map of pathId -> total enrollment count for popular sorting.
 */
export function filterAndSortPaths(
  paths: readonly LearningPathSummary[],
  params: PathsFilterParams,
  enrollmentCounts?: ReadonlyMap<string, number>,
): LearningPathSummary[] {
  const { level, q, sort } = params;
  const needle = q.toLowerCase();

  const filtered = paths.filter((p) => {
    // 1. Level filter
    if (level !== "all") {
      if ((p.difficulty ?? "").toLowerCase() !== level) return false;
    }

    // 2. Query search
    if (needle) {
      const haystack = [
        p.title,
        p.title_km,
        p.description,
        p.description_km,
        p.audience,
        p.subject,
        ...(p.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(needle)) return false;
    }

    return true;
  });

  const result = [...filtered];

  switch (sort) {
    case "popular":
      result.sort((a, b) => {
        const countA = a.enrollmentCount ?? enrollmentCounts?.get(a.id) ?? 0;
        const countB = b.enrollmentCount ?? enrollmentCounts?.get(b.id) ?? 0;
        if (countB !== countA) return countB - countA;
        return a.position - b.position;
      });
      break;

    case "shortest":
      result.sort((a, b) => {
        const durA = a.durationMinutes != null && a.durationMinutes > 0 ? a.durationMinutes : Infinity;
        const durB = b.durationMinutes != null && b.durationMinutes > 0 ? b.durationMinutes : Infinity;
        if (durA !== durB) return durA - durB;
        return a.position - b.position;
      });
      break;

    case "longest":
      result.sort((a, b) => {
        const durA = a.durationMinutes != null && a.durationMinutes > 0 ? a.durationMinutes : -Infinity;
        const durB = b.durationMinutes != null && b.durationMinutes > 0 ? b.durationMinutes : -Infinity;
        if (durB !== durA) return durB - durA;
        return a.position - b.position;
      });
      break;

    default:
      result.sort((a, b) => a.position - b.position);
  }

  return result;
}
