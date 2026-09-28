import { describe, it, expect } from "vitest";
import en from "@/messages/en.json";
import km from "@/messages/km.json";
import {
  CATEGORIES_AWAITING_REVIEW,
  CATEGORY_SUBJECT_CLASS,
  SUBJECT_CLASSES,
  compareSubjectClass,
  subjectClassOfCallNumber,
  subjectClassOfCategory,
} from "./subject-class";

describe("a print record's subject class comes from its call number", () => {
  it("takes the DDC hundreds class, with 370–379 as Education", () => {
    expect(subjectClassOfCallNumber("510 ហៃ")).toBe("500");
    expect(subjectClassOfCallNumber("372.7 ZVO")).toBe("370");
    expect(subjectClassOfCallNumber("370 ABC")).toBe("370");
    expect(subjectClassOfCallNumber("379.1 X")).toBe("370");
    expect(subjectClassOfCallNumber("380 X")).toBe("300");
    expect(subjectClassOfCallNumber("320.09 ប្រាជ្ញ")).toBe("300");
    expect(subjectClassOfCallNumber("004.6 NET")).toBe("000");
    expect(subjectClassOfCallNumber("895.93 ក")).toBe("800");
  });

  it("reads Khmer digits, and never guesses from a call number that is not DDC", () => {
    expect(subjectClassOfCallNumber("៣៧២.៧ ក")).toBe("370");
    expect(subjectClassOfCallNumber("REF 370")).toBeNull();
    expect(subjectClassOfCallNumber("5102 X")).toBeNull();
    expect(subjectClassOfCallNumber("")).toBeNull();
    expect(subjectClassOfCallNumber(null)).toBeNull();
  });
});

describe("a digital book's subject class comes from a CONFIRMED category mapping only", () => {
  it("maps the confirmed categories, and 370 is a class of its own", () => {
    expect(subjectClassOfCategory("គរុកោសល្យ")).toBe("370");
    expect(subjectClassOfCategory("អប់រំ")).toBe("370");
    expect(subjectClassOfCategory("គណិតវិទ្យា")).toBe("500");
    expect(subjectClassOfCategory(" ប្រវត្តិសាស្ត្រ ")).toBe("900");
  });

  it("classifies a category awaiting review as NOTHING, never as a guess", () => {
    for (const name of Object.keys(CATEGORIES_AWAITING_REVIEW)) expect(subjectClassOfCategory(name)).toBeNull();
    expect(subjectClassOfCategory("some category nobody mapped")).toBeNull();
  });

  it("keeps the confirmed and the pending lists apart, and every value a real class", () => {
    for (const name of Object.keys(CATEGORIES_AWAITING_REVIEW)) expect(CATEGORY_SUBJECT_CLASS).not.toHaveProperty(name);
    for (const cls of Object.values(CATEGORY_SUBJECT_CLASS)) expect(SUBJECT_CLASSES).toContain(cls);
    for (const options of Object.values(CATEGORIES_AWAITING_REVIEW)) for (const cls of options) expect(SUBJECT_CLASSES).toContain(cls);
    // 21 confirmed + 14 awaiting review = the 35 production categories of 2026-09-28.
    expect(Object.keys(CATEGORY_SUBJECT_CLASS)).toHaveLength(21);
    expect(Object.keys(CATEGORIES_AWAITING_REVIEW)).toHaveLength(14);
  });
});

describe("the Subject filter", () => {
  it("lists classes in DDC order, Education after Social sciences", () => {
    expect(["500", "370", "000", "300"].sort(compareSubjectClass)).toEqual(["000", "300", "370", "500"]);
  });

  it("has a name for every class in both languages", () => {
    for (const cls of SUBJECT_CLASSES) {
      expect((en.search as Record<string, unknown> & { subjectClass: Record<string, string> }).subjectClass[cls]).toBeTruthy();
      expect((km.search as Record<string, unknown> & { subjectClass: Record<string, string> }).subjectClass[cls]).toBeTruthy();
    }
  });
});
