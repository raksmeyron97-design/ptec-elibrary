import { describe, it, expect } from "vitest";
import { marcForEnrichment, mergeIsbnCandidates, planIsbnFill, titlesLookAlike, type CurrentRecord } from "./enrich";
import type { IsbnCandidate } from "./types";

const ol: IsbnCandidate = {
  provider: "open_library", providerRecordId: "/books/OL1M", title: "Strategic Management for School Development", subtitle: null,
  authors: ["Brian Fidler"], publisher: "Paul Chapman Educational Publishing", year: 2002, language: "eng", pageCount: 208,
  edition: null, subjects: ["School management and organization"], description: null,
  coverSource: "https://covers.openlibrary.org/b/id/123-L.jpg", isbn13: "9780761965268", isbn10: "0761965262",
};
const gb: IsbnCandidate = {
  ...ol, provider: "google_books", providerRecordId: "abc", publisher: "SAGE", year: 2002, language: "en",
  subjects: ["Education", "School management and organization"], description: "How schools plan.", coverSource: null,
};

const blank: CurrentRecord = { description: "", publisher: "", year: "", language: "en", keywords: [], coverIsGenerated: true };

describe("mergeIsbnCandidates", () => {
  it("takes the description from Google, edition facts and the cover from Open Library", () => {
    const m = mergeIsbnCandidates([gb, ol])!;
    expect(m.description).toEqual({ value: "How schools plan.", provider: "google_books" });
    expect(m.publisher).toEqual({ value: "Paul Chapman Educational Publishing", provider: "open_library" });
    expect(m.year).toEqual({ value: 2002, provider: "open_library" });
    expect(m.language).toEqual({ value: "en", provider: "open_library" });
    expect(m.coverImportUrl?.value).toBe("https://covers.openlibrary.org/b/id/123-L.jpg");
    expect(m.keywords?.value).toEqual(["School management and organization", "Education"]);
  });

  it("falls back to the other provider when the preferred one has nothing", () => {
    const m = mergeIsbnCandidates([{ ...ol, publisher: null, year: null }, gb])!;
    expect(m.publisher).toEqual({ value: "SAGE", provider: "google_books" });
    expect(m.year?.provider).toBe("google_books");
  });

  it("never guesses a language the providers did not state, and never offers an off-list cover", () => {
    const m = mergeIsbnCandidates([{ ...ol, language: null, coverSource: "https://evil.example/x.jpg" }])!;
    expect(m.language).toBeNull();
    expect(m.coverImportUrl).toBeNull();
  });

  it("is null without candidates", () => {
    expect(mergeIsbnCandidates([])).toBeNull();
  });
});

describe("titlesLookAlike", () => {
  it("accepts case, punctuation and a subtitle on one side only", () => {
    expect(titlesLookAlike(
      "Strategic management for school development : leading your school's improvement strategy",
      "Strategic Management for School Development",
    )).toBe(true);
  });

  it("rejects a different book with a shared word — the ISBN given for Fidler's book", () => {
    expect(titlesLookAlike("Strategic management for school development : leading your school's improvement strategy", "Educational management today")).toBe(false);
  });

  it("compares Khmer by its letters, since it is not space-delimited", () => {
    expect(titlesLookAlike("គណិតវិទ្យា ថ្នាក់ទី៤", "គណិតវិទ្យាថ្នាក់ទី៤")).toBe(true);
    expect(titlesLookAlike("គណិតវិទ្យា ថ្នាក់ទី៤", "ភាសាខ្មែរ")).toBe(false);
  });
});

describe("planIsbnFill", () => {
  const found = mergeIsbnCandidates([gb, ol])!;

  it("fills every empty field, cover included when the record has none", () => {
    const p = planIsbnFill(blank, found);
    expect(p.fill).toEqual({
      description: "How schools plan.", publisher: "Paul Chapman Educational Publishing", year: "2002",
      keywords: ["School management and organization", "Education"], cover: "https://covers.openlibrary.org/b/id/123-L.jpg",
    });
    expect(p.conflicts).toEqual([]);
    expect(p.sources.description).toBe("google_books");
  });

  it("never overwrites: a different value is a conflict, an equal one is nothing", () => {
    const p = planIsbnFill({ ...blank, publisher: "paul chapman educational publishing ", year: "2001", description: "Ours." }, found);
    expect(p.fill.publisher).toBeUndefined();
    expect(p.fill.year).toBeUndefined();
    expect(p.conflicts).toEqual([
      { field: "description", current: "Ours.", found: "How schools plan." },
      { field: "year", current: "2001", found: "2002" },
    ]);
  });

  it("suggests replacing a description that only restates the record", () => {
    const p = planIsbnFill({ ...blank, description: "Education by Fidler Brian.", descriptionIsDerived: true }, found);
    expect(p.fill.description).toBeUndefined();
    expect(p.conflicts).toEqual([{ field: "description", current: "Education by Fidler Brian.", found: "How schools plan.", suggested: true }]);
  });

  it("asks before changing the language, and leaves chosen keywords and covers alone", () => {
    const p = planIsbnFill({ ...blank, language: "km", keywords: ["ការគ្រប់គ្រង"], coverIsGenerated: false }, found);
    expect(p.conflicts).toEqual([{ field: "language", current: "km", found: "en" }]);
    expect(p.fill.keywords).toBeUndefined();
    expect(p.fill.cover).toBeUndefined();
  });
});

describe("marcForEnrichment", () => {
  it("writes the Koha fields for the same values", () => {
    expect(marcForEnrichment({
      isbn: "9780761965268", publisher: "Paul Chapman", year: 2002, language: "en",
      description: "Line one.\n\nLine two.", keywords: ["Schools"],
    })).toEqual([
      "020    $a 9780761965268",
      "041 0  $a eng",
      "264  1 $b Paul Chapman, $c 2002",
      "520    $a Line one. Line two.",
      "653  0 $a Schools",
    ]);
  });

  it("writes 264 with only the part it has", () => {
    expect(marcForEnrichment({ year: 1996 })).toEqual(["264  1 $c 1996"]);
    expect(marcForEnrichment({ publisher: "SIPAR" })).toEqual(["264  1 $b SIPAR"]);
  });
});
