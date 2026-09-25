// lib/catalogs/facets.ts
//
// Facet counts for the public Physical Library listing: how many records each
// category, each language and "available only" would leave. Pure.
//
// The counts are DISJUNCTIVE, the convention every library catalogue uses: a
// facet's count ignores that facet's own selection but honours every other
// one. With "English" selected, the language row still says how many Khmer
// records there are (so switching is informed), while the category row counts
// only English records (so it says what a click will actually show).
//
// Three dimensions with a handful of values each, so the unit of work is a
// CROSS-TAB — one cell per (category, language, available) combination, a few
// dozen for the whole PMB catalogue — rather than the rows themselves. The
// listing caches the cells, not ~2,600 rows, and every count is a sum over
// them. The same function serves a search: the page tabulates the query's
// candidates instead of the whole catalogue.
//
// Matching is exact equality for category and language, and must stay the
// same predicate the page applies in SQL (`.eq`) — a count that disagrees with
// the result it links to is worse than no count. Availability is
// `copies_available > 0`, the denormalised counter the SQL filter reads.

export type FacetSourceRow = {
  category: string | null;
  language: string | null;
  copies_available: number | null;
};

export type FacetCell = {
  category: string | null;
  language: string | null;
  available: boolean;
  count: number;
};

export type FacetSelection = {
  category?: string;
  language?: string;
  availableOnly: boolean;
};

export type FacetValue = { value: string; count: number };

export type CatalogFacets = {
  /** Records matching every selection. */
  total: number;
  /**
   * What "All" in the category row would show: every record the other
   * selections leave, INCLUDING those with no category — which is why it is
   * not the sum of `categories`.
   */
  anyCategory: number;
  /** Records with a category, per category, ignoring the category selection. Sorted by value. */
  categories: FacetValue[];
  /** Per language code, ignoring the language selection. Largest first. */
  languages: FacetValue[];
  /** Records with a copy on the shelf, ignoring the availability selection. */
  available: number;
};

const blank = (v: string | null | undefined) => (v == null || v.trim() === "" ? null : v);

export type FacetPoint = { category: string | null; language: string | null; available: boolean };

/** A record as the facets see it: blank means absent, availability is the counter. */
export function facetPointOf(r: FacetSourceRow): FacetPoint {
  return {
    category: blank(r.category),
    language: canonicalLanguage(r.language),
    available: (r.copies_available ?? 0) > 0,
  };
}

export function tabulateFacets(rows: Iterable<FacetSourceRow>): FacetCell[] {
  const cells = new Map<string, FacetCell>();
  for (const r of rows) {
    const { category, language, available } = facetPointOf(r);
    // JSON of a tuple: no separator a category name could contain.
    const key = JSON.stringify([category, language, available]);
    const cell = cells.get(key);
    if (cell) cell.count++;
    else cells.set(key, { category, language, available, count: 1 });
  }
  return [...cells.values()];
}

type Dimension = "category" | "language" | "available";

/** Does a record (or cell) pass the selection, optionally ignoring one dimension? */
export function matchesSelection(
  row: FacetPoint,
  sel: FacetSelection,
  ignore?: Dimension,
): boolean {
  if (ignore !== "category" && sel.category && row.category !== sel.category) return false;
  if (ignore !== "language" && sel.language && row.language !== sel.language) return false;
  if (ignore !== "available" && sel.availableOnly && !row.available) return false;
  return true;
}

const valueCollator = new Intl.Collator("en", { numeric: true });

export function computeFacets(cells: readonly FacetCell[], sel: FacetSelection): CatalogFacets {
  const byCategory = new Map<string, number>();
  const byLanguage = new Map<string, number>();
  let total = 0;
  let anyCategory = 0;
  let available = 0;

  for (const c of cells) {
    if (matchesSelection(c, sel)) total += c.count;
    if (matchesSelection(c, sel, "category")) {
      anyCategory += c.count;
      if (c.category) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + c.count);
    }
    if (c.language && matchesSelection(c, sel, "language")) {
      byLanguage.set(c.language, (byLanguage.get(c.language) ?? 0) + c.count);
    }
    if (c.available && matchesSelection(c, sel, "available")) available += c.count;
  }

  const list = (m: Map<string, number>) => [...m].map(([value, count]) => ({ value, count }));
  return {
    total,
    anyCategory,
    // DDC-prefixed names ("370 …", "500 …") read in class order; numeric so
    // "90" would sort before "370".
    categories: list(byCategory).sort((a, b) => valueCollator.compare(a.value, b.value)),
    languages: list(byLanguage).sort((a, b) => b.count - a.count || valueCollator.compare(a.value, b.value)),
    available,
  };
}

/**
 * Languages are faceted by CODE. The admin form and the importer store codes
 * (km/en/fr/zh); seeded and older rows carry the English name ("English"),
 * and counting those separately put "English 1,348" and "English 2" side by
 * side. A known spelling folds to its code; anything else stays as stored.
 */
const LANGUAGE_SPELLINGS: Record<string, readonly string[]> = {
  km: ["km", "khmer", "ខ្មែរ"],
  en: ["en", "english"],
  fr: ["fr", "french"],
  zh: ["zh", "chinese"],
};
const CODE_OF = new Map(
  Object.entries(LANGUAGE_SPELLINGS).flatMap(([code, names]) => names.map((n) => [n, code] as const)),
);

export function canonicalLanguage(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") return null;
  return CODE_OF.get(value.trim().toLowerCase()) ?? value;
}

/**
 * The stored spellings of a known language code, for the browse query's SQL
 * filter — which must select exactly what the facet counted. Null for a value
 * that is not a known code: the caller then matches it exactly, and never
 * splices a reader-supplied string into a filter.
 */
export function languageSpellings(code: string): readonly string[] | null {
  return Object.hasOwn(LANGUAGE_SPELLINGS, code) ? LANGUAGE_SPELLINGS[code] : null;
}

const LANGUAGE_LABEL: Record<string, string> = { km: "langKm", en: "langEn", fr: "langFr", zh: "langZh" };

/** The `catalogs.detail.lang*` message key for a stored language value. */
export function languageLabelKey(value: string): string {
  return LANGUAGE_LABEL[canonicalLanguage(value) ?? ""] ?? "langOther";
}
