import { describe, expect, it } from "vitest";
import { findTitleCandidate, languageMismatch, looksTruncated, TRUNCATION_LENGTH } from "@/lib/books/title-audit";

const VOCAB = new Set(["research", "methods", "education", "teaching", "mathematics", "curriculum"]);

describe("looksTruncated", () => {
  it("flags exactly 65 characters, in either script", () => {
    expect(looksTruncated("x".repeat(TRUNCATION_LENGTH), VOCAB)).toEqual({ truncated: true, reason: "length_65" });
    expect(looksTruncated("ក".repeat(65), VOCAB).truncated).toBe(true);
  });

  it("flags a Latin title whose last word is cut", () => {
    expect(looksTruncated("Teaching Mathematics in the Primary Curri", VOCAB)).toEqual({ truncated: true, reason: "last_word_unknown" });
  });

  it("leaves a whole title alone, and never applies the word rule to Khmer", () => {
    expect(looksTruncated("Research Methods in Education", VOCAB).truncated).toBe(false);
    expect(looksTruncated("គណិតវិទ្យា ថ្នាក់ទី៤", VOCAB).truncated).toBe(false);
  });
});

describe("findTitleCandidate", () => {
  it("finds the full Latin title on the title page", () => {
    const pages = new Map([
      [1, "PTEC\nTeaching Mathematics in the Primary Curriculum: Grade 4\nPhnom Penh, 2024"],
      [2, "Contents"],
    ]);
    expect(findTitleCandidate("Teaching Mathematics in the Primary Curri", pages)).toEqual({
      candidate: "Teaching Mathematics in the Primary Curriculum: Grade 4",
      page: 1,
      confidence: "high",
    });
  });

  it("finds a Khmer title that wrapped onto a second line", () => {
    const title = "សៀវភៅណែនាំគ្រូបង្រៀន គណិតវិទ្យា";
    const pages = new Map([[1, "ក្រសួងអប់រំ យុវជន និងកីឡា\nសៀវភៅណែនាំគ្រូបង្រៀន គណិតវិទ្យា\nថ្នាក់ទី៤"]]);
    expect(findTitleCandidate(title, pages)).toMatchObject({ candidate: `${title} ថ្នាក់ទី៤`, page: 1 });
  });

  it("never proposes a candidate shorter than the title, or equal to it", () => {
    const pages = new Map([[1, "Teaching Mathematics\nTeaching Mathematics in the Primary Curri"]]);
    expect(findTitleCandidate("Teaching Mathematics in the Primary Curri", pages)).toBeNull();
  });

  it("no matching line is no candidate", () => {
    expect(findTitleCandidate("Research Methods", new Map([[1, "Something else entirely"]]))).toBeNull();
  });
});

describe("languageMismatch", () => {
  it("reports a Khmer title tagged English, and a Latin title tagged Khmer", () => {
    expect(languageMismatch("English", "គណិតវិទ្យា ថ្នាក់ទី៤")).toBe("khmer_title_tagged_english");
    expect(languageMismatch("Khmer", "Research Methods in Education")).toBe("latin_title_tagged_khmer");
  });

  it("leaves mixed titles alone", () => {
    expect(languageMismatch("English", "A Guide to Siem Reap (សៀមរាប)")).toBeNull();
    expect(languageMismatch("Khmer", "គណិតវិទ្យា Grade 4")).toBeNull();
    expect(languageMismatch(null, "គណិតវិទ្យា")).toBeNull();
  });
});

import { auditTarget } from "@/lib/books/audit-target";

describe("auditTarget — production is a decision, not an accident", () => {
  it("runs against the local stack", () => {
    expect(auditTarget("http://127.0.0.1:54331", []).allowed).toBe(true);
    expect(auditTarget("http://localhost:54331", []).allowed).toBe(true);
  });

  it("refuses a remote database without --production", () => {
    expect(auditTarget("https://supabase.storage-ptec.online", [])).toMatchObject({ allowed: false });
    expect(auditTarget("https://supabase.storage-ptec.online", ["--production"]).allowed).toBe(true);
    expect(auditTarget("not a url", ["--production"]).allowed).toBe(false);
  });
});
