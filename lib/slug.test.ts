import { describe, expect, it } from "vitest";
import { asciiSlug, unicodeSlug } from "./slug";

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

  it("keeps a partial Latin slug for mixed titles when it is meaningful", () => {
    expect(unicodeSlug("តេស្ត PISA D វិទ្យាសាស្ត្រ")).toBe("pisa-d");
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
