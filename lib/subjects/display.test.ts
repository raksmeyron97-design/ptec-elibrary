import { describe, expect, it } from "vitest";
import { approvedIntro, labelsBySlug, subjectLabel, subjectNames } from "./display";

describe("subjectNames", () => {
  it("shows the approved English name with the Khmer one in parentheses on English pages", () => {
    expect(subjectNames({ name: "គណិតវិទ្យា", nameEn: "Mathematics" }, "en")).toEqual({
      heading: "Mathematics (គណិតវិទ្យា)",
      short: "Mathematics",
    });
  });

  it("falls back to the Khmer name, never a guessed translation", () => {
    expect(subjectNames({ name: "គណិតវិទ្យា", nameEn: null }, "en")).toEqual({
      heading: "គណិតវិទ្យា",
      short: "គណិតវិទ្យា",
    });
    expect(subjectNames({ name: "គណិតវិទ្យា", nameEn: "   " }, "en").short).toBe("គណិតវិទ្យា");
  });

  it("always shows the Khmer name on Khmer pages", () => {
    expect(subjectNames({ name: "គណិតវិទ្យា", nameEn: "Mathematics" }, "km")).toEqual({
      heading: "គណិតវិទ្យា",
      short: "គណិតវិទ្យា",
    });
  });
});

describe("approvedIntro", () => {
  const intro = { en: "An English introduction.", km: null };
  it("returns the page language's introduction", () => {
    expect(approvedIntro({ intro }, "en")).toBe("An English introduction.");
  });
  it("never borrows the other language's introduction", () => {
    expect(approvedIntro({ intro }, "km")).toBeNull();
  });
  it("is null when nothing is approved", () => {
    expect(approvedIntro({ intro: null }, "en")).toBeNull();
    expect(approvedIntro({ intro: { en: "  ", km: null } }, "en")).toBeNull();
  });
});

describe("subjectLabel / labelsBySlug", () => {
  const index = [
    { slug: "math", name: "គណិតវិទ្យា", nameEn: "Mathematics" },
    { slug: "kits", name: "កញ្ជប់គណិតវិទ្យា", nameEn: null },
  ];
  it("uses an approved English name on English pages only", () => {
    expect(subjectLabel(index[0], "en")).toBe("Mathematics");
    expect(subjectLabel(index[0], "km")).toBe("គណិតវិទ្យា");
    expect(subjectLabel(index[1], "en")).toBe("កញ្ជប់គណិតវិទ្យា");
  });
  it("resolves a hierarchy ref by slug, and keeps its own name when unknown", () => {
    const label = labelsBySlug(index, "en");
    expect(label({ slug: "math", name: "x" })).toBe("Mathematics");
    expect(label({ slug: "gone", name: "ប្រវត្តិសាស្ត្រ" })).toBe("ប្រវត្តិសាស្ត្រ");
  });
});
