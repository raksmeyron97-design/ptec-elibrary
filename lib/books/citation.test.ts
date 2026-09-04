import { describe, expect, it } from "vitest";
import { chicago, inTextReference, mla, type CitationWork } from "@/lib/citations";
import { bookPageReference, hasCitableMetadata, toChicago, toMLA } from "./citation";
import type { Book } from "@/lib/book-utils";

const book: Book = {
  slug: "teaching-mathematics",
  title: "Teaching Mathematics in Cambodia",
  author: "Sok San, Chan Dara",
  isbn: "978-9-99-999999-9",
  publisher: "MoEYS Publishing",
  department: "Mathematics",
  category: "Textbook",
  language: "km",
  year: 2024,
  format: "PDF",
  availability: "Digital",
  rating: 0,
  pages: 240,
  summary: "",
  cover: "bg-blue-950",
  tags: [],
};

const work: CitationWork = {
  kind: "book",
  title: "Teaching Mathematics in Cambodia",
  authors: ["Sok San", "Chan Dara"],
  year: "2024",
  publisher: "MoEYS Publishing",
  url: "https://library.ptec.edu.kh/books/teaching-mathematics",
};

describe("mla (generic)", () => {
  it("formats a book", () => {
    expect(mla(work)).toBe(
      "Sok San, Chan Dara. Teaching Mathematics in Cambodia. MoEYS Publishing, 2024. https://library.ptec.edu.kh/books/teaching-mathematics.",
    );
  });
  it("uses placeholders rather than inventing a year or author", () => {
    expect(mla({ ...work, authors: [], year: null, publisher: null })).toBe(
      "Unknown author. Teaching Mathematics in Cambodia. n.d. https://library.ptec.edu.kh/books/teaching-mathematics.",
    );
  });
  it("formats an article with its venue", () => {
    expect(
      mla({ ...work, kind: "article", journal: "PTEC Journal", volume: "12", issue: "3", pageStart: "101", pageEnd: "118", doi: "10.1/x" }),
    ).toBe('Sok San, Chan Dara. "Teaching Mathematics in Cambodia." PTEC Journal, vol. 12, no. 3, 2024, pp. 101–118. https://doi.org/10.1/x.');
  });
});

describe("chicago (generic)", () => {
  it("formats a book author-date style", () => {
    expect(chicago(work)).toBe(
      "Sok San, Chan Dara. 2024. Teaching Mathematics in Cambodia. MoEYS Publishing. https://library.ptec.edu.kh/books/teaching-mathematics.",
    );
  });
  it("adds the note type for theses", () => {
    expect(chicago({ ...work, kind: "thesis", noteType: "Thesis", publisher: "PTEC" })).toContain("Teaching Mathematics in Cambodia. Thesis. PTEC.");
  });
});

describe("inTextReference", () => {
  it("cites one, two, or many authors with the page", () => {
    expect(inTextReference({ ...work, authors: ["Sok San"] }, 42)).toBe("(Sok San, 2024, p. 42)");
    expect(inTextReference(work, 42)).toBe("(Sok San & Chan Dara, 2024, p. 42)");
    expect(inTextReference({ ...work, authors: ["A", "B", "C"] }, 7)).toBe("(A et al., 2024, p. 7)");
  });
  it("falls back to the title and n.d.", () => {
    expect(inTextReference({ ...work, authors: [], year: null }, 3)).toBe("(Teaching Mathematics in Cambodia, n.d., p. 3)");
  });
});

describe("book adapters", () => {
  it("delegate to the generic formatters over the same CitationWork as APA", () => {
    expect(toMLA(book)).toContain("Sok San, Chan Dara. Teaching Mathematics in Cambodia. MoEYS Publishing, 2024.");
    expect(toChicago(book)).toContain("Sok San, Chan Dara. 2024. Teaching Mathematics in Cambodia. MoEYS Publishing.");
    expect(bookPageReference(book, 12)).toBe("(Sok San & Chan Dara, 2024, p. 12)");
  });
  it("only offers a citation when the record can carry one", () => {
    expect(hasCitableMetadata(work)).toBe(true);
    expect(hasCitableMetadata({ ...work, authors: [], year: null })).toBe(false);
    expect(hasCitableMetadata({ ...work, authors: [] })).toBe(true);
    expect(hasCitableMetadata({ ...work, title: " " })).toBe(false);
  });
});
