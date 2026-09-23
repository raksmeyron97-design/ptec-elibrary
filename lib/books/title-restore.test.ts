import { describe, expect, it } from "vitest";

import {
  comparable,
  looksTruncated,
  proposeRestoredTitle,
  REVIEW_THRESHOLD,
  summarize,
  TITLE_TRUNCATION_LENGTH,
  type TitleCandidate,
} from "@/lib/books/title-restore";

const from = (source: string, ...titles: string[]): TitleCandidate[] =>
  titles.map((title) => ({ title, source }));

describe("what counts as truncated", () => {
  it("is the exact cut length, in code points", () => {
    expect(looksTruncated("ក".repeat(TITLE_TRUNCATION_LENGTH))).toBe(true);
    expect(looksTruncated("ក".repeat(TITLE_TRUNCATION_LENGTH - 1))).toBe(false);
    expect(looksTruncated("𝐀".repeat(TITLE_TRUNCATION_LENGTH))).toBe(true);
    expect(looksTruncated(null)).toBe(false);
  });
});

describe("a verbatim continuation is the only thing applied", () => {
  it("proposes the one candidate that continues the title", () => {
    const cut = "Teaching Materials for the Prevention of Drug Harm in Prim";
    const full = `${cut}ary Schools, Grades 5 and 6`;
    const p = proposeRestoredTitle(cut, from("pmb-csv", full, "Something Else Entirely About Fish"));
    expect(p.confidence).toBe("exact");
    expect(p.proposed).toBe(full);
  });

  it("ignores zero-width characters when comparing, and keeps the source's own text", () => {
    // 43 of production's 191 cut titles carry zero-width spaces, and the export
    // puts them in different places, so a byte comparison finds nothing.
    const cut = "ឯកសារ​បង្រៀន​ការ​បង្ការ";
    const full = "ឯកសារបង្រៀនការបង្ការ ការទប់ស្កាត់គ្រោះថ្នាក់";
    const p = proposeRestoredTitle(cut, from("pmb-csv", full));
    expect(p.confidence).toBe("exact");
    // The restored title is the candidate exactly as stored — normalization is
    // for comparison only, never a rewrite of somebody's catalogue text.
    expect(p.proposed).toBe(full);
  });

  it("does not treat an equal or shorter candidate as a continuation", () => {
    const cut = "A Title That Was Cut Right Here";
    expect(proposeRestoredTitle(cut, from("pmb-csv", cut)).confidence).not.toBe("exact");
    expect(proposeRestoredTitle(cut, from("pmb-csv", "A Title That Was")).confidence).not.toBe("exact");
  });
});

describe("the truncation destroyed the evidence that would choose", () => {
  it("refuses when several candidates continue the same cut title", () => {
    // This is the whole reason the module exists. The collection is mostly
    // grade-numbered series, so the cut removes the grade — and every member
    // of the series is then an equally good "match".
    const cut = "សៀវភៅណែនាំគ្រូបង្រៀន គណិតវិទ្យា ថ្នាក់ទី";
    const p = proposeRestoredTitle(
      cut,
      from("pmb-csv", `${cut}៧`, `${cut}៨`, `${cut}៩`),
    );
    expect(p.confidence).toBe("ambiguous");
    expect(p.proposed).toBeNull();
    expect(p.reason).toContain("the truncation removed");
    // Every continuation is reported, so the refusal can be reviewed.
    expect(p.candidates.filter((c) => c.continues)).toHaveLength(3);
  });

  it("counts DISTINCT titles, so a candidate listed twice is not an ambiguity", () => {
    const cut = "Introduction to Educational Research Methods for Teacher";
    const full = `${cut}s in Cambodia`;
    const p = proposeRestoredTitle(cut, [
      { title: full, source: "pmb-csv:part1" },
      { title: full, source: "pmb-csv:part2" },
    ]);
    expect(p.confidence).toBe("ambiguous");
    expect(p.reason).toContain("1 different titles");
  });
});

describe("a close match that is a different record is never applied", () => {
  it.each([
    [
      // Both real, both from production 2026-09-23. The candidate inserts
      // ត្រៀម before ប្រឡង and ends on a DIFFERENT stream — applying it would
      // retitle a social-science paper as a mathematics one.
      "កម្រងវិញ្ញាសាប្រឡងសញ្ញាបត្រមធ្យមសិក្សាទុតិយភូមិ ថ្នាក់វិទ្យាសាស្រ",
      "កម្រងវិញ្ញាសាត្រៀមប្រឡងសញ្ញាបត្រ មធ្យមសិក្សាទុតិយភូមិ - គណិតវិទ្យា - ថ្នាក់វិទ្យាសាស្ត្រសង្គម",
    ],
    [
      // Differs in spelling before the cut (សម្រាប់ vs សំរាប់), so it is a
      // different edition or a different record, not this one continued.
      "សៀវភៅ​គាំទ្រ​ការពិសោធន៍​សម្រាប់​គ្រូ​មុខវិជ្ជា​វិទ្យាសាស្ត្រ​ថ្នា",
      "សៀវភៅគាំទ្រការពិសោធន៍ សំរាប់គ្រូមុខវិជ្ជាវិទ្យាសាស្ត្រថ្នាក់ទី៧-៩",
    ],
  ])("scores high and still refuses: %s", (cut, near) => {
    const p = proposeRestoredTitle(cut, from("pmb-csv", near));
    expect(p.confidence).toBe("review");
    expect(p.proposed).toBeNull();
    expect(p.candidates[0].score).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
    expect(p.candidates[0].continues).toBe(false);
  });

  it("says nothing at all below the noise floor", () => {
    // Median best score across the 191 production cut titles was 0.42 — two
    // Khmer education titles sharing vocabulary. Reporting that as a candidate
    // would bury the few real ones.
    const p = proposeRestoredTitle(
      "កម្មវិធីសិក្សាលម្អិត មុខវិជ្ជា បច្ចេកវិទ្យាព័ត៌មាន និងសារគមនាគមន៍",
      from("pmb-csv", "Contemporary Intellectual Assessment: Theories, Tests, and Issues"),
    );
    expect(p.confidence).toBe("none");
    expect(p.candidates).toEqual([]);
  });
});

describe("the summary", () => {
  it("counts each verdict once and nothing twice", () => {
    const cut = "A Cut Title Of Some Reasonable Length For This Test Case";
    const proposals = [
      proposeRestoredTitle(cut, from("s", `${cut} continued`)),
      proposeRestoredTitle(cut, from("s", `${cut} one`, `${cut} two`)),
      proposeRestoredTitle(cut, from("s", "Totally unrelated words here")),
    ];
    const s = summarize(proposals);
    expect(s).toEqual({ examined: 3, exact: 1, ambiguous: 1, review: 0, none: 1 });
  });
});

describe("comparable()", () => {
  it("collapses whitespace and strips zero-width, and nothing else", () => {
    expect(comparable("  a​ b \n c ")).toBe("a b c");
    // Case and Khmer marks are NOT folded: a title differing in case is a
    // different string a cataloguer wrote, and folding Khmer marks would shred
    // the script (the rule lib/books/duplicate-detection documents).
    expect(comparable("Title")).toBe("Title");
    expect(comparable("ការស្រាវជ្រាវ")).toBe("ការស្រាវជ្រាវ");
  });
});
