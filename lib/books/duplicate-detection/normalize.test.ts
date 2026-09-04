// The rules that decide identity, in both of this library's languages.
//
// Every case here is a shape the PTEC catalogue actually contains: hyphenated
// and un-hyphenated ISBNs, ISBN-10 rows imported before 2007, honorifics typed
// into the author box, Khmer titles whose words are separated by a zero-width
// space, and grade numbers written in Khmer numerals.

import { describe, expect, it } from "vitest";
import {
  editionMarker,
  isbn10To13,
  isbn13To10,
  isbnMatchKeys,
  isMeaningfulAuthor,
  khmerDigitsToAscii,
  normalizeIsbn,
  normalizePersonName,
  normalizeTaxonomyValue,
  normalizeTitle,
  personInitialKey,
  titleTokens,
  titleWithoutEdition,
  validateIsbn,
} from "./normalize";

describe("normalizeTitle", () => {
  it("folds case, padding, punctuation and separators to one form", () => {
    const canonical = "introduction to psychology";
    for (const variant of [
      "Introduction to Psychology",
      "  introduction   to   psychology ",
      "INTRODUCTION TO PSYCHOLOGY",
      "Introduction-to-Psychology",
      "Introduction, to. Psychology!",
    ]) {
      expect(normalizeTitle(variant), variant).toBe(canonical);
    }
  });

  it("folds Latin diacritics without transliterating anything", () => {
    expect(normalizeTitle("Zoë's Café")).toBe(normalizeTitle("Zoe's Cafe"));
    expect(normalizeTitle("Éducation")).toBe("education");
  });

  it("keeps Khmer combining marks — they carry the vowels", () => {
    // \p{L} alone would strip U+17B6 and friends and reduce every Khmer title
    // to a consonant skeleton, clustering unrelated books together.
    const title = "សៀវភៅគណិតវិទ្យា";
    expect(normalizeTitle(title)).toBe(title);
    expect(normalizeTitle("សៀវភៅគណិតវិទ្យា")).not.toBe(normalizeTitle("សៀវភៅរូបវិទ្យា"));
  });

  it("treats the Khmer zero-width space as a word boundary", () => {
    expect(normalizeTitle("សៀវភៅ​គណិតវិទ្យា")).toBe("សៀវភៅ គណិតវិទ្យា");
  });

  it("is empty for empty input rather than throwing", () => {
    expect(normalizeTitle(null)).toBe("");
    expect(normalizeTitle(undefined)).toBe("");
    expect(normalizeTitle("   ")).toBe("");
    expect(titleTokens("")).toEqual([]);
  });
});

describe("normalizeIsbn", () => {
  it("strips hyphens and spacing", () => {
    expect(normalizeIsbn("978-0-7879-7962-2")).toBe("9780787979622");
    expect(normalizeIsbn(" 978 0 7879 7962 2 ")).toBe("9780787979622");
  });

  it("collapses an ISBN-10 onto its ISBN-13 form so both spellings match", () => {
    // 0-306-40615-2 is the canonical worked example; its ISBN-13 is
    // 978-0-306-40615-7.
    expect(normalizeIsbn("0-306-40615-2")).toBe("9780306406157");
    expect(normalizeIsbn("0-306-40615-2")).toBe(normalizeIsbn("978-0-306-40615-7"));
  });

  it("keeps a trailing X, which is only ever an ISBN-10 check character", () => {
    expect(normalizeIsbn("080442957X")).toBe(isbn10To13("080442957X"));
  });

  it("rejects placeholders and junk", () => {
    for (const junk of ["N/A", "n/a", "NA", "", "   ", "123", "abcdefghij", null, undefined]) {
      expect(normalizeIsbn(junk as string), String(junk)).toBeNull();
    }
  });

  it("matches leniently on a mistyped ISBN — two rows sharing one is still one book twice", () => {
    // Check digit deliberately wrong on both sides. Refusing to match here
    // would keep the duplicate.
    expect(normalizeIsbn("9780306406150")).toBe(normalizeIsbn("978-0-306-40615-0"));
  });
});

describe("isbnMatchKeys", () => {
  it("returns both spellings a database row could hold", () => {
    const keys = isbnMatchKeys("978-0-306-40615-7");
    expect(keys).toContain("9780306406157");
    expect(keys).toContain("0306406152");
  });

  it("is empty when there is no usable ISBN", () => {
    expect(isbnMatchKeys("N/A")).toEqual([]);
    expect(isbnMatchKeys(null)).toEqual([]);
  });
});

describe("isbn conversion", () => {
  it("round-trips a 978-prefixed number", () => {
    expect(isbn13To10("9780306406157")).toBe("0306406152");
    expect(isbn10To13("0306406152")).toBe("9780306406157");
  });

  it("has no ISBN-10 for a 979-prefixed number", () => {
    expect(isbn13To10("9791234567896")).toBeNull();
  });
});

describe("validateIsbn", () => {
  it("separates empty, invalid and valid", () => {
    expect(validateIsbn("").status).toBe("empty");
    expect(validateIsbn("N/A").status).toBe("empty");
    expect(validateIsbn("9780306406150").status).toBe("invalid");
    expect(validateIsbn("978-0-306-40615-7").status).toBe("valid");
    expect(validateIsbn("0-306-40615-2").status).toBe("valid");
    expect(validateIsbn("0-306-40615-3").status).toBe("invalid");
  });

  it("reports the canonical ISBN-13 for a valid ISBN-10", () => {
    expect(validateIsbn("0-306-40615-2").canonical).toBe("9780306406157");
    expect(validateIsbn("0-306-40615-2").kind).toBe("isbn10");
  });
});

describe("editionMarker", () => {
  it("reads numeric, ordinal-word and Khmer edition statements", () => {
    expect(editionMarker("Mathematics, 2nd Edition")).toBe("2");
    expect(editionMarker("Mathematics — Third Edition")).toBe("3");
    expect(editionMarker("Research Methods, 5 ed.")).toBe("5");
    expect(editionMarker("គណិតវិទ្យា បោះពុម្ពលើកទី២")).toBe("2");
    expect(editionMarker("Biology, revised edition")).toBe("revised");
  });

  it("is null when a title declares no edition", () => {
    expect(editionMarker("Mathematics")).toBeNull();
    expect(editionMarker("")).toBeNull();
  });

  it("converts Khmer numerals so both scripts compare", () => {
    expect(khmerDigitsToAscii("៧")).toBe("7");
    expect(khmerDigitsToAscii("ថ្នាក់ទី១០")).toBe("ថ្នាក់ទី10");
  });
});

describe("person names", () => {
  it("strips honorifics and post-nominals", () => {
    expect(normalizePersonName("Dr. John Smith")).toBe("john smith");
    expect(normalizePersonName("Prof John Smith, PhD")).toBe("john smith");
    expect(normalizePersonName("  JOHN   SMITH ")).toBe("john smith");
  });

  it("keeps a middle initial, because dropping it merges two people", () => {
    expect(normalizePersonName("John A. Smith")).toBe("john a smith");
    expect(normalizePersonName("John A. Smith")).not.toBe(normalizePersonName("John Smith"));
  });

  it("handles Khmer names without folding them together", () => {
    expect(normalizePersonName("ឡុង សុវណ្ណារ៉ា")).toBe("ឡុង សុវណ្ណារ៉ា");
    expect(normalizePersonName("ឡុង សុវណ្ណារ៉ា")).not.toBe(normalizePersonName("ឡុង សុភា"));
  });

  it("offers an initials key as a SUGGESTION shape, not an identity", () => {
    expect(personInitialKey("John Smith")).toBe("j smith");
    expect(personInitialKey("J. Smith")).toBe("j smith");
    // Same suggestion key, different identity key — which is exactly why the
    // picker asks a human.
    expect(normalizePersonName("John Smith")).not.toBe(normalizePersonName("J. Smith"));
    expect(personInitialKey("Cher")).toBe("");
  });

  it("knows a placeholder author is not evidence", () => {
    for (const placeholder of ["", "Unknown", "unknown author", "Anonymous", "N/A"]) {
      expect(isMeaningfulAuthor(placeholder), placeholder).toBe(false);
    }
    expect(isMeaningfulAuthor("Sok Dara")).toBe(true);
  });
});

describe("normalizeTaxonomyValue", () => {
  it("resolves casing and padding variants of one value", () => {
    const canonical = normalizeTaxonomyValue("Education");
    for (const variant of ["education", " EDUCATION ", "Education"]) {
      expect(normalizeTaxonomyValue(variant), variant).toBe(canonical);
    }
  });

  it("keeps genuinely different values apart", () => {
    expect(normalizeTaxonomyValue("Education")).not.toBe(normalizeTaxonomyValue("Educational"));
  });
});

describe("titleWithoutEdition", () => {
  it("reduces two editions of one work to the same base", () => {
    expect(titleWithoutEdition("Mathematics, 2nd Edition"))
      .toBe(titleWithoutEdition("Mathematics, 3rd Edition"));
  });

  it("reduces a Khmer edition marker the same way", () => {
    expect(titleWithoutEdition("គណិតវិទ្យា បោះពុម្ពលើកទី២"))
      .toBe(titleWithoutEdition("គណិតវិទ្យា បោះពុម្ពលើកទី៣"));
  });

  it("leaves a title with no marker untouched", () => {
    expect(titleWithoutEdition("Mathematics")).toBe("mathematics");
  });

  it("does not mistake a grade number for an edition", () => {
    expect(titleWithoutEdition("Mathematics Grade 7")).toBe("mathematics grade 7");
  });
});
