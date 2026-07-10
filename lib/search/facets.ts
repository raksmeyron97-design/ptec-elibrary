// Pure faceting logic shared by /api/search/native (server) and the /search
// sidebar (client). Facet filters are applied in memory over the candidate
// pool the search already fetched, so live per-value counts never require
// extra queries (no N+1) and multi-select within a dimension is a cheap OR.
//
// Wire format: comma-separated values in the existing URL param names
// (`subject=Math,Science&lang=km`), so old single-value links keep working.
// A value that itself contains a comma cannot round-trip; it simply becomes
// a selected chip with count 0 rather than an error.

export const FACET_DIMENSIONS = ["types", "subjects", "langs", "years", "availability"] as const;
export type FacetDimension = (typeof FACET_DIMENSIONS)[number];

export type FacetSelections = Record<FacetDimension, string[]>;

export type FacetCount = { value: string; count: number; selected: boolean };
export type SearchFacetCounts = Record<FacetDimension, FacetCount[]>;

export type FacetableRow = {
  type: string;
  subject?: string | null;
  category?: string | null;
  language?: string | null;
  year?: number | null;
  availability?: string | null;
};

/** URL param name for each dimension (also the API query-param contract). */
export const FACET_PARAM_KEYS: Record<FacetDimension, string> = {
  types: "types",
  subjects: "subject",
  langs: "lang",
  years: "year",
  availability: "availability",
};

const MAX_SELECTED_PER_DIMENSION = 8;
const MAX_LISTED: Record<FacetDimension, number> = {
  types: 5,
  subjects: 20,
  langs: 10,
  years: 15,
  availability: 8,
};

function norm(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function parseListParam(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const value = part.trim();
    const key = norm(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_SELECTED_PER_DIMENSION) break;
  }
  return out;
}

export function parseFacetSelections(get: (key: string) => string | null): FacetSelections {
  return {
    types: parseListParam(get("types")),
    // `category` is the legacy alias for subject kept by older links/chips.
    subjects: parseListParam(get("subject") ?? get("category")),
    langs: parseListParam(get("lang")),
    years: parseListParam(get("year")),
    availability: parseListParam(get("availability")),
  };
}

export function hasAnySelection(selections: FacetSelections): boolean {
  return FACET_DIMENSIONS.some((dim) => selections[dim].length > 0);
}

export function hasNonTypeSelection(selections: FacetSelections): boolean {
  return FACET_DIMENSIONS.some((dim) => dim !== "types" && selections[dim].length > 0);
}

export function facetValueOf(row: FacetableRow, dim: FacetDimension): string | null {
  switch (dim) {
    case "types":
      return row.type || null;
    case "subjects":
      return row.subject ?? row.category ?? null;
    case "langs":
      return row.language ?? null;
    case "years":
      return row.year ? String(row.year) : null;
    case "availability":
      return row.availability ?? null;
  }
}

/**
 * AND across dimensions, OR within a dimension. `exclude` skips one dimension —
 * used when counting that dimension's own values, so selecting "Khmer" still
 * shows how many results "English" would add (standard faceted-search UX).
 */
export function matchesFacets(
  row: FacetableRow,
  selections: FacetSelections,
  exclude?: FacetDimension,
): boolean {
  for (const dim of FACET_DIMENSIONS) {
    if (dim === exclude) continue;
    const wanted = selections[dim];
    if (!wanted.length) continue;
    const actual = norm(facetValueOf(row, dim));
    if (!actual || !wanted.some((w) => norm(w) === actual)) return false;
  }
  return true;
}

export function buildFacetCounts(
  rows: FacetableRow[],
  selections: FacetSelections,
): SearchFacetCounts {
  const out = {} as SearchFacetCounts;
  for (const dim of FACET_DIMENSIONS) {
    const counts = new Map<string, { value: string; count: number }>();
    for (const row of rows) {
      if (!matchesFacets(row, selections, dim)) continue;
      const value = facetValueOf(row, dim);
      if (!value) continue;
      const key = norm(value);
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { value, count: 1 });
    }
    // Selected values always stay listed (even at count 0) so they can be unchecked.
    for (const sel of selections[dim]) {
      if (!counts.has(norm(sel))) counts.set(norm(sel), { value: sel, count: 0 });
    }
    const selectedKeys = new Set(selections[dim].map(norm));
    let list: FacetCount[] = [...counts.values()].map((c) => ({
      ...c,
      selected: selectedKeys.has(norm(c.value)),
    }));
    if (dim === "years") list.sort((a, b) => Number(b.value) - Number(a.value));
    else list.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    const cap = MAX_LISTED[dim];
    if (list.length > cap) {
      const kept = list.slice(0, cap);
      for (const item of list.slice(cap)) if (item.selected) kept.push(item);
      list = kept;
    }
    out[dim] = list;
  }
  return out;
}

/** Toggle `value` inside a comma-list param; returns null when the list empties. */
export function toggleListParam(current: string | null, value: string): string | null {
  const list = parseListParam(current);
  const key = norm(value);
  const next = list.some((v) => norm(v) === key)
    ? list.filter((v) => norm(v) !== key)
    : [...list, value];
  return next.length ? next.join(",") : null;
}
