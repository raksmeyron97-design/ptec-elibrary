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
