// lib/authors/stats.ts
//
// Pure derivations for the author profile. Separated from the fetch so the
// rules ("don't claim a publication span from a single year", "don't show a
// type count of 1") are testable without a database.
//
// Deliberately NOT computed here: citation counts, h-index, or anything else
// the library cannot observe. A repository that shows a fabricated impact
// metric is worse than one that shows none.

import type { AuthorStats, AuthorWork, AuthorWorkType } from "@/lib/authors/types";

const TYPE_ORDER: AuthorWorkType[] = ["publication", "thesis", "ebook", "catalog"];

export function authorStats(works: AuthorWork[]): AuthorStats {
  const years = works
    .map((w) => w.year)
    .filter((y): y is number => typeof y === "number" && Number.isFinite(y));

  const counts = new Map<AuthorWorkType, number>();
  for (const w of works) counts.set(w.type, (counts.get(w.type) ?? 0) + 1);

  const byType = TYPE_ORDER.filter((t) => (counts.get(t) ?? 0) > 0).map((type) => ({
    type,
    count: counts.get(type) as number,
  }));

  return {
    workCount: works.length,
    firstYear: years.length > 0 ? Math.min(...years) : null,
    lastYear: years.length > 0 ? Math.max(...years) : null,
    typeCount: byType.length,
    byType,
  };
}

/**
 * "2021–2026", or "2026" for a single year, or null when no work is dated.
 * A span of one year is rendered as that year rather than "2026–2026".
 */
export function publicationSpan(stats: AuthorStats): string | null {
  if (stats.firstYear === null || stats.lastYear === null) return null;
  return stats.firstYear === stats.lastYear
    ? String(stats.firstYear)
    : `${stats.firstYear}–${stats.lastYear}`;
}

/** Year from an ISO-ish date string, or null. Rejects implausible years. */
export function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const match = /^(\d{4})/.exec(date.trim());
  if (!match) return null;
  const year = Number(match[1]);
  // A library record dated 1200 or 2999 is data corruption, not history.
  return year >= 1400 && year <= new Date().getFullYear() + 2 ? year : null;
}

/**
 * Sort for the works list: newest first, undated last (an undated record is
 * not "year zero"), ties broken by title so the order is stable across renders
 * and across server/client.
 */
export function sortWorks(works: AuthorWork[]): AuthorWork[] {
  return [...works].sort((a, b) => {
    if (a.year !== b.year) {
      if (a.year === null) return 1;
      if (b.year === null) return -1;
      return b.year - a.year;
    }
    return a.title.localeCompare(b.title);
  });
}
