// The scoring rules, which are the whole feature.
//
// Two properties are asserted over and over here because breaking either one
// is a data-integrity bug that no other test would catch:
//
//   1. ONLY an identifier reaches the blocking band. Title, author and year
//      describe a WORK; two editions of one textbook agree on all three. A
//      scoring change that lets attribute evidence block a save would start
//      refusing legitimate second editions.
//   2. NOTHING here merges anything. Every function returns a description of
//      evidence; a human acts on it.

import { describe, expect, it } from "vitest";
import {
  assessDuplicates,
  confidenceForScore,
  DUPLICATE_THRESHOLDS,
  isDistinguishingVariant,
  isSeriesVariant,
  scoreCandidate,
  type DuplicateCandidate,
  type DuplicateQuery,
} from "./signals";

const candidate = (partial: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "existing-book",
  title: "Introduction to Psychology",
  author: "John Smith",
  isbn: null,
  year: 2020,
  publisher: null,
  contentHash: null,
  status: "published",
  isPublished: true,
  ...partial,
});

const query = (partial: Partial<DuplicateQuery> = {}): DuplicateQuery => ({
  title: "Introduction to Psychology",
  author: "John Smith",
  year: 2020,
  ...partial,
});

describe("confidence bands", () => {
  it("maps scores to the documented bands", () => {
    expect(confidenceForScore(100)).toBe("exact");
    expect(confidenceForScore(DUPLICATE_THRESHOLDS.blocking)).toBe("exact");
    expect(confidenceForScore(DUPLICATE_THRESHOLDS.blocking - 1)).toBe("high");
    expect(confidenceForScore(DUPLICATE_THRESHOLDS.strong)).toBe("high");
    expect(confidenceForScore(DUPLICATE_THRESHOLDS.strong - 1)).toBe("medium");
    expect(confidenceForScore(DUPLICATE_THRESHOLDS.review)).toBe("medium");
    expect(confidenceForScore(DUPLICATE_THRESHOLDS.review - 1)).toBe("low");
  });
});

describe("identifier evidence — the only route to a block", () => {
  it("scores a shared content hash 100, whatever the metadata says", () => {
    const match = scoreCandidate(
      query({ title: "Something Else Entirely", contentHash: "a".repeat(64) }),
      candidate({ contentHash: "a".repeat(64) }),
    );
    expect(match?.score).toBe(100);
    expect(match?.confidence).toBe("exact");
    expect(match?.signals).toContain("content_hash");
    expect(match?.reasons).toContain("sameFile");
  });

  it("blocks on a shared ISBN even when the titles differ", () => {
    const match = scoreCandidate(
      query({ title: "A Completely Different Title", isbn: "978-0-306-40615-7" }),
      candidate({ title: "Introduction to Psychology", isbn: "0306406152" }),
    );
    expect(match?.confidence).toBe("exact");
    expect(match?.signals).toContain("isbn");
  });

  it("matches an ISBN-10 row against an ISBN-13 entry for the same book", () => {
    const match = scoreCandidate(
      query({ isbn: "0306406152" }),
      candidate({ isbn: "978-0-306-40615-7" }),
    );
    expect(match?.confidence).toBe("exact");
  });
});

describe("attribute evidence — never blocks", () => {
  it("caps title + author + year below the blocking band", () => {
    const match = scoreCandidate(query(), candidate());
    expect(match?.confidence).toBe("high");
    expect(match!.score).toBeLessThan(DUPLICATE_THRESHOLDS.blocking);
    expect(match?.signals).toContain("title_author_year");
  });

  it("ranks title+author+year above title+author above title alone", () => {
    const all = scoreCandidate(query(), candidate())!.score;
    const noYear = scoreCandidate(query({ year: null }), candidate({ year: null }))!.score;
    const titleOnly = scoreCandidate(
      query({ author: null, year: null }),
      candidate({ author: null, year: null }),
    )!.score;
    expect(all).toBeGreaterThan(noYear);
    expect(noYear).toBeGreaterThan(titleOnly);
    expect(titleOnly).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLDS.review);
  });

  it("distinguishes a retyped title from an identical one", () => {
    const identical = scoreCandidate(query(), candidate())!;
    const retyped = scoreCandidate(
      query({ title: "Introduction to Psycology" }),
      candidate(),
    )!;
    expect(identical.signals).toContain("exact_title");
    expect(retyped.signals).toContain("fuzzy_title");
    expect(identical.score).toBeGreaterThan(retyped.score);
  });

  it("finds the truncated-title duplicate that no other signal sees", () => {
    const match = scoreCandidate(
      query({ title: "Introduction to Research Methods: A Practical Guide", year: null }),
      candidate({
        title: "Introduction to Research Methods: A Practical Guide for Undergraduates",
        year: null,
      }),
    );
    expect(match?.signals).toContain("title_prefix");
    expect(match?.reasons).toContain("titleContained");
    expect(match?.confidence).not.toBe("exact");
  });

  it("returns null rather than a zero-scored match for unrelated books", () => {
    expect(scoreCandidate(query({ title: "Photosynthesis in Plants" }), candidate())).toBeNull();
  });

  it("ignores a placeholder author instead of treating it as agreement", () => {
    const withUnknown = scoreCandidate(
      query({ author: "Unknown", year: null }),
      candidate({ author: "Unknown", year: null }),
    )!;
    const withReal = scoreCandidate(
      query({ year: null }),
      candidate({ year: null }),
    )!;
    expect(withUnknown.signals).not.toContain("title_author");
    expect(withReal.score).toBeGreaterThan(withUnknown.score);
  });
});

describe("edition awareness", () => {
  it("demotes a same-title pair whose ISBNs are different", () => {
    const sameIsbnAbsent = scoreCandidate(query(), candidate())!;
    const differentIsbn = scoreCandidate(
      query({ isbn: "978-0-306-40615-7" }),
      candidate({ isbn: "978-0-7879-7962-2" }),
    )!;
    expect(differentIsbn.reasons).toContain("differentIsbn");
    expect(differentIsbn.score).toBeLessThan(DUPLICATE_THRESHOLDS.strong);
    expect(differentIsbn.score).toBeLessThan(sameIsbnAbsent.score);
  });

  it("demotes a pair whose titles declare different editions", () => {
    const match = scoreCandidate(
      query({ title: "Mathematics, 2nd Edition" }),
      candidate({ title: "Mathematics" }),
    );
    expect(match?.reasons).toContain("differentEdition");
    expect(match!.score).toBeLessThan(DUPLICATE_THRESHOLDS.strong);
  });

  it("does not treat a 3rd edition as the same book as a 2nd", () => {
    const match = scoreCandidate(
      query({ title: "Mathematics, 3rd Edition" }),
      candidate({ title: "Mathematics, 2nd Edition" }),
    );
    expect(match?.reasons ?? []).toContain("differentEdition");
    expect(match?.confidence).not.toBe("exact");
  });

  it("subtracts for a year gap without capping on it", () => {
    const sameYear = scoreCandidate(query(), candidate())!.score;
    const oneYear = scoreCandidate(query({ year: 2021 }), candidate({ year: 2020 }))!.score;
    const fiveYears = scoreCandidate(query({ year: 2025 }), candidate({ year: 2020 }))!.score;
    expect(sameYear).toBeGreaterThan(oneYear);
    expect(oneYear).toBeGreaterThan(fiveYears);
  });
});

describe("series awareness", () => {
  it("does not flag consecutive volumes of one series", () => {
    expect(
      scoreCandidate(
        query({ title: "សៀវភៅគណិតវិទ្យា ថ្នាក់ទី៧", author: "ស ដារ៉ា" }),
        candidate({ title: "សៀវភៅគណិតវិទ្យា ថ្នាក់ទី៨", author: "ស ដារ៉ា" }),
      ),
    ).toBeNull();
    expect(
      scoreCandidate(
        query({ title: "Mathematics Grade 7" }),
        candidate({ title: "Mathematics Grade 8" }),
      ),
    ).toBeNull();
  });

  it("still flags the same volume entered twice", () => {
    const match = scoreCandidate(
      query({ title: "Mathematics Grade 7" }),
      candidate({ title: "mathematics grade 7" }),
    );
    expect(match?.confidence).toBe("high");
  });

  it("never lets a series difference beat a shared file", () => {
    const match = scoreCandidate(
      query({ title: "Maths Grade 7", contentHash: "b".repeat(64) }),
      candidate({ title: "Maths Grade 8", contentHash: "b".repeat(64) }),
    );
    expect(match?.score).toBe(100);
  });

  it("recognises the shape directly", () => {
    expect(isSeriesVariant("Volume 1 of Reading", "Volume 2 of Reading")).toBe(true);
    expect(isSeriesVariant("Mathematics", "Biology")).toBe(false);
    expect(isSeriesVariant("Mathematics", "Mathematics")).toBe(false);
  });
});

describe("assessDuplicates", () => {
  const other = candidate({
    id: "22222222-2222-4222-8222-222222222222",
    slug: "other",
    title: "Introduction to Psychology",
    author: null,
    year: null,
  });

  it("ranks strongest first and reports the blocking verdict", () => {
    const assessment = assessDuplicates(query({ isbn: "978-0-306-40615-7" }), [
      other,
      candidate({ isbn: "9780306406157" }),
    ]);
    expect(assessment.matches).toHaveLength(2);
    expect(assessment.top?.confidence).toBe("exact");
    expect(assessment.blocked).toBe(true);
    expect(assessment.matches[0].score).toBeGreaterThanOrEqual(assessment.matches[1].score);
  });

  it("is not blocked when the strongest match is attribute evidence", () => {
    const assessment = assessDuplicates(query(), [candidate()]);
    expect(assessment.blocked).toBe(false);
    expect(assessment.top?.confidence).toBe("high");
  });

  it("never matches the record being edited against itself", () => {
    const assessment = assessDuplicates(
      query({ excludeBookId: "11111111-1111-4111-8111-111111111111" }),
      [candidate()],
    );
    expect(assessment.matches).toHaveLength(0);
    expect(assessment.top).toBeNull();
  });

  it("de-duplicates candidates arriving from more than one query branch", () => {
    const assessment = assessDuplicates(query(), [candidate(), candidate(), candidate()]);
    expect(assessment.matches).toHaveLength(1);
    expect(assessment.examined).toBe(1);
  });

  it("carries the truncation flag so a capped sweep is visible", () => {
    expect(assessDuplicates(query(), [candidate()], { truncated: true }).truncated).toBe(true);
  });
});

describe("isDistinguishingVariant", () => {
  it("separates two titles that agree only on boilerplate", () => {
    expect(
      isDistinguishingVariant(
        "សៀវភៅណែនាំគ្រូបង្រៀន ជីវវិទ្យា ថ្នាក់ទី៧",
        "សៀវភៅណែនាំគ្រូបង្រៀន គីមីវិទ្យា ថ្នាក់ទី៧",
      ),
    ).toBe(true);
  });

  it("leaves a misspelling alone — that is one book entered twice", () => {
    expect(isDistinguishingVariant("Chemistry for Teachers", "Chemestry for Teachers")).toBe(false);
  });

  it("leaves a dropped word alone — isTitlePrefix owns truncation", () => {
    expect(isDistinguishingVariant("Mathematics", "Mathematics for Teachers")).toBe(false);
  });

  it("leaves a two-character difference alone", () => {
    // "to"/"of" is a function word, not a different subject.
    expect(isDistinguishingVariant("Introduction to Psychology", "Introduction of Psychology"))
      .toBe(false);
  });
});
