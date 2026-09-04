// One normalization pipeline for search, shared by the ranking model and the
// route that feeds it. It is deliberately the SAME rule the ingestion gate uses
// to decide what "the same title" and "the same ISBN" mean
// (lib/books/duplicate-detection/normalize.ts), so a title the upload gate
// would recognise as a match is also one the search box finds:
//
//  - NFKD, then only LATIN combining diacritics stripped ("Zoë" = "Zoe");
//    Khmer vowel signs and subscripts are combining marks that carry meaning,
//    and they survive untouched. No script is transliterated.
//  - case-folded; every run of punctuation/whitespace collapses to one space
//    ("Introduction-to-Psychology" = "introduction to psychology").
//  - ISBNs canonicalise to ISBN-13 for matching, lenient on the check digit.
//
// The original query is never rewritten for display or analytics — callers
// keep the raw string and pass it here only to compare.
//
// Pure and browser-safe: no DB, no server-only imports.

import {
  isbnMatchKeys,
  normalizeIsbn,
  normalizeTitle,
} from "@/lib/books/duplicate-detection/normalize";

export { normalizeIsbn };

/** Whole query plus its words, so a multi-word query is scored as a phrase
 *  AND as terms. Bounded — a long paste cannot fan out into dozens of
 *  clauses. Khmer has no word boundaries, so a Khmer query is one token. */
export const MAX_QUERY_TOKENS = 8;

/** Casefolded, diacritic-folded, punctuation-collapsed comparison form. */
export function normalizeSearchText(raw: string | null | undefined): string {
  return normalizeTitle(raw);
}

/**
 * The query and its individual terms (≥ 2 chars), whole query first, deduped,
 * capped at MAX_QUERY_TOKENS. Returned RAW (not normalized) because the same
 * list feeds both the database `ilike` filter, which runs against stored
 * text, and the scorer, which normalizes each side itself.
 */
export function tokenizeSearchQuery(q: string): string[] {
  const words = q.split(/\s+/).filter((w) => w.length >= 2);
  return Array.from(new Set([q, ...words])).slice(0, MAX_QUERY_TOKENS);
}

/** Only digits, an X check character and the separators people type. */
const ISBN_SHAPE = /^[\d០-៩xX\s.-]+$/;

/**
 * The ISBN a query IS, or null when the query is words. A query counts as an
 * ISBN only when the whole string is ISBN-shaped — "978-1-4739-4629-3",
 * "9781473946293", "0 415 17152 0" — never when digits merely appear inside
 * a title ("SPSS 16.0", "Grade 12 Physics").
 */
export function queryIsbn(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || !ISBN_SHAPE.test(trimmed)) return null;
  return normalizeIsbn(trimmed);
}

/**
 * Every digit string a stored ISBN column might hold for this query — the
 * ISBN-13, its ISBN-10 twin, and the raw digits typed — so one `ilike` set
 * finds a row whichever form the cataloguer entered.
 */
export function isbnSearchKeys(raw: string | null | undefined): string[] {
  return isbnMatchKeys(raw);
}

/** Same ISBN, whichever form either side is written in. */
export function isbnEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeIsbn(a);
  return left !== null && left === normalizeIsbn(b);
}

export function hasKhmer(text: string): boolean {
  return /[ក-៿]/.test(text);
}

/**
 * Levenshtein distance, abandoned as soon as it exceeds `max` (returns
 * max + 1). Used for one-typo tolerance on Latin terms only — Khmer has no
 * word boundaries, so character distance between Khmer "words" is noise.
 */
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] > max ? max + 1 : prev[b.length];
}

/** How many edits a term of this length may be off by and still count. */
export function typoTolerance(term: string): number {
  if (hasKhmer(term) || term.length < 4) return 0;
  return term.length >= 8 ? 2 : 1;
}
