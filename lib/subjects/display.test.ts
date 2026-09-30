import { describe, expect, it } from "vitest";
import { approvedIntro, subjectNames } from "./display";

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
