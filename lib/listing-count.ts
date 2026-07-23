// lib/listing-count.ts
//
// One rule for "what number does a listing page put above its grid".
//
// The distinction this exists to keep straight:
//
//   global total    — every publicly visible record of that type, from
//                     lib/collection-stats.ts. Matches the figure the
//                     homepage shows for the same category.
//   filtered total  — records matching the ACTIVE query and filters, from
//                     the listing query's own exact `count`.
//
// Neither is ever `items.length`. The loaded page holds at most `pageSize`
// rows, so counting the array would make the total change as the reader
// pages — which is precisely the class of bug that made these figures
// distrusted in the first place.
//
// With filters active, both numbers are shown ("24 of 116"), so a reader who
// has narrowed the list can still see the collection size and reconcile it
// against the homepage.

export type CountLabelChoice =
  /** Nothing matched — call sites render their "no results" copy. */
  | { kind: "none" }
  /** One number: the listing is unfiltered, so filtered == global. */
  | { kind: "total"; count: number }
  /** Two numbers: "{count} of {total}". */
  | { kind: "filtered"; count: number; total: number };

/**
 * @param filteredTotal Exact DB count for the active query + filters.
 * @param globalTotal   Canonical published total for this resource type, or
 *                      null when the stats service could not be read (the
 *                      label then degrades to the filtered figure alone
 *                      rather than inventing a denominator).
 * @param hasFilters    Whether any query/filter narrowing is active.
 */
export function chooseCountLabel(
  filteredTotal: number,
  globalTotal: number | null,
  hasFilters: boolean,
): CountLabelChoice {
  if (!Number.isFinite(filteredTotal) || filteredTotal <= 0) return { kind: "none" };
  if (
    hasFilters &&
    globalTotal !== null &&
    Number.isFinite(globalTotal) &&
    globalTotal > filteredTotal
  ) {
    return { kind: "filtered", count: filteredTotal, total: globalTotal };
  }
  // No filters, or the filters happen to match everything, or the global
  // total is unavailable / stale-low (a resource published seconds ago can
  // make filteredTotal briefly exceed the cached global). Showing "120 of
  // 116" would be worse than showing one honest number.
  return { kind: "total", count: filteredTotal };
}
