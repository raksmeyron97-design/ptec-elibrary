import { describe, it, expect } from "vitest";
import {
  assessOcrCandidate,
  pageStatsFromCounts,
  summarizePageText,
  CANDIDATE_CALIBRATION,
  type CandidateInput,
} from "./candidates";

/**
 * The selection rule is the expensive decision in this pipeline: OCR costs
 * minutes of CPU per book and REPLACES text rather than adding it. Every test
 * below is about the same thing — that a book is queued on evidence about the
 * BOOK, and never on evidence about the machine that looked at it.
 */

const healthyBook = (): CandidateInput => ({
  hasPdf: true,
  stats: summarizePageText(Array.from({ length: 120 }, () => 2400)),
  indexState: { status: "indexed", failureKind: null },
});

/** A scan: extraction ran, parsed the document, and found no text anywhere. */
const scannedBook = (): CandidateInput => ({
  hasPdf: true,
  stats: summarizePageText([]),
  indexState: { status: "no_text_layer", failureKind: "permanent" },
});

describe("summarizePageText", () => {
  it("reports exact statistics over the page lengths it was given", () => {
    const stats = summarizePageText([10, 20, 3000, 4000, 5]);
    expect(stats.pages).toBe(5);
    expect(stats.lowTextPages).toBe(3); // 10, 20, 5
    expect(stats.lowTextPageRatio).toBeCloseTo(0.6);
    expect(stats.medianCharsPerPage).toBe(20);
    expect(stats.maxCharsPerPage).toBe(4000);
    expect(stats.meanCharsPerPage).toBeCloseTo((10 + 20 + 3000 + 4000 + 5) / 5);
  });

  it("answers zero for a book with no pages rather than dividing by it", () => {
    const stats = summarizePageText([]);
    expect(stats.pages).toBe(0);
    expect(stats.lowTextPageRatio).toBe(0);
    expect(stats.meanCharsPerPage).toBe(0);
  });
});

describe("pageStatsFromCounts", () => {
  /**
   * The distinction the whole two-stage audit rests on: page text that was
   * never fetched is `null`, not 0. A mean of 0 is "this book has no text" and
   * would condemn every book in the collection the auditor chose not to read.
   */
  it("reports unmeasured character statistics as null, never as zero", () => {
    const stats = pageStatsFromCounts(200, 4);
    expect(stats.pages).toBe(200);
    expect(stats.lowTextPages).toBe(4);
    expect(stats.lowTextPageRatio).toBeCloseTo(0.02);
    expect(stats.meanCharsPerPage).toBeNull();
    expect(stats.medianCharsPerPage).toBeNull();
    expect(stats.maxCharsPerPage).toBeNull();
  });

  it("cannot make a book a candidate on an unmeasured mean", () => {
    // Every page short — the ratio alone admits the signal — but the text was
    // never read, so the mean cannot complete the AND.
    const verdict = assessOcrCandidate({
      hasPdf: true,
      stats: pageStatsFromCounts(100, 100),
      indexState: { status: "indexed", failureKind: null },
    });
    expect(verdict.candidate).toBe(false);
    expect(verdict.reasons).not.toContain("low-text-yield");
  });
});

describe("zero page rows are four different situations", () => {
  it("queues a scan", () => {
    const verdict = assessOcrCandidate(scannedBook());
    expect(verdict.candidate).toBe(true);
    expect(verdict.reasons).toEqual(["no-text-layer"]);
  });

  it("does NOT queue a book nobody has tried to extract yet", () => {
    const verdict = assessOcrCandidate({ ...scannedBook(), indexState: null });
    expect(verdict.candidate).toBe(false);
    expect(verdict.blockers).toContain("never-extracted");
  });

  it("does NOT queue a storage outage", () => {
    const verdict = assessOcrCandidate({
      ...scannedBook(),
      indexState: { status: "unfetchable", failureKind: "transient" },
    });
    expect(verdict.candidate).toBe(false);
    expect(verdict.blockers).toContain("storage-unresolved");
  });

  /**
   * The 203-book incident, in one assertion. A `config` failure is a statement
   * about the operator's shell — it must never become a statement about the
   * library, in this direction any more than in `writeIndexState`'s.
   */
  it("does NOT queue a book whose last failure was OUR configuration", () => {
    const verdict = assessOcrCandidate({
      ...scannedBook(),
      indexState: { status: "unfetchable", failureKind: "config" },
    });
    expect(verdict.candidate).toBe(false);
    expect(verdict.blockers).toContain("config-failure");
  });

  it("queues a permanent extraction failure but not a transient one", () => {
    const permanent = assessOcrCandidate({
      ...scannedBook(),
      indexState: { status: "failed", failureKind: "permanent" },
    });
    expect(permanent.candidate).toBe(true);
    expect(permanent.reasons).toContain("extraction-failed-permanent");

    const transient = assessOcrCandidate({
      ...scannedBook(),
      indexState: { status: "failed", failureKind: "transient" },
    });
    expect(transient.candidate).toBe(false);
    expect(transient.blockers).toContain("extraction-retry-pending");
  });

  it("does not queue a record with no PDF at all", () => {
    const verdict = assessOcrCandidate({ ...scannedBook(), hasPdf: false });
    expect(verdict.candidate).toBe(false);
    expect(verdict.blockers).toContain("no-pdf-file");
  });
});

describe("books that already hold text", () => {
  it("leaves a healthy book alone", () => {
    const verdict = assessOcrCandidate(healthyBook());
    expect(verdict.candidate).toBe(false);
    expect(verdict.blockers).toContain("healthy-text");
  });

  it("queues a book whose extracted pages are nearly all empty", () => {
    const verdict = assessOcrCandidate({
      ...healthyBook(),
      stats: summarizePageText(Array.from({ length: 80 }, () => 11)),
    });
    expect(verdict.candidate).toBe(true);
    expect(verdict.reasons).toContain("low-text-yield");
  });

  it("does not judge a book on one or two rows", () => {
    const verdict = assessOcrCandidate({ ...healthyBook(), stats: summarizePageText([8, 12]) });
    expect(verdict.candidate).toBe(false);
    expect(verdict.blockers).toContain("too-few-pages-to-judge");
  });

  it("does not queue a book with a short index but real prose", () => {
    // 100 pages of prose plus 20 short ones: ratio 0.17, well under the floor.
    const lengths = [...Array.from({ length: 100 }, () => 2200), ...Array.from({ length: 20 }, () => 12)];
    const verdict = assessOcrCandidate({ ...healthyBook(), stats: summarizePageText(lengths) });
    expect(verdict.candidate).toBe(false);
  });
});

describe("the damage catalog selects on what reassembly cannot repair", () => {
  /**
   * `lib/text/khmer-reassemble.ts` reconnects code points that are all present
   * and merely spaced apart, deterministically and for free. Sending those
   * books to OCR would spend minutes per book to maybe reproduce text we can
   * already recover exactly — so only the two reasons that mean a character is
   * ABSENT or WRONG select for OCR.
   */
  it("queues a legacy-font book", () => {
    const verdict = assessOcrCandidate({ ...healthyBook(), damageReasons: ["khmer-legacy-font"] });
    expect(verdict.candidate).toBe(true);
    expect(verdict.reasons).toContain("khmer-legacy-font");
  });

  it("queues a book whose coengs were dropped by the extractor", () => {
    const verdict = assessOcrCandidate({ ...healthyBook(), damageReasons: ["khmer-coeng-missing"] });
    expect(verdict.candidate).toBe(true);
    expect(verdict.reasons).toContain("khmer-coeng-missing");
  });

  it("does NOT queue damage the deterministic repair already fixes", () => {
    for (const reason of ["khmer-coeng-detached", "khmer-vowels-orphaned", "khmer-glyph-spacing"] as const) {
      const verdict = assessOcrCandidate({ ...healthyBook(), damageReasons: [reason] });
      expect(verdict.candidate, reason).toBe(false);
      expect(verdict.blockers, reason).toContain("repairable-by-reassembly");
    }
  });

  it("still queues a legacy-font book that also carries repairable spacing", () => {
    const verdict = assessOcrCandidate({
      ...healthyBook(),
      damageReasons: ["khmer-coeng-detached", "khmer-legacy-font"],
    });
    expect(verdict.candidate).toBe(true);
    expect(verdict.reasons).toContain("khmer-legacy-font");
    expect(verdict.blockers).not.toContain("repairable-by-reassembly");
  });

  /**
   * A veto outranks a signal, and this is the asymmetry that matters: a signal
   * says something about the book, a veto says we never saw the book.
   */
  it("a storage failure vetoes even a legacy-font book", () => {
    const verdict = assessOcrCandidate({
      ...healthyBook(),
      damageReasons: ["khmer-legacy-font"],
      indexState: { status: "unfetchable", failureKind: "transient" },
    });
    expect(verdict.candidate).toBe(false);
    expect(verdict.reasons).toContain("khmer-legacy-font");
    expect(verdict.blockers).toContain("storage-unresolved");
  });
});

describe("calibration", () => {
  it("keeps the low-text floor above the extractor's own blank-page floor", () => {
    // lib/pdf-page-index.ts already drops anything under 20 characters as
    // blank. A floor at or below that would only ever select rows that cannot
    // exist.
    expect(CANDIDATE_CALIBRATION.lowTextPageChars).toBeGreaterThan(20);
  });
});
