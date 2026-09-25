import { describe, it, expect } from "vitest";
import { candidateToPrefill, joinAuthors } from "./prefill";
import type { IsbnCandidate } from "./types";

const base: IsbnCandidate = {
  provider: "open_library", providerRecordId: "/books/OL1M", title: "Effective Java", subtitle: null,
  authors: ["Joshua Bloch"], publisher: "Addison-Wesley Professional", year: 2017, language: "eng", pageCount: 416,
  edition: "3rd Edition", subjects: ["Java (Computer program language)", "Java (Computer program language)", " "],
  description: null, isbn13: "9780134685991", isbn10: "0134685997",
};

describe("candidateToPrefill", () => {
  it("maps the fields the Add form has, and nothing it would misfile", () => {
    const p = candidateToPrefill(base);
    expect(p).toEqual({
      title: "Effective Java", author: "Joshua Bloch", isbn: "9780134685991", publisher: "Addison-Wesley Professional",
      year: "2017", language: "en", keywords: ["Java (Computer program language)"], description: "",
    });
    expect(Object.keys(p)).not.toContain("category");
    expect(Object.keys(p)).not.toContain("coverUrl");
  });

  it("an unstated language follows the title's script — the importer's rule", () => {
    expect(candidateToPrefill({ ...base, language: null, title: "គណិតវិទ្យា ថ្នាក់ទី៤" }).language).toBe("km");
    expect(candidateToPrefill({ ...base, language: null }).language).toBe("en");
    expect(candidateToPrefill({ ...base, language: "ger" }).language).toBe("other");
  });

  it("keeps a subtitle when it fits", () => {
    expect(candidateToPrefill({ ...base, subtitle: "Best practices" }).title).toBe("Effective Java: Best practices");
    expect(candidateToPrefill({ ...base, subtitle: "x".repeat(400) }).title).toBe("Effective Java");
  });
});

describe("joinAuthors", () => {
  it("joins with the byline splitter's unambiguous delimiter", () => {
    expect(joinAuthors(["Louis Cohen", "Lawrence Manion", "Keith Morrison"])).toBe("Louis Cohen; Lawrence Manion; Keith Morrison");
  });
  it("keeps whole names only when the field would overflow", () => {
    expect(joinAuthors(["A".repeat(10), "B".repeat(10), "C".repeat(10)], 22)).toBe(`${"A".repeat(10)}; ${"B".repeat(10)}`);
  });
});
