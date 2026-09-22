// lib/catalogs/placeholder-author.test.ts
//
// A typed placeholder is the same fact as a blank one.
//
// The PMB export leaves 476 authors blank. The prepared import sheets fill
// 472 of them with the literal label "គ្មានអ្នកនិពន្ធ" — measured by joining
// the two on barcode. Blank was already handled; the label was not, so those
// rows would have imported with a placeholder sitting in the author column.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateRow } from "@/lib/catalog-import";

/** The literal the sheets carry, and the English label beside it. */
const KHMER_NO_AUTHOR = "គ្មានអ្នកនិពន្ធ";

const ROW = {
  title: "វិទ្យាសាស្ត្រ ថ្នាក់ទី៤",
  barcode: "29085",
  language: "km",
} as const;

describe("a placeholder is imported as NO author", () => {
  it("stores null, not the label", () => {
    const r = validateRow({ ...ROW, author: KHMER_NO_AUTHOR }, 2);
    expect(r.normalized?.author).toBeNull();
  });

  it("says what it did, and why, without rejecting the row", () => {
    const r = validateRow({ ...ROW, author: KHMER_NO_AUTHOR }, 2);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("PLACEHOLDER_AUTHOR");
    // It becomes a missing author, so the operator gets that warning too —
    // the two together are the whole story of the row.
    expect(codes).toContain("MISSING_AUTHOR");
    expect(r.issues.every((i) => i.severity === "warning")).toBe(true);
  });

  it("treats it exactly as a blank author is treated", () => {
    const typed = validateRow({ ...ROW, author: KHMER_NO_AUTHOR }, 2);
    const blank = validateRow({ ...ROW, author: "" }, 2);
    expect(typed.normalized?.author).toBe(blank.normalized?.author);
  });

  it("covers the other strings that name nobody", () => {
    // One definition of "names nobody" — this asks the same function the
    // public surfaces ask, so a name refused here is refused there.
    for (const a of ["Unknown", "N/A", "Windows User", "អ្នកនិពន្ធ"]) {
      expect(validateRow({ ...ROW, author: a }, 2).normalized?.author).toBeNull();
    }
  });

  it("covers the English labels too — the two languages refuse the same fact", () => {
    // `គ្មានអ្នកនិពន្ធ` was in the vocabulary and its English counterpart was
    // not, so the same fact was refused in one language and stored in the
    // other. These are the labels this app itself renders
    // (messages/en.json: `noAuthorListed`, `noAuthor`) — the strings a
    // cataloguer copies off the screen. "no author" alone did not catch them
    // because the vocabulary is matched WHOLE.
    for (const a of [
      "No author listed",
      "No author recorded",
      "No authors listed",
      "NO AUTHOR LISTED",
      "no author listed.",
    ]) {
      expect(validateRow({ ...ROW, author: a }, 2).normalized?.author).toBeNull();
    }
  });

  it("does not swallow a real name that contains those words", () => {
    // The vocabulary matches a whole string, never a substring — a publisher
    // called "Author House" is a real credit.
    for (const a of ["Author House", "No Author Books Ltd"]) {
      expect(validateRow({ ...ROW, author: a }, 2).normalized?.author).toBe(a);
    }
  });
});

describe("a real author is untouched", () => {
  it("keeps ordinary names in both scripts", () => {
    for (const a of ["ប្រាជ្ញ វិជ័យ", "Hattie John", "Martin, Ann M.", "គីម ថែខ្វាន់"]) {
      const r = validateRow({ ...ROW, author: a }, 2);
      expect(r.normalized?.author).toBe(a);
      expect(r.issues.map((i) => i.code)).not.toContain("PLACEHOLDER_AUTHOR");
    }
  });

  it("does not drop a name that merely looks odd", () => {
    // `suspicious` changes nothing, by design — "IJERE" is a real journal
    // and "KPC" may be a real institution.
    const r = validateRow({ ...ROW, author: "IJERE" }, 2);
    expect(r.normalized?.author).toBe("IJERE");
  });

  it("keeps the filing comma", () => {
    expect(validateRow({ ...ROW, author: "Alexander, Michael" }, 2).normalized?.author).toBe(
      "Alexander, Michael",
    );
  });
});

describe("one vocabulary, not two", () => {
  it("the importer asks contributor-trust rather than keeping its own list", () => {
    // A second list is how the public surfaces and the ingestion gate come
    // to disagree about what a name is.
    const src = readFileSync(join(process.cwd(), "lib/catalog-import.ts"), "utf8");
    expect(src).toMatch(/assessContributorName\(author\)\.trust === "invalid"/);
    expect(src).not.toContain(KHMER_NO_AUTHOR.repeat(1) + '"]');
  });
});
