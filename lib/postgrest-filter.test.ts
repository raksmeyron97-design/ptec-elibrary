import { describe, it, expect } from "vitest";
import { sanitizeFilterTerm } from "@/lib/postgrest-filter";

// PostgREST parses .or() as a comma-separated mini-language. An unsanitized
// value does not error — it silently re-partitions the filter into different
// conditions than the caller wrote.
describe("sanitizeFilterTerm", () => {
  it.each(["%", ",", "(", ")", "*", "\\"])("strips the metacharacter %s", (ch) => {
    expect(sanitizeFilterTerm(`a${ch}b`)).toBe("a b");
  });

  it("neutralizes a subject name that would re-partition an .or() filter", () => {
    expect(sanitizeFilterTerm("Maths, Science")).toBe("Maths Science");
  });

  it("collapses the whitespace it introduces and trims", () => {
    expect(sanitizeFilterTerm("  a,,,b  ")).toBe("a b");
  });

  it("leaves ordinary and Khmer text untouched", () => {
    expect(sanitizeFilterTerm("Educational Psychology")).toBe("Educational Psychology");
    expect(sanitizeFilterTerm("គីមីវិទ្យា")).toBe("គីមីវិទ្យា");
  });

  it("bounds the length", () => {
    expect(sanitizeFilterTerm("x".repeat(500))).toHaveLength(120);
  });
});
