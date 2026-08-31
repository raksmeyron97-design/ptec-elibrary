import { describe, it, expect } from "vitest";
import {
  catalogMatchesSubject,
  publicationMatchesSubject,
  subjectKey,
  thesisMatchesSubject,
} from "@/lib/subjects/matching";

// These rules are shared by two code paths that must never disagree: the
// subject hub counts every subject in memory, the subject page filters one
// subject in the database. A hub advertising "12 resources" that opens a page
// listing nine is the failure this file exists to prevent.

describe("subjectKey", () => {
  it("folds case and collapses whitespace", () => {
    expect(subjectKey("  Educational   Psychology ")).toBe("educational psychology");
  });

  it("normalizes Unicode so Khmer names compare consistently", () => {
    expect(subjectKey("គីមីវិទ្យា")).toBe("គីមីវិទ្យា".normalize("NFC"));
  });

  it("treats null/undefined/blank as no subject", () => {
    for (const v of [null, undefined, "", "   "]) expect(subjectKey(v)).toBe("");
  });
});

describe("thesisMatchesSubject", () => {
  it("matches on any of the three taxonomy columns", () => {
    expect(thesisMatchesSubject({ subject: "Pedagogy" }, "Pedagogy")).toBe(true);
    expect(thesisMatchesSubject({ program: "Pedagogy" }, "Pedagogy")).toBe(true);
    expect(thesisMatchesSubject({ faculty: "Pedagogy" }, "Pedagogy")).toBe(true);
  });

  it("is a substring match, mirroring the ilike filter", () => {
    expect(thesisMatchesSubject({ program: "Applied Pedagogy (M.Ed)" }, "Pedagogy")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(thesisMatchesSubject({ subject: "PEDAGOGY" }, "pedagogy")).toBe(true);
  });

  it("does not match an unrelated row", () => {
    expect(thesisMatchesSubject({ subject: "Chemistry" }, "Pedagogy")).toBe(false);
  });

  it("never matches on an empty subject name", () => {
    expect(thesisMatchesSubject({ subject: "Anything" }, "")).toBe(false);
  });

  it("handles all-null taxonomy columns", () => {
    expect(thesisMatchesSubject({ subject: null, program: null, faculty: null }, "X")).toBe(false);
  });

  it("matches Khmer subject names", () => {
    expect(thesisMatchesSubject({ subject: "គីមីវិទ្យា" }, "គីមីវិទ្យា")).toBe(true);
  });
});

describe("publicationMatchesSubject", () => {
  it("is EXACT membership, not substring — the DB filter is .contains()", () => {
    expect(publicationMatchesSubject(["Pedagogy", "Assessment"], "Pedagogy")).toBe(true);
    expect(publicationMatchesSubject(["Applied Pedagogy"], "Pedagogy")).toBe(false);
  });

  it("is case-insensitive on the exact value", () => {
    expect(publicationMatchesSubject(["pedagogy"], "Pedagogy")).toBe(true);
  });

  it("handles a null or empty array", () => {
    expect(publicationMatchesSubject(null, "Pedagogy")).toBe(false);
    expect(publicationMatchesSubject([], "Pedagogy")).toBe(false);
  });

  it("never matches on an empty subject name", () => {
    expect(publicationMatchesSubject(["Pedagogy"], "")).toBe(false);
  });
});

describe("catalogMatchesSubject", () => {
  it("is a substring match on the free-text category", () => {
    expect(catalogMatchesSubject("Science / Chemistry", "Chemistry")).toBe(true);
    expect(catalogMatchesSubject("Science", "Chemistry")).toBe(false);
  });

  it("handles a null category", () => {
    expect(catalogMatchesSubject(null, "Chemistry")).toBe(false);
  });
});
