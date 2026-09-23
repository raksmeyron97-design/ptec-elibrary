import { describe, expect, it } from "vitest";

import {
  headAgreement,
  HEAD_AGREEMENT_FLOOR,
  meanKhmerRun,
  titleKey,
  verifyVisionTitle,
} from "@/lib/books/title-vision";

// Both strings below are production, 2026-09-23: the stored (cut) title and
// what is actually printed on that record's own cover.
const STORED = "កម្មវិធីសិក្សាលម្អិត មុខវិជ្ជា បច្ចេកវិទ្យាព័ត៌មាន និងសារគមនាគមន៍";
const COVER = "កម្មវិធីសិក្សាលម្អិត មុខវិជ្ជា បច្ចេកវិទ្យាគមនាគមន៍និងព័ត៌មាន សម្រាប់កម្រិតមធ្យមសិក្សាទុតិយភូមិ";

const check = (over: Partial<Parameters<typeof verifyVisionTitle>[0]> = {}) =>
  verifyVisionTitle({ stored: STORED, transcribed: COVER, fullyLegible: true, ...over });

describe("an outage is not a verdict about the book", () => {
  it("answers `unavailable`, never `reject`", () => {
    // The first live run hit a spending cap and reported every record as
    // "unreadable cover". That report would be read as evidence about the
    // collection instead of about the quota.
    const c = check({ unreachable: true });
    expect(c.verdict).toBe("unavailable");
    expect(c.reason).toContain("could not be reached");
  });

  it("distinguishes it from a model that answered with nothing", () => {
    const c = check({ transcribed: "" });
    expect(c.verdict).toBe("reject");
    expect(c.reason).toContain("the model answered");
  });
});

describe("head agreement, not prefix continuation", () => {
  it("accepts a cover whose wording differs AFTER the head", () => {
    // The stored title ends "ព័ត៌មាន និងសារគមនាគមន៍"; the cover prints those
    // two words SWAPPED, because the stored string did not come from the
    // cover. Same book. A prefix test refuses it; this does not.
    expect(check().verdict).toBe("apply");
    expect(headAgreement(STORED, COVER)).toBeGreaterThanOrEqual(HEAD_AGREEMENT_FLOOR);
  });

  it("rejects a cover that is a different title", () => {
    const c = check({ transcribed: "សៀវភៅណែនាំគ្រូបង្រៀន គណិតវិទ្យា ថ្នាក់ទី៧ ឆ្នាំ២០២២" });
    expect(c.verdict).toBe("reject");
    expect(c.reason).toContain("not the same title");
  });

  it("ignores spacing, punctuation and zero-width characters", () => {
    // A cover line-breaks a title wherever the design needs, and 43 of the 191
    // stored titles carry zero-width spaces.
    expect(titleKey("ឯកសារ​ បង្រៀន, ការ។")).toBe(titleKey("ឯកសារបង្រៀនការ"));
  });
});

describe("it must carry MORE of the title", () => {
  it("rejects a transcription no longer than what is stored", () => {
    const c = check({ transcribed: STORED });
    expect(c.verdict).toBe("reject");
    expect(c.reason).toContain("restores nothing");
  });
});

describe("unreadable Khmer is refused", () => {
  it("rejects a transcription that came out as fragments", () => {
    // Correctly-encoded characters that spell nothing — the failure
    // lib/ai/page-quality.ts refuses for page text, and the one least likely
    // to be noticed here, as a title, in the reader's own language.
    const shredded = `${STORED.slice(0, 45)} ប ច េ ក វ ិ ទ េ យ ា ព ័ ត ៌ ម ា ន ខ ម ែ រ`;
    expect(meanKhmerRun(shredded)).toBeLessThan(3.5);
    const c = check({ transcribed: shredded });
    expect(c.verdict).toBe("reject");
    expect(c.reason).toContain("fragments");
  });

  it("does not apply the Khmer rule to a Latin title", () => {
    const stored = "Teaching Materials for the Prevention of Drug Harm in Prim";
    const c = verifyVisionTitle({
      stored,
      transcribed: `${stored}ary Schools, Grades 5 and 6`,
      fullyLegible: true,
    });
    expect(c.verdict).toBe("apply");
  });
});

describe("a partly legible cover is a review, never an apply", () => {
  it("downgrades when the model says it could not read it all", () => {
    const c = check({ fullyLegible: false });
    expect(c.verdict).toBe("review");
    expect(c.reason).toContain("could not read the whole title");
  });
});
