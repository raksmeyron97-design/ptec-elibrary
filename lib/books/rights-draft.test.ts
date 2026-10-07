import { describe, expect, it } from "vitest";
import { effectiveRightsBasis } from "@/lib/books/rights";
import { draftRightsBasis, rightsReviewRank } from "@/lib/books/rights-draft";

describe("effectiveRightsBasis — only a confirmed basis counts", () => {
  it("a missing row, an unreviewed row and 'unknown' are all commercial", () => {
    expect(effectiveRightsBasis(null)).toBe("commercial");
    expect(effectiveRightsBasis(undefined)).toBe("commercial");
    expect(effectiveRightsBasis({ basis: null, reviewed_at: null })).toBe("commercial");
    expect(effectiveRightsBasis({ basis: "unknown", reviewed_at: "2026-10-07T00:00:00Z" })).toBe("commercial");
    expect(effectiveRightsBasis({ basis: "government_public", reviewed_at: null })).toBe("commercial");
    expect(effectiveRightsBasis({ basis: "nonsense", reviewed_at: "2026-10-07T00:00:00Z" })).toBe("commercial");
  });

  it("a reviewed basis is believed", () => {
    for (const basis of ["ptec_original", "government_public", "open_licence", "commercial"] as const) {
      expect(effectiveRightsBasis({ basis, reviewed_at: "2026-10-07T00:00:00Z" })).toBe(basis);
    }
  });
});

describe("draftRightsBasis — who made it decides, never the title", () => {
  it("MoEYS as publisher or author → government_public", () => {
    expect(draftRightsBasis({ publisher: "Ministry of Education, Youth and Sport" })).toEqual({
      basis: "government_public",
      source: "rule:moeys_publisher",
    });
    expect(draftRightsBasis({ publisher: "ក្រសួងអប់រំ យុវជន និងកីឡា" }).basis).toBe("government_public");
    expect(draftRightsBasis({ authors: ["MoEYS"] })).toEqual({ basis: "government_public", source: "rule:moeys_author" });
  });

  it("PTEC as publisher or author → ptec_original", () => {
    expect(draftRightsBasis({ publisher: "PTEC Press" })).toEqual({ basis: "ptec_original", source: "rule:ptec_publisher" });
    expect(draftRightsBasis({ authors: ["Phnom Penh Teacher Education College"] }).source).toBe("rule:ptec_author");
    expect(draftRightsBasis({ authors: ["វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ"] }).basis).toBe("ptec_original");
  });

  it("does not take another teacher-education college for PTEC", () => {
    expect(draftRightsBasis({ publisher: "Battambang Teacher Education College" }).basis).toBe("unknown");
  });

  it("a commercial publisher or ISBN registrant → commercial", () => {
    expect(draftRightsBasis({ publisher: "Pearson Education" })).toEqual({ basis: "commercial", source: "rule:commercial_publisher" });
  });

  it("anything else → unknown, including an open-access NGO (a librarian confirms those)", () => {
    expect(draftRightsBasis({})).toEqual({ basis: "unknown", source: "rule:none" });
    expect(draftRightsBasis({ publisher: "UNESCO" }).basis).toBe("unknown");
    expect(draftRightsBasis({ publisher: "Some Local Press" }).basis).toBe("unknown");
  });

  it("MoEYS outranks a commercial signal on the same record", () => {
    expect(draftRightsBasis({ publisher: "MoEYS", authors: ["Pearson"] }).basis).toBe("government_public");
  });
});

describe("rightsReviewRank — primary grades, Khmer and maths first", () => {
  it("orders as briefed", () => {
    const titles = [
      "Research Methods in Education",
      "ភាសាខ្មែរ ថ្នាក់ទី៩",
      "Mathematics Grade 4",
      "ភាសាខ្មែរ ថ្នាក់ទី២",
      "គណិតវិទ្យា ថ្នាក់ទី៣",
    ];
    const sorted = [...titles].sort((a, b) => rightsReviewRank(a) - rightsReviewRank(b));
    expect(sorted).toEqual([
      "គណិតវិទ្យា ថ្នាក់ទី៣",
      "ភាសាខ្មែរ ថ្នាក់ទី២",
      "Mathematics Grade 4",
      "ភាសាខ្មែរ ថ្នាក់ទី៩",
      "Research Methods in Education",
    ]);
  });

  it("grade 12 is not grade 1", () => {
    expect(rightsReviewRank("គណិតវិទ្យា ថ្នាក់ទី១២")).toBe(4);
  });
});
