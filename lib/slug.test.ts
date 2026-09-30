import { describe, expect, it } from "vitest";
import { asciiSlug, isValidSlug, unicodeSlug, capSlug, newRecordSlug, NEW_SLUG_MAX_CHARS } from "./slug";

describe("asciiSlug", () => {
  it("keeps the historical Latin behavior", () => {
    expect(asciiSlug("Action Research in Practice")).toBe("action-research-in-practice");
    expect(asciiSlug("  \"This IS NOT Acceptable\"  ")).toBe("this-is-not-acceptable");
  });

  it("returns empty for titles with no Latin content", () => {
    expect(asciiSlug("១០១សំណួរយល់ដឹងពីព្រះពុទ្ធសាសនា")).toBe("");
  });
});

describe("unicodeSlug", () => {
  it("prefers the ASCII slug for Latin titles", () => {
    expect(unicodeSlug("The Great Gatsby")).toBe("the-great-gatsby");
  });

  it("preserves both Khmer and English for bilingual mixed titles", () => {
    expect(unicodeSlug("តេស្ត PISA D វិទ្យាសាស្ត្រ")).toBe("តេស្ត-pisa-d-វិទ្យាសាស្ត្រ");
    expect(unicodeSlug("សៀវភៅភាសាអង់គ្លេស English Book")).toBe("សៀវភៅភាសាអង់គ្លេស-english-book");
    expect(unicodeSlug("Java Programming ភាសាខ្មែរ")).toBe("java-programming-ភាសាខ្មែរ");
  });

  it("keeps Khmer script for Khmer-only titles", () => {
    const slug = unicodeSlug("១០១សំណួរយល់ដឹងពីព្រះពុទ្ធសាសនា ដោយ គូ សុភាព");
    expect(slug).toContain("សំណួរ");
    expect(slug).toContain("-"); // spaces became separators
    expect(slug).not.toMatch(/\s/);
  });

  it("treats zero-width spaces as word separators", () => {
    expect(unicodeSlug("សម្រាប់​សិស្ស")).toBe("សម្រាប់-សិស្ស");
  });

  it("never returns a digits-only junk remnant like '-2'", () => {
    // A Khmer title ending in a Latin digit previously slugged to "2".
    expect(unicodeSlug("ឯកសារ 2")).not.toBe("2");
    expect(unicodeSlug("ឯកសារ 2")).toContain("ឯកសារ");
  });

  it("returns empty when there is nothing usable, so callers hit their fallback", () => {
    expect(unicodeSlug("!!! ***")).toBe("");
  });
});

describe("isValidSlug", () => {
  const KHMER_TITLE =
    "ពិធីបិទវគ្គបណ្ដុះបណ្ដាល ស្ដីពី «ការស្រាវជ្រាវប្រតិបត្តិ» នៅវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ";

  it("accepts what unicodeSlug emits — otherwise a form rejects its own output", () => {
    for (const title of [KHMER_TITLE, "A Valid Post Title", "សៀវភៅ ២០២៦", "Recherche appliquée"]) {
      expect(isValidSlug(unicodeSlug(title))).toBe(true);
    }
  });

  it("keeps rejecting the malformed shapes it always did", () => {
    for (const bad of ["Not A Slug", "trailing-", "-leading", "double--hyphen", "has space", "", "Uppercase"]) {
      expect(isValidSlug(bad)).toBe(false);
    }
  });
});

describe("capSlug / newRecordSlug (SEO Phase 2.8)", () => {
  it("keeps the first eight words of a long Latin title", () => {
    expect(
      newRecordSlug("The Effect of Cooperative Learning on Grade Nine Students' Achievement in Mathematics at Two Schools"),
    ).toBe("the-effect-of-cooperative-learning-on-grade-nine");
  });
  it("leaves a short slug exactly as unicodeSlug made it", () => {
    expect(newRecordSlug("Foundations of Education")).toBe(unicodeSlug("Foundations of Education"));
  });
  it("counts Khmer words, which have no spaces, and never splits a cluster", () => {
    const title = "ការសិក្សាអំពីឥទ្ធិពលនៃការរៀនសូត្រសហការលើលទ្ធផលសិក្សារបស់សិស្សថ្នាក់ទីប្រាំបួនក្នុងមុខវិជ្ជាគណិតវិទ្យា";
    const slug = newRecordSlug(title);
    expect(slug.length).toBeLessThanOrEqual(NEW_SLUG_MAX_CHARS);
    expect(slug.length).toBeLessThan(title.length);
    expect(title.startsWith(slug)).toBe(true);
    expect(/[ា-៓]$/u.test(slug) || /[ក-ឳ]$/u.test(slug)).toBe(true);
    expect(slug.endsWith("្")).toBe(false); // never ends on a coeng
  });
  it("caps characters when one word is longer than the ceiling", () => {
    expect([...capSlug("a".repeat(200))].length).toBe(NEW_SLUG_MAX_CHARS);
  });
  it("never ends on a hyphen", () => {
    expect(capSlug("one-two-three-four", { maxWords: 2 })).toBe("one-two");
  });
});
