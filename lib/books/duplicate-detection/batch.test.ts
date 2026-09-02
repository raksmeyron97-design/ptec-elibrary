// Bulk import assessment.
//
// The behaviour that only exists here is row-against-row: two lines of one CSV
// can be the same book, and no check against the catalogue can find that
// because neither row exists yet. The rest is a delegation test — the batch
// path must reach the SAME verdict as the single-upload gate, or the importer
// becomes a way to walk duplicates past a check that would have caught them.

import { describe, expect, it } from "vitest";
import { assessBatch, summarizeBatch, type BatchRow } from "./batch";
import type { DuplicateCandidate } from "./signals";

const inLibrary: DuplicateCandidate[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "classroom-management-basics",
    title: "Classroom Management Basics",
    author: "Chan Sophea",
    isbn: "978-0-306-40615-7",
    year: 2022,
    publisher: null,
    contentHash: null,
    status: "published",
    isPublished: true,
  },
];

const row = (partial: Partial<BatchRow> & { id: string }): BatchRow => ({
  title: "Something New",
  author: null,
  isbn: null,
  year: null,
  ...partial,
});

describe("assessBatch", () => {
  it("leaves a genuinely new row unflagged", () => {
    const verdicts = assessBatch([row({ id: "0", title: "Photosynthesis in Plants" })], inLibrary);
    expect(verdicts.size).toBe(0);
  });

  it("blocks a row whose ISBN is already registered, whatever its title says", () => {
    const verdicts = assessBatch(
      [row({ id: "0", title: "A Totally Different Title", isbn: "0306406152" })],
      inLibrary,
    );
    const verdict = verdicts.get("0")!;
    expect(verdict.blocked).toBe(true);
    expect(verdict.source).toBe("catalog");
    expect(verdict.match.signals).toContain("isbn");
  });

  it("flags a row that matches the library on title and author", () => {
    const verdicts = assessBatch(
      [row({ id: "0", title: "classroom management basics", author: "Chan Sophea", year: 2022 })],
      inLibrary,
    );
    expect(verdicts.get("0")?.match.confidence).toBe("high");
    expect(verdicts.get("0")?.blocked).toBe(false);
  });

  it("finds a duplicate that exists only inside the file", () => {
    const verdicts = assessBatch(
      [
        row({ id: "0", title: "Teaching Reading in Grade 1", author: "Sok Dara", year: 2021 }),
        row({ id: "1", title: "teaching reading in grade 1", author: "Sok Dara", year: 2021 }),
      ],
      [],
    );
    // Exactly one of the pair is flagged — the other stays importable, or the
    // operator would be told to drop both copies of a book they have none of.
    expect(verdicts.has("0")).toBe(false);
    const verdict = verdicts.get("1")!;
    expect(verdict.source).toBe("batch");
    expect(verdict.matchRowId).toBe("0");
  });

  it("reports the library rather than the file when a row collides with both", () => {
    const verdicts = assessBatch(
      [
        row({ id: "0", title: "Classroom Management Basics", author: "Chan Sophea", year: 2022 }),
        row({
          id: "1",
          title: "Classroom Management Basics",
          author: "Chan Sophea",
          year: 2022,
          isbn: "978-0-306-40615-7",
        }),
      ],
      inLibrary,
    );
    expect(verdicts.get("1")?.source).toBe("catalog");
  });

  it("applies edition awareness, so a 2nd edition is not reported as a re-import", () => {
    const verdicts = assessBatch(
      [
        row({
          id: "0",
          title: "Classroom Management Basics, 2nd Edition",
          author: "Chan Sophea",
          year: 2022,
        }),
      ],
      inLibrary,
    );
    // Surfaced for a human, but never as a confident duplicate.
    expect(verdicts.get("0")?.match.confidence).not.toBe("exact");
    expect(verdicts.get("0")?.match.confidence).not.toBe("high");
    expect(verdicts.get("0")?.match.reasons).toContain("differentEdition");
  });

  it("does not flag consecutive volumes of a textbook series", () => {
    const verdicts = assessBatch(
      [
        row({ id: "0", title: "សៀវភៅគណិតវិទ្យា ថ្នាក់ទី៧", author: "ស ដារ៉ា" }),
        row({ id: "1", title: "សៀវភៅគណិតវិទ្យា ថ្នាក់ទី៨", author: "ស ដារ៉ា" }),
        row({ id: "2", title: "សៀវភៅគណិតវិទ្យា ថ្នាក់ទី៩", author: "ស ដារ៉ា" }),
      ],
      [],
    );
    expect(verdicts.size).toBe(0);
  });

  it("scores each row against its predecessors only, never itself", () => {
    const verdicts = assessBatch([row({ id: "0", title: "Classroom Management Basics" })], []);
    expect(verdicts.size).toBe(0);
  });
});

describe("summarizeBatch", () => {
  it("counts each outcome once and reports the remainder as clean", () => {
    const rows: BatchRow[] = [
      row({ id: "0", title: "Classroom Management Basics", author: "Chan Sophea", year: 2022 }),
      row({ id: "1", title: "Photosynthesis in Plants" }),
      row({ id: "2", title: "Anything", isbn: "9780306406157" }),
      row({ id: "3", title: "Classroom Management Basics" }),
    ];
    const summary = summarizeBatch(rows.length, assessBatch(rows, inLibrary));
    expect(summary.blocked).toBe(1);
    expect(summary.strong).toBe(1);
    expect(summary.possible).toBe(1);
    expect(summary.clean).toBe(1);
    expect(summary.blocked + summary.strong + summary.possible + summary.clean).toBe(rows.length);
  });
});
