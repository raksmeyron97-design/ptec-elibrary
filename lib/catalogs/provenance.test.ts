import { describe, expect, it } from "vitest";
import { canonicalValue, parseHints, provenanceView, readFieldSources, type ProvenanceRecord } from "./provenance";

const rec = (over: Partial<ProvenanceRecord> = {}): ProvenanceRecord => ({
  title: "Visible Learning", author: "Hattie, John", isbn: null, publisher: null, year: null, language: "en",
  category: null, description: null, keywords: null, cover_url: null, ...over,
});

describe("canonical values", () => {
  it("ignore whitespace and composition, and treat a number and its text alike", () => {
    expect(canonicalValue("title", rec({ title: "  Visible   Learning " }))).toBe("Visible Learning");
    expect(canonicalValue("year", rec({ year: 2009 }))).toBe(canonicalValue("year", rec({ year: "2009" })));
  });
  it("keep keyword order and drop blanks; an empty value is empty", () => {
    expect(canonicalValue("keywords", rec({ keywords: ["a", " ", "b"] }))).toBe("a\u001fb");
    expect(canonicalValue("keywords", rec({ keywords: ["b", "a"] }))).not.toBe(canonicalValue("keywords", rec({ keywords: ["a", "b"] })));
    expect(canonicalValue("publisher", rec())).toBe("");
  });
});

describe("hints from the browser are validated, never trusted", () => {
  it("drops unknown fields and sources, keeps one hint per field, and only accepts an ISBN-13", () => {
    const hints = parseHints([
      { field: "publisher", source: "open_library", isbn13: "9780306406157" },
      { field: "publisher", source: "librarian" },
      { field: "is_active", source: "librarian" },
      { field: "year", source: "wikipedia" },
      { field: "description", source: "publisher", host: "link.springer.com", isbn13: "123" },
    ]);
    expect(hints).toEqual([
      { field: "publisher", source: "librarian", isbn13: null, host: null },
      { field: "description", source: "publisher", isbn13: null, host: "link.springer.com" },
    ]);
    expect(parseHints("nope")).toEqual([]);
  });

  it("reading stored sources drops malformed entries", () => {
    expect(readFieldSources({ publisher: { source: "open_library", by: "u", at: "t", hash: "h" }, year: { source: "made_up" }, junk: 1 })).toEqual({
      publisher: { source: "open_library", by: "u", at: "t", hash: "h" },
    });
    expect(readFieldSources(null)).toEqual({});
  });
});

describe("what a librarian is told", () => {
  const entry = { source: "open_library" as const, by: "u1", at: "2026-10-05T08:00:00Z", hash: "aaa" };
  const base = { field: "publisher" as const, hasValue: true, currentHash: "aaa", entry, kohaLinked: true, verifiedAndUnchanged: false };

  it("a recorded source whose value is unchanged is that source, accepted", () => {
    expect(provenanceView(base)).toMatchObject({ source: "open_library", state: "accepted", by: "u1" });
  });
  it("a value changed since it was recorded says so, and names what it had been", () => {
    expect(provenanceView({ ...base, currentHash: "bbb" })).toMatchObject({ source: "koha", state: "changed", previousSource: "open_library" });
  });
  it("no record → the record's origin, never a provider; Koha for a linked record", () => {
    expect(provenanceView({ ...base, entry: undefined })).toMatchObject({ source: "koha", state: "imported" });
    expect(provenanceView({ ...base, entry: undefined, kohaLinked: false })).toMatchObject({ source: "elibrary", state: "imported" });
  });
  it("verified and unchanged reads as verified; an empty field is not listed", () => {
    expect(provenanceView({ ...base, entry: undefined, verifiedAndUnchanged: true })).toMatchObject({ state: "verified" });
    expect(provenanceView({ ...base, hasValue: false })).toBeNull();
  });
});
