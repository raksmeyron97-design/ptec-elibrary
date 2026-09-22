// Pure review-workspace helpers for the duplicate queue: summary counts,
// evidence ordering, search/filter, and sorting.
//
// Deliberately SEPARATE from lib/admin/duplicates.ts. That module decides what
// a duplicate IS, and nothing here may change that answer — these functions
// only decide which of the detector's groups an administrator is looking at
// right now and in what order. Keeping the split means a UI change can never
// silently weaken detection, and both halves stay unit-testable without a DB.

import { normalizeIsbn, type DuplicateConfidence, type DuplicateGroup, type DuplicateSignal } from "./duplicates";

export const DUPLICATE_CONFIDENCES = ["high", "medium", "low"] as const;
export const DUPLICATE_SORTS = ["confidence", "records", "oldest", "title"] as const;
export type DuplicateSort = (typeof DUPLICATE_SORTS)[number];

/**
 * The signals a reviewer can filter by — exactly the seven the detector can
 * emit. Listed in reading order: file/record identity first, then the
 * corroborating attributes, then the weakest hint last.
 */
export const SIGNAL_DISPLAY_ORDER: readonly DuplicateSignal[] = [
  "isbn",
  "content-hash",
  "title",
  "author",
  "year",
  "file-size",
  "title-prefix",
] as const;

/**
 * Signals that identify the same object on their own — a shared ISBN or a
 * byte-identical PDF. Everything else is corroboration around a title match,
 * which is also how genuinely different editions look; the UI renders the two
 * kinds differently so "why" is legible without reading the detector.
 */
const STRONG_SIGNALS: ReadonlySet<DuplicateSignal> = new Set<DuplicateSignal>(["isbn", "content-hash"]);

export function isStrongSignal(signal: DuplicateSignal): boolean {
  return STRONG_SIGNALS.has(signal);
}

const CONFIDENCE_RANK: Record<DuplicateConfidence, number> = { high: 3, medium: 2, low: 1 };

export type DuplicateSummary = {
  groups: number;
  high: number;
  medium: number;
  low: number;
  /** Total records sitting in a group — the size of the review backlog. */
  booksAffected: number;
};

export function summarizeDuplicateGroups(groups: readonly DuplicateGroup[]): DuplicateSummary {
  const summary: DuplicateSummary = { groups: groups.length, high: 0, medium: 0, low: 0, booksAffected: 0 };
  for (const group of groups) {
    summary[group.confidence] += 1;
    summary.booksAffected += group.books.length;
  }
  return summary;
}

/** Sort a group's signals into SIGNAL_DISPLAY_ORDER, dropping anything unknown. */
export function orderSignals(signals: readonly DuplicateSignal[]): DuplicateSignal[] {
  const present = new Set(signals);
  return SIGNAL_DISPLAY_ORDER.filter((signal) => present.has(signal));
}

// ── URL state parsing ───────────────────────────────────────────────────────
// Unrecognised values fall back to the neutral default rather than 404ing: a
// hand-edited or stale query string should still render the queue.

export function parseConfidence(value: string | undefined): DuplicateConfidence | "all" {
  return DUPLICATE_CONFIDENCES.includes(value as DuplicateConfidence) ? (value as DuplicateConfidence) : "all";
}

export function parseSignal(value: string | undefined): DuplicateSignal | "all" {
  return SIGNAL_DISPLAY_ORDER.includes(value as DuplicateSignal) ? (value as DuplicateSignal) : "all";
}

export function parseSort(value: string | undefined): DuplicateSort {
  return DUPLICATE_SORTS.includes(value as DuplicateSort) ? (value as DuplicateSort) : "confidence";
}

// ── Filtering ───────────────────────────────────────────────────────────────

export type DuplicateFilters = {
  search?: string;
  confidence?: DuplicateConfidence | "all";
  signal?: DuplicateSignal | "all";
};

/** A group matches a query when ANY of its records does — you are searching
 *  for a book, and the whole group is the unit of review. */
function groupMatchesSearch(group: DuplicateGroup, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  // An ISBN typed with hyphens must still match a record stored without them.
  const needleDigits = needle.replace(/[^0-9x]/g, "");

  return group.books.some((book) => {
    if (book.title.toLowerCase().includes(needle)) return true;
    if (book.slug.toLowerCase().includes(needle)) return true;
    if (book.author?.toLowerCase().includes(needle)) return true;
    if (book.isbn?.toLowerCase().includes(needle)) return true;
    if (needleDigits.length >= 4) {
      const isbn = normalizeIsbn(book.isbn);
      if (isbn && isbn.toLowerCase().includes(needleDigits)) return true;
    }
    return false;
  });
}

export function filterDuplicateGroups(
  groups: readonly DuplicateGroup[],
  filters: DuplicateFilters,
): DuplicateGroup[] {
  const { search = "", confidence = "all", signal = "all" } = filters;
  return groups.filter((group) => {
    if (confidence !== "all" && group.confidence !== confidence) return false;
    if (signal !== "all" && !group.signals.includes(signal)) return false;
    return groupMatchesSearch(group, search);
  });
}

// ── Sorting ─────────────────────────────────────────────────────────────────

/** Oldest record in the group — the detector already sorts each group's books
 *  oldest-first, so this is simply the head. */
function earliestCreatedAt(group: DuplicateGroup): string {
  return group.books[0]?.createdAt ?? "";
}

function titleOf(group: DuplicateGroup): string {
  return group.books[0]?.title ?? "";
}

/**
 * Reorders a filtered list. `confidence` is the default and is a NO-OP by
 * design: the detector already returns strongest-then-largest-then-title, and
 * re-deriving that ordering here would be a second, drifting copy of it.
 */
export function sortDuplicateGroups(groups: readonly DuplicateGroup[], sort: DuplicateSort): DuplicateGroup[] {
  const list = [...groups];
  switch (sort) {
    case "records":
      return list.sort(
        (a, b) =>
          b.books.length - a.books.length ||
          CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] ||
          titleOf(a).localeCompare(titleOf(b)),
      );
    case "oldest":
      return list.sort(
        (a, b) => earliestCreatedAt(a).localeCompare(earliestCreatedAt(b)) || titleOf(a).localeCompare(titleOf(b)),
      );
    case "title":
      return list.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
    case "confidence":
    default:
      return list;
  }
}

// ── Comparing the records inside a group ────────────────────────────────────

/**
 * The fields a reviewer compares by eye before deciding anything. Ordered
 * strongest-evidence-first, which is also how the UI reads them out.
 *
 * The content hash is deliberately NOT one of them, in either direction. Two
 * PDFs of one book differ in hash whenever either was re-scanned, re-compressed
 * or re-saved, so "different PDF file" is true of almost every pair and says
 * nothing about whether they are the same work — measured on production, not one
 * of 73 groups shared a hash, so the chip would have appeared on all 73 and
 * carried no information on any. The other direction is already covered: a
 * byte-identical pair is the `content-hash` SIGNAL, which the evidence strip
 * states as a match, and repeating it here would read as a second, independent
 * confirmation of a single fact.
 */
export const DUPLICATE_COMPARE_FIELDS = ["isbn", "pages", "fileSize", "year", "author"] as const;
export type DuplicateCompareField = (typeof DUPLICATE_COMPARE_FIELDS)[number];

/**
 * A three-way read-out of one group: which comparable fields AGREE across every
 * record, which provably DIFFER, and which could not be compared because some
 * record leaves them blank.
 *
 * Three buckets rather than two, for the reason that recurs all over this
 * codebase: "we could not look" is not "they match". A group where two of five
 * records have no page count must not report its page counts as agreeing, and
 * must not report them as differing either.
 *
 * This asserts NOTHING about whether the group is a duplicate, and deliberately
 * feeds no threshold. Measured on production 2026-09-22, the page-count spread
 * inside genuine duplicate groups and inside groups of distinct volumes filed
 * under one truncated title overlaps almost completely (p50 1.29 vs 1.45, p90
 * 3.38 vs 3.39) — so a rule that demoted confidence on "the documents differ"
 * would be tuned on noise, and would fire on 70 of 73 groups besides. What the
 * reviewer was missing is not a verdict, it is the ability to SEE the numbers
 * side by side; that is all this produces.
 */
export type DuplicateComparison = {
  agree: DuplicateCompareField[];
  differ: DuplicateCompareField[];
  unknown: DuplicateCompareField[];
};

type ComparableBook = {
  isbn: string | null;
  year: number | null;
  author: string | null;
  pages: number | null;
  fileSizeKb: number | null;
};

/** The comparison value for one field, or null when this record cannot answer. */
function fieldValue(book: ComparableBook, field: DuplicateCompareField): string | null {
  switch (field) {
    case "isbn":
      // Folded, so a hyphenated ISBN-13 and its bare ISBN-10 are one value.
      return normalizeIsbn(book.isbn);
    case "pages":
      return book.pages && book.pages > 0 ? String(book.pages) : null;
    case "fileSize":
      return book.fileSizeKb && book.fileSizeKb > 0 ? String(book.fileSizeKb) : null;
    case "year":
      return book.year && book.year > 0 ? String(book.year) : null;
    case "author":
      return book.author?.trim().toLowerCase() || null;
  }
}

export function compareDuplicateGroup(books: readonly ComparableBook[]): DuplicateComparison {
  const result: DuplicateComparison = { agree: [], differ: [], unknown: [] };
  if (books.length < 2) return result;

  for (const field of DUPLICATE_COMPARE_FIELDS) {
    const values = books.map((book) => fieldValue(book, field));
    if (values.some((value) => value === null)) {
      result.unknown.push(field);
      continue;
    }
    (new Set(values).size === 1 ? result.agree : result.differ).push(field);
  }
  return result;
}
