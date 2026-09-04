// Similarity is the only part of the detector that answers in degrees, so
// these tests pin the ORDER of its answers rather than exact numbers: a real
// pair must always outrank a plausible one, and both must outrank noise.
// Pinning exact scores would make every future tuning change a test rewrite.

import { describe, expect, it } from "vitest";
import {
  characterRatio,
  editDistance,
  fuzzyTokenRatio,
  isTitlePrefix,
  titleRemainders,
  titleSimilarity,
  tokenRatio,
} from "./similarity";

describe("editDistance", () => {
  it("counts single-character edits", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("abc", "abc")).toBe(0);
  });

  it("works on code points, not UTF-16 units", () => {
    // A Khmer cluster is several code points; splitting one mid-way would
    // compare fragments and report nonsense.
    expect(editDistance("គណិត", "គណិត")).toBe(0);
    expect(editDistance("ថ្នាក់ទី៧", "ថ្នាក់ទី៨")).toBe(1);
  });
});

describe("titleSimilarity", () => {
  it("reserves 100 for equality after normalization", () => {
    expect(titleSimilarity("Introduction to Psychology", "introduction  to  psychology")).toBe(100);
    expect(titleSimilarity("Teaching Practice", "Teaching Practise")).toBeLessThan(100);
  });

  it("scores a near-miss above an unrelated title", () => {
    const nearMiss = titleSimilarity("Classroom Management Basics", "Classrom Managment Basics");
    const unrelated = titleSimilarity("Classroom Management Basics", "Photosynthesis in Plants");
    expect(nearMiss).toBeGreaterThan(80);
    expect(unrelated).toBeLessThan(40);
    expect(nearMiss).toBeGreaterThan(unrelated);
  });

  it("is order-insensitive over words, which is how a retyped title looks", () => {
    expect(titleSimilarity("Teaching Practice", "Practice Teaching")).toBeGreaterThan(80);
  });

  it("handles Khmer, where there is one token and character distance is all there is", () => {
    const close = titleSimilarity("សៀវភៅគណិតវិទ្យា ថ្នាក់ទី៧", "សៀវភៅគណិតវិទ្យា ថ្នាក់ទី៨");
    const far = titleSimilarity("សៀវភៅគណិតវិទ្យា", "ការបង្រៀនភាសាអង់គ្លេស");
    expect(close).toBeGreaterThan(85);
    expect(far).toBeLessThan(40);
  });

  it("is zero when either side is empty", () => {
    expect(titleSimilarity("", "Mathematics")).toBe(0);
    expect(titleSimilarity(null, undefined)).toBe(0);
  });
});

describe("tokenRatio", () => {
  it("does not punish a long subtitle the way plain Jaccard does", () => {
    const withSubtitle = tokenRatio(
      "Research Methods",
      "Research Methods A Practical Guide for Undergraduates",
    );
    expect(withSubtitle).toBeGreaterThan(0.25); // plain Jaccard would be 2/8
  });

  it("is zero with no shared token", () => {
    expect(tokenRatio("Mathematics", "Biology")).toBe(0);
  });
});

describe("characterRatio", () => {
  it("is 1 for identical strings and 0 for two empties", () => {
    expect(characterRatio("abc", "abc")).toBe(1);
    expect(characterRatio("", "")).toBe(0);
  });
});

describe("isTitlePrefix", () => {
  it("matches on a word boundary only", () => {
    expect(isTitlePrefix("Research Methods", "Research Methods: A Practical Guide")).toBe(true);
    expect(isTitlePrefix("A Practical Guide", "A Practical Guidebook")).toBe(false);
  });

  it("is false for equal titles — the exact pass owns those", () => {
    expect(isTitlePrefix("Mathematics", "mathematics")).toBe(false);
  });
});

describe("fuzzyTokenRatio", () => {
  it("credits a misspelled word as very nearly a match", () => {
    // The job whole-string edit distance used to do, now done per word — so it
    // survives the boilerplate that used to drown it.
    expect(fuzzyTokenRatio("introduction to psycology", "introduction to psychology"))
      .toBeGreaterThan(0.9);
  });

  it("credits nothing for a genuinely different word", () => {
    const a = "biology grade seven";
    const b = "chemistry grade seven";
    expect(fuzzyTokenRatio(a, b)).toBe(tokenRatio(a, b));
  });

  it("spends each token once", () => {
    // Both left tokens are near-matches for the single right token. Crediting
    // both would push `shared` past the smaller title's token count, and the
    // containment term would report more than a perfect match.
    expect(fuzzyTokenRatio("psycology psychlogy", "psychology")).toBeLessThanOrEqual(1);
  });
});

describe("titleSimilarity with boilerplate", () => {
  const guide = (subject: string, grade: string) =>
    `សៀវភៅណែនាំគ្រូបង្រៀន ${subject} ថ្នាក់ទី${grade} (STEPSAM3)`;

  it("does not let a shared frame carry two different subjects", () => {
    expect(titleSimilarity(guide("ជីវវិទ្យា", "៧"), guide("គីមីវិទ្យា", "៧"))).toBeLessThan(75);
  });

  it("still rates a misspelling of a long title as near-identical", () => {
    expect(
      titleSimilarity(
        "Teachers Guide for Chemistry Grade Seven",
        "Teachers Guide for Chemestry Grade Seven",
      ),
    ).toBeGreaterThanOrEqual(88);
  });

  it("still uses character distance when a title has no spaces at all", () => {
    // The case the character measure exists for: one token against one token.
    expect(
      titleSimilarity("សៀវភៅគណិតវិទ្យាថ្នាក់ទី៧", "សៀវភៅគណិតវិទ្យាថ្នាក់ទី៨"),
    ).toBeGreaterThanOrEqual(88);
  });
});

describe("titleRemainders", () => {
  it("returns the part that differs, stripped of the shared frame", () => {
    expect(
      titleRemainders(
        "សៀវភៅណែនាំគ្រូបង្រៀន ជីវវិទ្យា ថ្នាក់ទី៧",
        "សៀវភៅណែនាំគ្រូបង្រៀន គីមីវិទ្យា ថ្នាក់ទី៧",
      ),
    ).toEqual({ left: "ជីវ", right: "គីមី" });
  });

  it("is null when one title merely contains the other", () => {
    expect(titleRemainders("Mathematics", "Mathematics for Teachers")).toBeNull();
  });

  it("is null for identical titles", () => {
    expect(titleRemainders("Mathematics", "mathematics")).toBeNull();
  });
});
