import { describe, expect, it } from "vitest";
import { carriesReviewMarker, cleanDraft, DESCRIPTION_DRAFT_MAX, draftToPublish } from "./description-review";

describe("draftToPublish", () => {
  it("publishes the draft in the book's own language", () => {
    expect(draftToPublish({ language: "Khmer", title: "x" }, { en: "English text.", km: "អត្ថបទ។" })).toEqual({
      text: "អត្ថបទ។",
      locale: "km",
    });
    expect(draftToPublish({ language: "English", title: "x" }, { en: "English text.", km: "អត្ថបទ។" })).toEqual({
      text: "English text.",
      locale: "en",
    });
  });
  it("uses the title's script when no language is recorded", () => {
    expect(draftToPublish({ language: null, title: "គណិតវិទ្យា" }, { km: "អត្ថបទ។" })?.locale).toBe("km");
  });
  it("refuses to publish the other language's draft in its place", () => {
    expect(draftToPublish({ language: "Khmer", title: "x" }, { en: "English only." })).toBeNull();
  });
});

describe("cleanDraft", () => {
  it("trims, normalizes newlines and caps the length", () => {
    expect(cleanDraft("  a\r\nb  ")).toBe("a\nb");
    expect(cleanDraft("   ")).toBeNull();
    expect(cleanDraft("x".repeat(5000))?.length).toBe(DESCRIPTION_DRAFT_MAX);
  });
});

describe("carriesReviewMarker", () => {
  it("a draft still marked for review is not ready to publish", () => {
    expect(carriesReviewMarker("TODO(km-review) សៀវភៅនេះ…")).toBe(true);
    expect(carriesReviewMarker("needs_review: check the year")).toBe(true);
    expect(carriesReviewMarker("A guide to early reading, with chapters on phonics and fluency.")).toBe(false);
  });
});
