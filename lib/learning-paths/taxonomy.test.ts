import { describe, expect, it } from "vitest";
import { deriveGradeBand, deriveScope, deriveTrack, scopeLabelKeys } from "./taxonomy";

// The nine paths as published on 2026-09-12 — slug, subject and title exactly
// as the rows carry them. If a new path does not classify, add it HERE with
// the scope a librarian would expect, then fix the rule.
const LIVE = [
  { slug: "early-grade-mathematics-grade-1-curriculum-manipulatives", title: "Early Grade Mathematics: Grade 1 Curriculum & Manipulatives", title_km: "កញ្ចប់គណិតវិទ្យាថ្នាក់ដំបូង ថ្នាក់ទី១៖ វិធីសាស្ត្របង្រៀន និងកម្រងលំហាត់", subject: "គណិតវិទ្យា", tags: ["គណិតវិទ្យា", "ថ្នាក់ទី១"], track: "math", grade: "g1" },
  { slug: "early-grade-learning-package", title: "Early Grade Learning: MoEYS Reading & Mathematics Curriculum (Grades 1–3)", title_km: "កញ្ចប់សិក្សាថ្នាក់ដំបូង៖ អំណាន និងគណិតវិទ្យា (ថ្នាក់ទី១ ដល់ទី៣)", subject: "អំណាន និងគណិតវិទ្យា", tags: ["ថ្នាក់ទី១", "ថ្នាក់ទី២", "ថ្នាក់ទី៣"], track: "both", grade: "g1_3" },
  { slug: "early-grade-math", title: "Early Grade Mathematics: Complete Primary Curriculum (Grades 1–3)", title_km: "កញ្ចប់គណិតវិទ្យាថ្នាក់ដំបូង (ថ្នាក់ទី១ ទី២ និងទី៣)", subject: "គណិតវិទ្យា", tags: ["ថ្នាក់ទី១", "ថ្នាក់ទី២", "ថ្នាក់ទី៣"], track: "math", grade: "g1_3" },
  { slug: "early-grade-math-grade-2", title: "Early Grade Mathematics: Grade 2 Curriculum & Manipulatives", title_km: "កញ្ចប់គណិតវិទ្យាថ្នាក់ដំបូង ថ្នាក់ទី២៖ វិធីសាស្ត្របង្រៀន និងកម្រងលំហាត់", subject: "គណិតវិទ្យា", tags: ["ថ្នាក់ទី២"], track: "math", grade: "g2" },
  { slug: "early-grade-math-grade-3", title: "Early Grade Mathematics: Grade 3 Curriculum & Advanced Foundations", title_km: "កញ្ចប់គណិតវិទ្យាថ្នាក់ដំបូង ថ្នាក់ទី៣៖ វិធីសាស្ត្របង្រៀន និងកម្រងលំហាត់", subject: "គណិតវិទ្យា", tags: ["ថ្នាក់ទី៣"], track: "math", grade: "g3" },
  { slug: "early-grade-reading", title: "Early Grade Reading: Complete Khmer Literacy Curriculum (Grades 1–3)", title_km: "កញ្ចប់អំណានថ្នាក់ដំបូង ភាសាខ្មែរ (ថ្នាក់ទី១ ទី២ និងទី៣)", subject: "ភាសាខ្មែរ", tags: ["ថ្នាក់ទី១", "ថ្នាក់ទី២", "ថ្នាក់ទី៣"], track: "reading", grade: "g1_3" },
  { slug: "early-grade-reading-grade-1", title: "Early Grade Reading: Grade 1 Literacy & Phonics Curriculum", title_km: "កញ្ចប់អំណានថ្នាក់ដំបូង ថ្នាក់ទី១៖ វិធីសាស្ត្របង្រៀន និងកម្រងអំណាន", subject: "ភាសាខ្មែរ", tags: ["ថ្នាក់ទី១"], track: "reading", grade: "g1" },
  { slug: "early-grade-reading-grade-2", title: "Early Grade Reading: Grade 2 Reading Fluency & Writing Curriculum", title_km: "កញ្ចប់អំណានថ្នាក់ដំបូង ថ្នាក់ទី២៖ វិធីសាស្ត្របង្រៀន និងកម្រងអំណាន", subject: "ភាសាខ្មែរ", tags: ["ថ្នាក់ទី២"], track: "reading", grade: "g2" },
  { slug: "early-grade-reading-grade-3", title: "Early Grade Reading: Grade 3 Comprehension, Grammar & Homework Curriculum", title_km: "កញ្ចប់អំណានថ្នាក់ដំបូង ថ្នាក់ទី៣៖ វិធីសាស្ត្របង្រៀន និងកម្រងអំណាន", subject: "ភាសាខ្មែរ", tags: ["ថ្នាក់ទី៣"], track: "reading", grade: "g3" },
] as const;

describe("deriveScope on the live collection", () => {
  for (const p of LIVE) {
    it(`${p.slug} → ${p.grade} · ${p.track}`, () => {
      expect(deriveScope(p)).toEqual({ track: p.track, grade: p.grade });
    });
  }

  it("produces the Track × Grade grid the review described (2 tracks × 4 scopes + 1 package)", () => {
    const cells = new Set(LIVE.map((p) => `${deriveTrack(p)}|${deriveGradeBand(p)}`));
    expect(cells.size).toBe(9);
    expect([...cells].filter((c) => c.startsWith("math|"))).toHaveLength(4);
    expect([...cells].filter((c) => c.startsWith("reading|"))).toHaveLength(4);
    expect([...cells].filter((c) => c.startsWith("both|"))).toEqual(["both|g1_3"]);
  });
});

describe("conservative defaults", () => {
  it("an unrecognised subject and title carries no track", () => {
    expect(deriveTrack({ slug: "classroom-action-research", title: "Classroom Action Research", subject: "ស្រាវជ្រាវ" })).toBeNull();
  });

  it("subject wins over a title that mentions the other track", () => {
    expect(deriveTrack({ slug: "x", title: "Reading the maths curriculum", subject: "គណិតវិទ្យា" })).toBe("math");
  });

  it("a range is never read as its first grade", () => {
    expect(deriveGradeBand({ slug: "x", title: "Grades 1–3 overview" })).toBe("g1_3");
    expect(deriveGradeBand({ slug: "x", title: "Grades 1 to 3" })).toBe("g1_3");
    expect(deriveGradeBand({ slug: "x", title: "y", title_km: "ថ្នាក់ទី១-៣" })).toBe("g1_3");
  });

  it("Grade 12 is not Grade 1", () => {
    expect(deriveGradeBand({ slug: "grade-12-physics", title: "Grade 12 Physics" })).toBeNull();
  });

  it("no grade anywhere → null, not a guess", () => {
    expect(deriveGradeBand({ slug: "pedagogy-foundations", title: "Foundations of Pedagogy", tags: ["pedagogy"] })).toBeNull();
  });

  it("scopeLabelKeys puts the grade before the track and skips a missing axis", () => {
    expect(scopeLabelKeys({ track: "math", grade: "g1" })).toEqual(["grade.g1", "track.math"]);
    expect(scopeLabelKeys({ track: null, grade: "g1_3" })).toEqual(["grade.g1_3"]);
    expect(scopeLabelKeys({ track: null, grade: null })).toEqual([]);
  });
});
