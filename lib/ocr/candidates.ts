/* lib/ocr/candidates.ts
 *
 * Which published books could OCR actually help, and which would it only lie
 * about?
 *
 * ── Why this is a separate, pure module ─────────────────────────────────────
 *
 * OCR is the most expensive recovery path this library has — minutes of CPU
 * per book against seconds for pdf.js — and it is the only one that REPLACES
 * text rather than adding it. So the decision to spend it on a record has to
 * be inspectable offline, reproducible from the same inputs, and separable
 * from the process that benefits from answering "yes". `scripts/audit-scanned-
 * books.ts` fetches the rows; this file decides, and nothing here touches a
 * database.
 *
 * ── The four things that look identical in `book_pages` and are not ─────────
 *
 * A book with zero page rows can be any of:
 *
 *   1. a scan            — `no_text_layer`. The page image holds text a human
 *                          reads and the text stream holds none. THIS is what
 *                          OCR is for.
 *   2. never extracted   — nobody has run the indexer over it yet. Extraction
 *                          is free and local; OCR is neither. Run the cheap
 *                          thing first.
 *   3. storage said no   — `unfetchable`. We have not seen the document at all.
 *   4. our config said no— a `config` failure. It says nothing about the book
 *                          (lib/indexing/retry.ts, and the 203-book incident
 *                          that module documents).
 *
 * Only (1) is evidence. Filing (2)–(4) as OCR candidates would queue hundreds
 * of books whose real problem is a shell variable, and the run would then
 * write OCR text over documents that had perfectly good text waiting behind a
 * retry.
 *
 * ── Why the damage catalog is not simply "OCR all of it" ────────────────────
 *
 * `scripts/damaged-khmer-books.json` holds 86 books whose extracted Khmer is
 * broken, and most of them are broken in a way that costs nothing to fix:
 * `lib/text/khmer-reassemble.ts` reconnects coengs and vowels that were
 * emitted with spaces between them, deterministically, at zero API spend and
 * without inventing a code point. Sending those to OCR would spend minutes per
 * book to *maybe* reproduce text we can already recover exactly.
 *
 * Two damage reasons are out of that module's reach by construction, and they
 * are the ones this file selects on:
 *
 *   khmer-legacy-font    a code point was SUBSTITUTED for another. Reassembly
 *                        never replaces, so it cannot touch this.
 *   khmer-coeng-missing  a code point is ABSENT. Reassembly never inserts.
 *
 * Both mean the characters that spell the word are not in the file. The only
 * place they still exist is the rendered page — which is the definition of a
 * job for OCR.
 */

import type { TextDamageReason } from "@/lib/semantic/text-quality";
import type { IndexStatus } from "@/lib/indexing/state";
import type { FailureKind } from "@/lib/indexing/retry";

/** Why a book IS a candidate. Every one of these is evidence about the book. */
export const OCR_CANDIDATE_REASONS = [
  "no-text-layer",
  "extraction-failed-permanent",
  "low-text-yield",
  "khmer-legacy-font",
  "khmer-coeng-missing",
] as const;
export type OcrCandidateReason = (typeof OCR_CANDIDATE_REASONS)[number];

/** Why a book is NOT a candidate. Some of these are about us, not about it. */
export const OCR_BLOCKER_REASONS = [
  "no-pdf-file",
  "never-extracted",
  "storage-unresolved",
  "config-failure",
  "extraction-retry-pending",
  "repairable-by-reassembly",
  "healthy-text",
  "too-few-pages-to-judge",
] as const;
export type OcrBlockerReason = (typeof OCR_BLOCKER_REASONS)[number];

/**
 * Blockers that VETO — they hold even when a candidate signal also fired.
 *
 * Each one means the same thing: this process has not seen the document, so
 * nothing it observed is a statement about the document. The rest are merely
 * explanations for a "no", and a genuine signal outranks them.
 */
const VETO_BLOCKERS: ReadonlySet<OcrBlockerReason> = new Set<OcrBlockerReason>([
  "no-pdf-file",
  "never-extracted",
  "storage-unresolved",
  "config-failure",
  "extraction-retry-pending",
]);

/** Damage a whitespace repair cannot reach: a character is absent or wrong. */
export const UNREPAIRABLE_DAMAGE: ReadonlySet<TextDamageReason> = new Set<TextDamageReason>([
  "khmer-legacy-font",
  "khmer-coeng-missing",
]);

/**
 * Measured thresholds for the "extraction ran and produced almost nothing"
 * signal.
 *
 * A page under 30 characters carries no sentence — `MIN_PAGE_CHARS` in
 * lib/pdf-page-index.ts already drops anything under 20 as blank, so a page
 * that survived extraction and is still this short is a caption, a running
 * head or a page number recovered from a scan's stray text object.
 *
 * The RATIO is what decides, not the mean alone: a book of plates with ten
 * pages of preface has a low mean and is not recoverable text-first, while a
 * 400-page book with a short index is neither. And nothing is judged on one or
 * two pages — `minPagesToJudge` is why a book with a single 12-character row
 * is reported as unjudgeable rather than as a scan.
 */
export const CANDIDATE_CALIBRATION = {
  /** A page shorter than this carries no sentence. */
  lowTextPageChars: 30,
  /** Mean characters per page below this is a book with no usable text. */
  meanCharsFloor: 30,
  /** …but only when most of the book looks like that. */
  lowTextPageRatioFloor: 0.7,
  /** Fewer rows than this and the statistics are noise. */
  minPagesToJudge: 3,
} as const;

/**
 * What is known about one book's stored page text.
 *
 * `pages` and `lowTextPages` are always EXACT: both are countable without
 * moving a single character of content out of the database (a row scan of
 * `record_id`, and the same scan under a `LIKE` pattern of N underscores).
 *
 * The three character measures are `null` when the text was not fetched, and
 * that is a load-bearing distinction rather than a missing-data wart. Reading
 * the whole corpus to compute a mean would move tens of millions of characters
 * across the wire to answer a question about a few dozen books, so the auditor
 * fetches content only where the mean could change the verdict — and a mean
 * that was never measured must not be able to condemn a book by defaulting to
 * zero, which is exactly the shape of bug that "an unavailable count is not a
 * count of zero" exists to prevent elsewhere in this codebase.
 */
export type PageTextStats = {
  /** Rows in `book_pages` for this record. Exact. */
  pages: number;
  /** Rows carrying fewer than `lowTextPageChars` characters. Exact. */
  lowTextPages: number;
  /** `lowTextPages / pages`. Exact. */
  lowTextPageRatio: number;
  /** null when the page text was not fetched. */
  meanCharsPerPage: number | null;
  medianCharsPerPage: number | null;
  maxCharsPerPage: number | null;
};

/** Book-level statistics from the per-page character counts. */
export function summarizePageText(lengths: readonly number[]): PageTextStats {
  const pages = lengths.length;
  if (pages === 0) {
    return {
      pages: 0,
      lowTextPages: 0,
      lowTextPageRatio: 0,
      meanCharsPerPage: 0,
      medianCharsPerPage: 0,
      maxCharsPerPage: 0,
    };
  }

  const sorted = [...lengths].sort((a, b) => a - b);
  const total = sorted.reduce((sum, n) => sum + n, 0);
  const mid = Math.floor(pages / 2);
  const median = pages % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const lowTextPages = sorted.filter((n) => n < CANDIDATE_CALIBRATION.lowTextPageChars).length;

  return {
    pages,
    lowTextPages,
    lowTextPageRatio: lowTextPages / pages,
    meanCharsPerPage: total / pages,
    medianCharsPerPage: median,
    maxCharsPerPage: sorted[sorted.length - 1],
  };
}

/**
 * Statistics for a book whose page TEXT was never fetched — only counted.
 *
 * Used for the great majority of the collection, where the exact short-page
 * ratio already rules the low-text signal out and there is nothing to gain by
 * reading the prose.
 */
export function pageStatsFromCounts(pages: number, lowTextPages: number): PageTextStats {
  return {
    pages,
    lowTextPages,
    lowTextPageRatio: pages > 0 ? lowTextPages / pages : 0,
    meanCharsPerPage: null,
    medianCharsPerPage: null,
    maxCharsPerPage: null,
  };
}

export type CandidateInput = {
  /** Does a PDF URL exist on the record at all? */
  hasPdf: boolean;
  /** Per-page statistics from `book_pages`. */
  stats: PageTextStats;
  /** The most recent extraction outcome, or null when there has never been one. */
  indexState: { status: IndexStatus; failureKind: FailureKind | null } | null;
  /** Damage reasons recorded for this book, if it is in the catalog. */
  damageReasons?: readonly TextDamageReason[];
};

export type CandidateVerdict = {
  candidate: boolean;
  reasons: OcrCandidateReason[];
  blockers: OcrBlockerReason[];
};

/**
 * Decide whether OCR is worth spending on one book.
 *
 * Reasons and blockers are BOTH reported even when the answer is yes: an
 * operator reading the queue needs to know that a book selected for a legacy
 * font also happens to hold repairable spacing, because the cheaper tool may
 * be the right first move.
 */
export function assessOcrCandidate(input: CandidateInput): CandidateVerdict {
  const reasons: OcrCandidateReason[] = [];
  const blockers: OcrBlockerReason[] = [];
  const damage = new Set(input.damageReasons ?? []);
  const status = input.indexState?.status ?? null;
  const kind = input.indexState?.failureKind ?? null;

  if (!input.hasPdf) blockers.push("no-pdf-file");

  // Whose problem was the last attempt? `config` first, for the same reason
  // classifyFailure() checks it first: it is the verdict most likely to be
  // mistaken for a fact about the document.
  if (kind === "config") {
    blockers.push("config-failure");
  } else if (status === "unfetchable") {
    blockers.push("storage-unresolved");
  } else if (status === "failed" && kind !== "permanent") {
    // A transient failure is queued work. Extraction gets its retries before
    // OCR is asked to do the same job the expensive way.
    blockers.push("extraction-retry-pending");
  } else if (status === "running") {
    blockers.push("extraction-retry-pending");
  }

  if (input.stats.pages === 0) {
    if (status === null) {
      // Signal 1, the case that must NOT default to yes: nobody has tried the
      // cheap path. `never_attempted` is its own bucket in
      // public_resource_index_health for exactly this reason.
      blockers.push("never-extracted");
    } else if (status === "no_text_layer") {
      reasons.push("no-text-layer");
    } else if (status === "failed" && kind === "permanent") {
      // A PDF that parsed and refused to yield text on every page. The
      // document is the problem, and its pages are still images.
      reasons.push("extraction-failed-permanent");
    } else if (status === "indexed") {
      // `indexed` with no rows is a contradiction — the state table and the
      // page table disagree. Not a scan; a bookkeeping problem.
      blockers.push("never-extracted");
    }
  } else {
    // Damage the deterministic repair cannot reach is the strongest signal
    // here: the characters that spell the words are not in the file.
    for (const reason of UNREPAIRABLE_DAMAGE) {
      if (damage.has(reason)) reasons.push(reason as OcrCandidateReason);
    }

    if (input.stats.pages < CANDIDATE_CALIBRATION.minPagesToJudge) {
      blockers.push("too-few-pages-to-judge");
    } else if (
      // Both halves are required and the order is the cheap one first. The
      // ratio is exact for every book in the collection; the mean is fetched
      // only where the ratio has already admitted the possibility, and a mean
      // that was never measured (`null`) can never condemn a book.
      input.stats.lowTextPageRatio >= CANDIDATE_CALIBRATION.lowTextPageRatioFloor &&
      input.stats.meanCharsPerPage !== null &&
      input.stats.meanCharsPerPage < CANDIDATE_CALIBRATION.meanCharsFloor
    ) {
      reasons.push("low-text-yield");
    }

    if (damage.size > 0 && reasons.length === 0) {
      // Every reason it carries is one lib/text/khmer-reassemble.ts repairs
      // deterministically, at no API cost and without inventing a code point.
      blockers.push("repairable-by-reassembly");
    }
  }

  if (reasons.length === 0 && blockers.length === 0) blockers.push("healthy-text");

  const vetoed = blockers.some((b) => VETO_BLOCKERS.has(b));
  return { candidate: reasons.length > 0 && !vetoed, reasons, blockers };
}
