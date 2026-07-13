import { describe, it, expect } from "vitest";
import { normalizeReferenceText, isCompleteReference, schemaCitations } from "./references";

describe("normalizeReferenceText", () => {
  it("collapses PDF line wraps into single spaces", () => {
    expect(normalizeReferenceText("Smith, J.\n(2019).  Teaching\nmethods.")).toBe(
      "Smith, J. (2019). Teaching methods.",
    );
  });
});

describe("isCompleteReference", () => {
  it("accepts a complete citation with author, year and title", () => {
    expect(
      isCompleteReference("Vygotsky, L. S. (1978). Mind in society. Harvard University Press."),
    ).toBe(true);
  });

  it("rejects a bare page-range fragment", () => {
    expect(isCompleteReference("pp. 12-15.")).toBe(false);
    expect(isCompleteReference("233-245")).toBe(false);
  });

  it("rejects an entry cut off mid-line (continuation tail)", () => {
    expect(isCompleteReference("Brown, A. (2011). Classroom research and")).toBe(false);
    expect(isCompleteReference("Nguyen, T. (2020). A study of teaching methods, pp.")).toBe(false);
  });

  it("rejects a lowercase continuation head", () => {
    expect(isCompleteReference("and the impact of co-teaching in 2019 classrooms today")).toBe(false);
  });

  it("rejects entries with no year (likely a fragment)", () => {
    expect(isCompleteReference("Guidelines for laboratory design and safety practices")).toBe(false);
  });

  it("rejects a colon-ended fragment (title continued on next line)", () => {
    expect(
      isCompleteReference("Chan, S., Maneewan, S., & Koul, R. (2021). Cooperative learning in teacher education:"),
    ).toBe(false);
  });

  it("rejects a mid-word cut with no terminal punctuation", () => {
    expect(
      isCompleteReference("Chen, H. (1998). The performance of junior college students studying English through"),
    ).toBe(false);
    expect(
      isCompleteReference("Each, N., & Suppasetseree, S. (2021). The effects of mobile-blended cooperative"),
    ).toBe(false);
  });

  it("keeps a complete citation ending in a period", () => {
    expect(
      isCompleteReference("Bejarano, Y. (1987). A cooperative small-group methodology in the language classroom. TESOL Quarterly, 21(3), 483-504."),
    ).toBe(true);
  });

  it("rejects entries that are too short", () => {
    expect(isCompleteReference("Ibid. 2019.")).toBe(false);
  });
});

describe("schemaCitations", () => {
  it("keeps only complete, de-duplicated entries", () => {
    const raw = [
      "Vygotsky, L. S. (1978). Mind in society. Harvard University Press.",
      "pp. 12-15.",
      "Brown, A. (2011). Classroom research and",
      "  Vygotsky, L. S. (1978). Mind in society. Harvard University Press.  ", // dupe
      "Piaget, J. (1952). The origins of intelligence in children. Norton.",
    ];
    expect(schemaCitations(raw)).toEqual([
      "Vygotsky, L. S. (1978). Mind in society. Harvard University Press.",
      "Piaget, J. (1952). The origins of intelligence in children. Norton.",
    ]);
  });

  it("returns [] when nothing qualifies (so schema omits citations entirely)", () => {
    expect(schemaCitations(["pp. 3-4", "and then", null, ""])).toEqual([]);
    expect(schemaCitations(null)).toEqual([]);
  });
});
