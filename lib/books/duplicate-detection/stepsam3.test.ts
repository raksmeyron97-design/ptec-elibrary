// Regression: the STEPSAM3 teacher's guides.
//
// WHAT WENT WRONG. A librarian imported 15 genuinely different books — five
// subjects across grades 7–9 — and 12 of them were refused as "Already in
// library — Same book as row N of this file". The titles share a frame:
//
//   សៀវភៅណែនាំគ្រូបង្រៀន {SUBJECT} ថ្នាក់ទី{GRADE} (STEPSAM3)
//
// 40-odd characters of boilerplate around a 3-character subject word. The
// normalizer was never the problem — it keeps Khmer letters, Khmer combining
// marks and Khmer digits, and the 15 titles normalize to 15 distinct strings.
// `titleSimilarity` was: it took `Math.max` of a token measure and whole-string
// edit distance, and edit distance reads a 3-character difference inside a
// 50-character title as 94% alike. The token measure had correctly said 66 and
// lost.
//
// This file pins the OUTCOME rather than the mechanism: these exact 15 titles,
// with the same author and the same year, must produce no verdict at all —
// against each other or against a catalogue holding some of them.

import { describe, expect, it } from "vitest";
import { assessBatch, type BatchRow } from "./batch";
import { normalizeTitle, titleTokens } from "./normalize";
import { titleSimilarity } from "./similarity";
import { assessDuplicates, scoreCandidate, type DuplicateCandidate } from "./signals";

/** The five subjects, exactly as they are catalogued. */
const SUBJECTS = [
  "ជីវវិទ្យា",      // Biology
  "គីមីវិទ្យា",      // Chemistry
  "ផែនដីវិទ្យា",    // Earth Science
  "គណិតវិទ្យា",     // Mathematics
  "រូបវិទ្យា",       // Physics
];

/** Khmer digits U+17E7–U+17E9 — NOT ASCII 7/8/9. */
const GRADES = ["៧", "៨", "៩"];

const TITLES: string[] = GRADES.flatMap((grade) =>
  SUBJECTS.map((subject) => `សៀវភៅណែនាំគ្រូបង្រៀន ${subject} ថ្នាក់ទី${grade} (STEPSAM3)`),
);

const AUTHOR = "ក្រសួងអប់រំ យុវជន និងកីឡា";
const YEAR = 2019;

const rows: BatchRow[] = TITLES.map((title, i) => ({
  id: String(i),
  title,
  author: AUTHOR,
  isbn: null,
  year: YEAR,
}));

const asCatalogue = (titles: readonly string[]): DuplicateCandidate[] =>
  titles.map((title, i) => ({
    id: `0000000${i}-1111-4111-8111-11111111111${i % 10}`,
    slug: `stepsam3-${i}`,
    title,
    author: AUTHOR,
    isbn: null,
    year: YEAR,
    publisher: null,
    contentHash: null,
    status: "published",
    isPublished: true,
  }));

describe("STEPSAM3 teacher's guides", () => {
  it("has 15 distinct titles", () => {
    expect(TITLES).toHaveLength(15);
    expect(new Set(TITLES).size).toBe(15);
  });

  /* ── The normalizer keeps what tells these books apart ───────────────── */

  it("keeps Khmer letters, so two subjects do not normalize alike", () => {
    const biology = normalizeTitle("សៀវភៅណែនាំគ្រូបង្រៀន ជីវវិទ្យា ថ្នាក់ទី៧ (STEPSAM3)");
    const chemistry = normalizeTitle("សៀវភៅណែនាំគ្រូបង្រៀន គីមីវិទ្យា ថ្នាក់ទី៧ (STEPSAM3)");

    expect(biology).toContain("ជីវវិទ្យា");
    expect(chemistry).toContain("គីមីវិទ្យា");
    expect(biology).not.toBe(chemistry);
    // Not reduced to the ASCII remnant, which is what a non-ASCII-stripping
    // normalizer would have produced for all fifteen.
    expect(biology).not.toBe("stepsam3");
  });

  it("keeps Khmer digits, so three grades stay three strings", () => {
    const perGrade = GRADES.map((g) =>
      normalizeTitle(`សៀវភៅណែនាំគ្រូបង្រៀន ជីវវិទ្យា ថ្នាក់ទី${g} (STEPSAM3)`),
    );
    expect(new Set(perGrade).size).toBe(3);
    for (const [i, normalized] of perGrade.entries()) {
      expect(normalized).toContain(GRADES[i]);
    }
  });

  it("keeps combining marks — coeng and vowel signs survive normalization", () => {
    // U+17D2 (coeng) and U+17B6 (vowel sign AA) are category Mn/Mc, not letters.
    expect(normalizeTitle("ថ្នាក់ទី៧")).toContain("្");
    expect(normalizeTitle("ជីវវិទ្យា")).toContain("ា");
    // A \p{M}-dropping normalizer would collapse these two to one skeleton.
    expect(normalizeTitle("ថ្នាក់")).not.toBe(normalizeTitle("ថនក"));
  });

  it("tokenizes on the spaces these titles do have", () => {
    expect(titleTokens(TITLES[0])).toEqual([
      "សៀវភៅណែនាំគ្រូបង្រៀន",
      "ជីវវិទ្យា",
      "ថ្នាក់ទី៧",
      "stepsam3",
    ]);
  });

  /* ── The scorer ──────────────────────────────────────────────────────── */

  it("does not call two subjects of one grade similar", () => {
    // The whole-string edit distance that used to decide this said 94.
    expect(
      titleSimilarity(
        "សៀវភៅណែនាំគ្រូបង្រៀន ជីវវិទ្យា ថ្នាក់ទី៧ (STEPSAM3)",
        "សៀវភៅណែនាំគ្រូបង្រៀន គីមីវិទ្យា ថ្នាក់ទី៧ (STEPSAM3)",
      ),
    ).toBeLessThan(75);
  });

  it("scores no pair of the fifteen as a match", () => {
    const catalogue = asCatalogue(TITLES);
    for (let i = 0; i < TITLES.length; i++) {
      for (let j = 0; j < TITLES.length; j++) {
        if (i === j) continue;
        const match = scoreCandidate(
          { title: TITLES[i], author: AUTHOR, isbn: null, year: YEAR },
          catalogue[j],
        );
        expect(match, `${TITLES[i]} matched ${TITLES[j]}`).toBeNull();
      }
    }
  });

  /* ── The importer's pre-flight, which is what the librarian met ──────── */

  it("flags nothing when the fifteen are imported together", () => {
    expect([...assessBatch(rows, []).values()]).toEqual([]);
  });

  it("flags only the re-imported rows when three are already catalogued", () => {
    // The state the librarian was actually in: rows 1-3 had uploaded before
    // the rest were refused, so a re-run should flag those three and NOTHING
    // else. Twelve of the fifteen is the bug; three of the fifteen is correct.
    const verdicts = assessBatch(rows, asCatalogue(TITLES.slice(0, 3)));
    expect([...verdicts.keys()].sort()).toEqual(["0", "1", "2"]);
    for (const verdict of verdicts.values()) {
      expect(verdict.source).toBe("catalog");
      expect(verdict.blocked).toBe(false);
    }
  });

  /* ── Still catches the duplicate this set could really contain ───────── */

  it("still flags the same guide entered twice", () => {
    const twice = [...rows, { ...rows[4], id: "15" }];
    const verdicts = assessBatch(twice, []);
    expect(verdicts.get("15")?.source).toBe("batch");
    expect(verdicts.get("15")?.matchRowId).toBe("4");
  });

  it("still flags a guide that is already in the library", () => {
    const assessment = assessDuplicates(
      { title: TITLES[7], author: AUTHOR, isbn: null, year: YEAR },
      asCatalogue([TITLES[7]]),
    );
    expect(assessment.top?.confidence).toBe("high");
  });

  it("still refuses a re-upload of the same FILE under a new subject name", () => {
    // The invariant the override must not weaken: a shared content hash is an
    // identifier, and identifiers still block whatever the titles say.
    const match = scoreCandidate(
      { title: TITLES[0], contentHash: "a".repeat(64) },
      { ...asCatalogue([TITLES[9]])[0], contentHash: "a".repeat(64) },
    );
    expect(match?.score).toBe(100);
    expect(match?.signals).toContain("content_hash");
  });
});
