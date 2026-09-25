// lib/catalogs/search-scope.ts
//
// "Search in: …" for the public Physical Library listing — which columns a
// query is matched against. Pure: this module DESCRIBES the filters, the page
// runs them, so the choice of columns and the sanitising of what a reader
// typed are unit-tested without a database.
//
// Every leg is a substring match (`ilike %…%`), the same semantics the listing
// has always had. Two sanitisers, because the two ways a value reaches
// PostgREST are not equally tolerant:
//
//   • inside an `.or()` string, `(`, `)`, `,` and `.` are STRUCTURE — a title
//     containing one would split or break the filter — so they are stripped;
//   • passed to `.ilike(column, value)`, the value is a value, so a dot
//     survives ("372.7", "Vol. 2"). Parentheses and commas are still dropped:
//     that is the existing, proven rule for the DDC leg and there is no reader
//     query they would rescue.
//
// Both drop the ILIKE wildcards `%` and `_`, and `*`, which PostgREST reads as
// `%` in a like/ilike pattern — a lone "*" would otherwise match every record.
//
// "subject" is the record's category (its DDC class name in the PMB data).
// Keywords are deliberately not searched: the column is a text[] PostgREST
// cannot substring-match without a migration, and widening search to them is
// a product decision that was explicitly deferred (Gate 2).

export const CATALOG_SEARCH_SCOPES = ["all", "title", "author", "subject", "isbn", "callnumber"] as const;
export type CatalogSearchScope = (typeof CATALOG_SEARCH_SCOPES)[number];

/** Anything unrecognised — including an absent or empty `in` — searches all fields. */
export function parseSearchScope(raw: string | null | undefined): CatalogSearchScope {
  return (CATALOG_SEARCH_SCOPES as readonly string[]).includes(raw ?? "")
    ? (raw as CatalogSearchScope)
    : "all";
}

/** Columns a single-column leg may name. A closed list: nothing a reader sends reaches a column name. */
export type CatalogSearchColumn = "title" | "author" | "category" | "isbn" | "ddc" | "shelf_location";

export type CatalogSearchLeg =
  /** A PostgREST `.or()` over several columns; `filter` is already sanitised. */
  | { kind: "or"; filter: string }
  /** `.ilike(column, pattern)`; `pattern` is passed as a value, never spliced. */
  | { kind: "ilike"; column: CatalogSearchColumn; pattern: string };

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** For text spliced into an `.or()` string. */
export function sanitizeOrTerm(raw: string): string {
  return collapse(raw.replace(/[(),.\\%_*]/g, " "));
}

/** For a value passed to `.ilike()`. Keeps dots. */
export function sanitizeValueTerm(raw: string): string {
  return collapse(raw.replace(/[(),\\%_*]/g, " "));
}

/**
 * The digits of an ISBN as the catalogue stores it: `normalizeIsbn()` keeps
 * `[0-9X]` with no hyphens or spaces, so "978-9924-100-01-4" must be searched
 * as "9789924100014" or it matches nothing.
 */
export function isbnSearchDigits(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, "").toUpperCase();
}

/** "978-9924-100-01-4", "0 306 40615 2", "030640615X" — a query that is an ISBN and nothing else. */
export function looksLikeIsbn(raw: string): boolean {
  const t = raw.trim();
  if (!/^[\d\s-]+[\dXx]$/.test(t)) return false;
  const n = isbnSearchDigits(t).length;
  return n === 10 || n === 13;
}

/**
 * The candidate legs for one query. Their results are UNIONED by the caller.
 * An empty array means the query cannot match anything in this scope (an ISBN
 * search containing no digits) — the caller answers "no results", never "all".
 */
export function catalogSearchLegs(rawQ: string, scope: CatalogSearchScope): CatalogSearchLeg[] {
  const value = sanitizeValueTerm(rawQ);
  const ilike = (column: CatalogSearchColumn, term: string): CatalogSearchLeg => ({
    kind: "ilike",
    column,
    pattern: `%${term}%`,
  });

  switch (scope) {
    case "title":
      return value ? [ilike("title", value)] : [];
    case "author":
      return value ? [ilike("author", value)] : [];
    case "subject":
      return value ? [ilike("category", value)] : [];
    case "isbn": {
      const digits = isbnSearchDigits(rawQ);
      if (!digits) return [];
      const legs = [ilike("isbn", digits)];
      // A row written without normalisation (the seed, an early hand entry)
      // keeps its hyphens; the reader's own spelling finds that one.
      if (value && value !== digits) legs.push(ilike("isbn", value));
      return legs;
    }
    case "callnumber":
      // The PMB call number ("371.1 HAT") lives in `ddc`; a hand-catalogued
      // record may carry its shelf mark in `shelf_location` instead.
      return value ? [ilike("ddc", value), ilike("shelf_location", value)] : [];
    case "all": {
      const q = sanitizeOrTerm(rawQ);
      const legs: CatalogSearchLeg[] = [];
      if (q) {
        legs.push({
          kind: "or",
          filter: `title.ilike.%${q}%,author.ilike.%${q}%,isbn.ilike.%${q}%,accession_number.ilike.%${q}%`,
        });
      }
      // The DDC leg keeps the dot the `.or()` sanitiser strips: "372.7"
      // arrives there as "372 7" and would match nothing.
      if (value) legs.push(ilike("ddc", value));
      // A hyphenated ISBN reaches the `.or()` leg with its hyphens and cannot
      // match the stored bare digits.
      if (looksLikeIsbn(rawQ)) legs.push(ilike("isbn", isbnSearchDigits(rawQ)));
      return legs;
    }
  }
}
