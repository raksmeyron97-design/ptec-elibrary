import { describe, expect, it } from "vitest";
import { countWords, planSubjectIntro, type SubjectIntroEntry } from "./intro-drafts";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ") + ".";

const approved = (over: Partial<SubjectIntroEntry> = {}): SubjectIntroEntry => ({
  slug: "mathematics",
  name_en: { value: "Mathematics", status: "approved" },
  intro_en: words(100),
  intro_km: "អត្ថបទណែនាំជាភាសាខ្មែរ។",
  km_review: null,
  status: "approved",
  ...over,
});

describe("countWords", () => {
  it("counts English words, not punctuation", () => {
    expect(countWords("Free books, theses and articles.", "en")).toBe(5);
  });
  it("segments Khmer, which has no spaces", () => {
    expect(countWords("បណ្ណាល័យមានសៀវភៅ", "km")).toBeGreaterThan(1);
  });
});

describe("planSubjectIntro", () => {
  it("skips a draft — the file is mostly drafts, so this is not an error", () => {
    expect(planSubjectIntro(approved({ status: "needs_review" })).kind).toBe("skip");
  });

  it("writes an approved, valid entry with its approved English name", () => {
    const plan = planSubjectIntro(approved());
    expect(plan).toEqual({
      kind: "write",
      update: {
        slug: "mathematics",
        name_en: "Mathematics",
        intro_en: words(100),
        intro_km: "អត្ថបទណែនាំជាភាសាខ្មែរ។",
        intro_status: "approved",
      },
    });
  });

  it("never writes an English name that is still a suggestion", () => {
    const plan = planSubjectIntro(approved({ name_en: { value: "Mathematics", status: "needs_review" } }));
    expect(plan.kind === "write" && "name_en" in plan.update).toBe(false);
  });

  it("refuses an English intro outside 80–150 words", () => {
    expect(planSubjectIntro(approved({ intro_en: words(40) })).kind).toBe("refuse");
    expect(planSubjectIntro(approved({ intro_en: words(200) })).kind).toBe("refuse");
  });

  it("refuses a Khmer intro no Khmer reader has approved", () => {
    const plan = planSubjectIntro(approved({ km_review: "TODO(km-review)" }));
    expect(plan.kind).toBe("refuse");
  });

  it("refuses text that still carries a review marker", () => {
    expect(planSubjectIntro(approved({ intro_en: `${words(90)} TODO(km-review)` })).kind).toBe("refuse");
  });

  it("refuses an approved entry with no text at all", () => {
    expect(planSubjectIntro(approved({ intro_en: " ", intro_km: null })).kind).toBe("refuse");
  });

  it("accepts one language alone", () => {
    expect(planSubjectIntro(approved({ intro_km: null })).kind).toBe("write");
  });
});
