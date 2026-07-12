import { describe, it, expect } from "vitest";
import { evaluateQuality } from "./metadata-quality";

const fullBook = {
  title: "គណិតវិទ្យាថ្នាក់ទី១២", // Khmer title must count as present
  authors: { name: "សុខ សុភា" },
  language: "km",
  published_at: "2021-01-01",
  description: "A complete grade-12 mathematics textbook aligned with the MoEYS curriculum, covering algebra and calculus.",
  license: "moeys_open",
  cover_url: "https://cdn.example/covers/math12.webp",
  source_attribution: "MoEYS",
  category_id: "11111111-1111-1111-1111-111111111111",
  isbn: "978-9924-000-00-0",
  pages: 320,
  tags: ["mathematics", "grade-12"],
};

describe("evaluateQuality — books", () => {
  it("scores a complete record as A with no missing required fields", () => {
    const report = evaluateQuality("book", fullBook);
    expect(report.grade).toBe("A");
    expect(report.missingRequired).toEqual([]);
    expect(report.items.find((i) => i.key === "citation")?.status).toBe("ok");
  });

  it("flags missing required fields on an empty record", () => {
    const report = evaluateQuality("book", {});
    expect(report.missingRequired).toContain("Title");
    expect(report.missingRequired).toContain("Author / contributor");
    expect(report.missingRequired).toContain("Language");
    expect(report.score).toBeLessThan(30);
  });

  it("treats license 'unknown' as weak, not ok (blocks external feeds)", () => {
    const report = evaluateQuality("book", { ...fullBook, license: "unknown" });
    const lic = report.items.find((i) => i.key === "license");
    expect(lic?.status).toBe("weak");
    expect(lic?.hint).toMatch(/feeds/i);
  });

  it("treats page count of 1 as a placeholder", () => {
    const report = evaluateQuality("book", { ...fullBook, pages: 1 });
    expect(report.items.find((i) => i.key === "pages")?.status).toBe("weak");
  });

  it("marks an invalid year weak instead of failing the record", () => {
    const report = evaluateQuality("book", { ...fullBook, published_at: "0001-01-01" });
    expect(report.items.find((i) => i.key === "year")?.status).toBe("weak");
  });

  it("citation readiness degrades when author is missing", () => {
    const report = evaluateQuality("book", { ...fullBook, authors: null });
    const cite = report.items.find((i) => i.key === "citation");
    expect(cite?.status).toBe("weak");
    expect(cite?.hint).toMatch(/author/i);
  });
});

describe("evaluateQuality — theses", () => {
  it("requires the PDF file", () => {
    const report = evaluateQuality("thesis", {
      title: "T", author_names: "A", language: "km", abstract: "x".repeat(60),
    });
    expect(report.missingRequired).toContain("File (PDF)");
  });

  it("accepts academic_year as the year source", () => {
    const report = evaluateQuality("thesis", {
      title: "T", author_names: "A", language: "km", file_url: "https://x/f.pdf",
      academic_year: "2023-2024",
    });
    expect(report.items.find((i) => i.key === "year")?.status).toBe("ok");
  });
});

describe("evaluateQuality — publications", () => {
  it("uses publication_date and journal fields", () => {
    const report = evaluateQuality("publication", {
      title: "P", author_names: "A. Author", language: "en",
      publication_date: "2025-03-01", abstract: "y".repeat(80),
      journal_name: "PTEC Journal", doi: "10.1234/x", keywords: ["education"],
      license: "CC BY 4.0",
    });
    expect(report.items.find((i) => i.key === "journal")?.status).toBe("ok");
    expect(report.items.find((i) => i.key === "doi")?.status).toBe("ok");
    expect(report.grade).not.toBe("D");
  });
});
