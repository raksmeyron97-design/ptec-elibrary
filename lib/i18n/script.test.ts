import { describe, expect, it } from "vitest";
import { hasKhmer, langFor, splitBilingual } from "./script";

describe("hasKhmer", () => {
  it("detects Khmer letters, subscripts and vowel signs", () => {
    expect(hasKhmer("គណិតវិទ្យា")).toBe(true);
    expect(hasKhmer("ថ្នាក់ទី១")).toBe(true);
  });
  it("is false for Latin, digits, punctuation and empty", () => {
    expect(hasKhmer("Grade 1 · Mathematics")).toBe(false);
    expect(hasKhmer("")).toBe(false);
    expect(hasKhmer(null)).toBe(false);
  });
});

describe("langFor", () => {
  it("marks a Khmer run on an English page", () => {
    expect(langFor("កញ្ចប់អំណានថ្នាក់ដំបូង", "en")).toBe("km");
  });
  it("marks an English run on a Khmer page", () => {
    expect(langFor("Teacher Guide G1 Part 1", "km")).toBe("en");
  });
  it("adds nothing when the run already matches the page", () => {
    expect(langFor("Early Grade Reading", "en")).toBeNull();
    expect(langFor("អំណាន", "km")).toBeNull();
  });
  it("does not call a bare number or symbol English on a Khmer page", () => {
    expect(langFor("27", "km")).toBeNull();
    expect(langFor("G1", "km")).toBeNull();
  });
});

describe("splitBilingual", () => {
  it("splits the audience strings this library actually stores", () => {
    expect(
      splitBilingual("គរុនិស្សិត, គ្រូបង្រៀនបឋមសិក្សា (ថ្នាក់ទី១-៣), នាយកសាលា, និងអ្នកអប់រំ / Primary School Teachers, Trainees & Educators"),
    ).toEqual({
      km: "គរុនិស្សិត, គ្រូបង្រៀនបឋមសិក្សា (ថ្នាក់ទី១-៣), នាយកសាលា, និងអ្នកអប់រំ",
      en: "Primary School Teachers, Trainees & Educators",
    });
  });
  it("decides by script, not by position", () => {
    expect(splitBilingual("Grade 1 Teachers / គ្រូថ្នាក់ទី១")).toEqual({ km: "គ្រូថ្នាក់ទី១", en: "Grade 1 Teachers" });
  });
  it("returns a monolingual value whole", () => {
    expect(splitBilingual("In-service Teacher")).toEqual({ km: null, en: "In-service Teacher" });
    expect(splitBilingual("គរុនិស្សិត")).toEqual({ km: "គរុនិស្សិត", en: null });
  });
  it("does not split on a slash inside a word (a/b) — only on a spaced separator", () => {
    expect(splitBilingual("Reading/Writing teachers")).toEqual({ km: null, en: "Reading/Writing teachers" });
  });
  it("handles empty input", () => {
    expect(splitBilingual(null)).toEqual({ km: null, en: null });
    expect(splitBilingual("  ")).toEqual({ km: null, en: null });
  });
});
