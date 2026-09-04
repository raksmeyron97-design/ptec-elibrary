import { describe, expect, it } from "vitest";
import {
  MAX_QUERY_TOKENS,
  boundedEditDistance,
  hasKhmer,
  typoTolerance,
  isbnEquals,
  isbnSearchKeys,
  normalizeSearchText,
  queryIsbn,
  tokenizeSearchQuery,
} from "./normalize";
import { normalizeTitle } from "@/lib/books/duplicate-detection/normalize";

describe("normalizeSearchText", () => {
  it("is the ingestion gate's own title rule, not a second definition", () => {
    for (const s of ["Introduction-to-Psychology", "Zoë's Guide", "ការសិក្សាបែបសកម្ម (Active Learning)"]) {
      expect(normalizeSearchText(s)).toBe(normalizeTitle(s));
    }
  });

  it("folds punctuation and case so a hyphenated title matches a spaced query", () => {
    expect(normalizeSearchText("Introduction-to-Psychology")).toBe("introduction to psychology");
    expect(normalizeSearchText("Research Design: Qualitative, Quantitative")).toBe("research design qualitative quantitative");
  });

  it("folds Latin diacritics", () => {
    expect(normalizeSearchText("Zoë")).toBe("zoe");
  });

  it("keeps every Khmer combining mark", () => {
    const title = "ការសិក្សាបែបសកម្ម";
    const normalized = normalizeSearchText(title);
    // Vowel sign AA (U+17B6) and COENG (U+17D2) are marks, not letters.
    expect(normalized).toContain("ា");
    expect(normalized).toContain("្");
    expect(normalized).toBe(title);
  });

  it("does not shred a Khmer title into a consonant skeleton", () => {
    expect(normalizeSearchText("កំណត់ហេតុរបស់ជីវតាក្វាន់")).toBe("កំណត់ហេតុរបស់ជីវតាក្វាន់");
  });
});

describe("tokenizeSearchQuery", () => {
  it("returns the whole query first, then its words, deduped", () => {
    expect(tokenizeSearchQuery("classroom management")).toEqual(["classroom management", "classroom", "management"]);
  });

  it("drops one-character words and caps the fan-out", () => {
    const q = "a b c d e f g h i j k one two three four five six seven eight nine";
    const tokens = tokenizeSearchQuery(q);
    expect(tokens).toHaveLength(MAX_QUERY_TOKENS);
    expect(tokens).not.toContain("a");
  });

  it("keeps a Khmer query as one token", () => {
    expect(tokenizeSearchQuery("ការសិក្សាបែបសកម្ម")).toEqual(["ការសិក្សាបែបសកម្ម"]);
  });
});

describe("queryIsbn", () => {
  it("recognises hyphenated, spaced, bare and ISBN-10 forms", () => {
    expect(queryIsbn("978-1-4739-4629-3")).toBe("9781473946293");
    expect(queryIsbn("9781473946293")).toBe("9781473946293");
    expect(queryIsbn("0 415 17152 0")).toBe("9780415171526");
    expect(queryIsbn("0-415-17152-0")).toBe("9780415171526");
  });

  it("refuses titles that merely contain digits", () => {
    expect(queryIsbn("SPSS 16.0")).toBeNull();
    expect(queryIsbn("Grade 12 Physics")).toBeNull();
    expect(queryIsbn("2019")).toBeNull();
    expect(queryIsbn("")).toBeNull();
  });
});

describe("isbnSearchKeys / isbnEquals", () => {
  it("yields the ISBN-13, its ISBN-10 twin and the typed digits", () => {
    expect(isbnSearchKeys("978-0-415-17152-6")).toEqual(expect.arrayContaining(["9780415171526", "0415171520"]));
    expect(isbnSearchKeys("0-415-17152-0")).toEqual(expect.arrayContaining(["9780415171526", "0415171520"]));
  });

  it("compares across forms and never matches a missing ISBN", () => {
    expect(isbnEquals("978-0-415-17152-6", "0415171520")).toBe(true);
    expect(isbnEquals(null, null)).toBe(false);
    expect(isbnEquals("N/A", "N/A")).toBe(false);
  });
});

describe("boundedEditDistance / typoTolerance", () => {
  it("counts edits and stops early past the bound", () => {
    expect(boundedEditDistance("practicl", "practical", 2)).toBe(1);
    expect(boundedEditDistance("interveiwing", "interviewing", 2)).toBe(2);
    expect(boundedEditDistance("chemistry", "biology", 2)).toBe(3);
    expect(boundedEditDistance("same", "same", 1)).toBe(0);
  });

  it("allows one edit for medium terms, two for long ones, none for short or Khmer", () => {
    expect(typoTolerance("dat")).toBe(0);
    expect(typoTolerance("data")).toBe(1);
    expect(typoTolerance("methodology")).toBe(2);
    expect(typoTolerance("ការសិក្សា")).toBe(0);
  });
});

describe("hasKhmer", () => {
  it("detects Khmer script", () => {
    expect(hasKhmer("classroom ការគ្រប់គ្រង")).toBe(true);
    expect(hasKhmer("classroom")).toBe(false);
  });
});
