import { describe, it, expect } from "vitest";
import {
  bookScholarMeta,
  thesisScholarMeta,
  publicationScholarMeta,
  formatScholarDate,
  splitAuthorNames,
  normalizeKeywords,
} from "./citation";
import type { Publication } from "@/lib/publications";

describe("formatScholarDate", () => {
  it("formats the first valid candidate as YYYY/MM/DD", () => {
    expect(formatScholarDate("2026-03-05", "2026-01-01")).toBe("2026/03/05");
  });

  it("skips null/invalid candidates and falls through", () => {
    expect(formatScholarDate(null, "not-a-date", "2025-12-25")).toBe("2025/12/25");
  });

  it("falls back to the current year when nothing parses", () => {
    expect(formatScholarDate(null, undefined)).toBe(String(new Date().getFullYear()));
  });
});

describe("splitAuthorNames", () => {
  it("splits a comma-joined byline and trims whitespace", () => {
    expect(splitAuthorNames("Sok San, Chan Dara")).toEqual(["Sok San", "Chan Dara"]);
  });

  it("returns an empty array for null/empty input", () => {
    expect(splitAuthorNames(null)).toEqual([]);
    expect(splitAuthorNames("")).toEqual([]);
  });
});

describe("normalizeKeywords", () => {
  it("passes through a text[] column unchanged (minus empties)", () => {
    expect(normalizeKeywords(["Pedagogy", "", "Assessment"])).toEqual(["Pedagogy", "Assessment"]);
  });

  it("splits a legacy comma-joined string", () => {
    expect(normalizeKeywords("Pedagogy, Assessment")).toEqual(["Pedagogy", "Assessment"]);
  });

  it("returns an empty array for null", () => {
    expect(normalizeKeywords(null)).toEqual([]);
  });
});

describe("bookScholarMeta", () => {
  const sampleRow = {
    id: "163f853f-e68c-4ae9-a23f-1f18ffa3e8b7",
    title: "PISA-D Assessment Framework",
    isbn: "978-1-234567-89-0",
    language: "English",
    published_at: "2024-06-15",
    tags: ["Assessment", "PISA"],
  };

  it("maps a sample row to Highwire citation_* tags", () => {
    const meta = bookScholarMeta(sampleRow, ["Jane Doe"]);
    expect(meta).toMatchObject({
      citation_title: "PISA-D Assessment Framework",
      citation_author: ["Jane Doe"],
      citation_publisher: "Phnom Penh Teacher Education College",
      citation_publication_date: "2024-06-15",
      citation_isbn: "978-1-234567-89-0",
      citation_language: "English",
      citation_keywords: "Assessment; PISA",
    });
    // Must point at the anonymously-readable file route, not a download
    // endpoint that would redirect or require auth for a crawler.
    expect(meta.citation_pdf_url).toBe(
      "https://library.ptec.edu.kh/api/books/163f853f-e68c-4ae9-a23f-1f18ffa3e8b7/file",
    );
  });

  it("omits citation_isbn for a placeholder N/A value", () => {
    const meta = bookScholarMeta({ ...sampleRow, isbn: "N/A" }, ["Jane Doe"]);
    expect(meta.citation_isbn).toBeUndefined();
  });

  it("omits citation_author when there are no authors", () => {
    const meta = bookScholarMeta(sampleRow, []);
    expect(meta.citation_author).toBeUndefined();
  });
});

describe("thesisScholarMeta", () => {
  const sampleRow = {
    id: "0338d7db-1b27-41bf-a0ab-dfc4d15efcb3",
    title: "Classroom Action Research in Rural Primary Schools",
    abstract: "A study of formative assessment practices.",
    author_names: "Sok San, Chan Dara",
    keywords: ["Action Research", "Primary Education"],
    doi: "10.1234/ptec.2026.001",
    published_at: "2026-05-01",
    created_at: "2026-01-10T00:00:00.000Z",
  };

  it("maps a sample row to Highwire citation_* tags", () => {
    const meta = thesisScholarMeta(sampleRow);
    expect(meta).toMatchObject({
      citation_title: "Classroom Action Research in Rural Primary Schools",
      citation_publication_date: "2026/05/01",
      citation_dissertation_institution: "Phnom Penh Teacher Education College",
      citation_author: ["Sok San", "Chan Dara"],
      citation_abstract: "A study of formative assessment practices.",
      citation_keywords: "Action Research; Primary Education",
      citation_doi: "10.1234/ptec.2026.001",
    });
  });

  it("points citation_pdf_url at /file (not /file.pdf, which 404s)", () => {
    const meta = thesisScholarMeta(sampleRow);
    expect(meta.citation_pdf_url).toBe(
      "https://library.ptec.edu.kh/api/theses/0338d7db-1b27-41bf-a0ab-dfc4d15efcb3/file",
    );
    expect(meta.citation_pdf_url).not.toMatch(/\.pdf$/);
  });

  it("falls back to created_at when published_at is missing", () => {
    const meta = thesisScholarMeta({ ...sampleRow, published_at: null });
    expect(meta.citation_publication_date).toBe("2026/01/10");
  });

  it("accepts a legacy comma-joined keywords string", () => {
    const meta = thesisScholarMeta({ ...sampleRow, keywords: "Action Research, Primary Education" });
    expect(meta.citation_keywords).toBe("Action Research; Primary Education");
  });
});

describe("publicationScholarMeta", () => {
  const samplePub: Publication = {
    id: "8c810742-aecf-4f20-a4fc-67c5a6d5365c",
    slug: "journal-of-chemical-education",
    title: "Inquiry-Based Learning in Secondary Chemistry",
    title_km: null,
    article_type: "article",
    journal_name: "Journal of Chemical Education",
    volume: "12",
    issue_no: "3",
    page_start: "101",
    page_end: "118",
    article_no: null,
    doi: "10.5678/jce.2026.012",
    publication_date: "2026-02-20",
    abstract: "An evaluation of inquiry-based chemistry instruction.",
    abstract_km: null,
    keywords: ["Chemistry Education", "Inquiry-Based Learning"],
    publisher: "PTEC Press",
    isbn: null,
    subjects: ["Science Education"],
    table_of_contents: [],
    learning_outcomes: [],
    faqs: [],
    license: null,
    copyright: null,
    language: "en",
    cover_url: null,
    pdf_url: "https://api.storage-ptec.online/files/publications/sample.pdf",
    references: [],
    is_published: true,
    published_at: "2026-02-20T00:00:00.000Z",
    view_count: 0,
    download_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    author_names: "Jane Doe, John Smith",
  };

  it("maps a sample row to Highwire citation_* tags", () => {
    const meta = publicationScholarMeta(samplePub);
    expect(meta).toMatchObject({
      citation_title: "Inquiry-Based Learning in Secondary Chemistry",
      citation_publication_date: "2026/02/20",
      citation_language: "en",
      citation_author: ["Jane Doe", "John Smith"],
      citation_journal_title: "Journal of Chemical Education",
      citation_volume: "12",
      citation_issue: "3",
      citation_firstpage: "101",
      citation_lastpage: "118",
      citation_doi: "10.5678/jce.2026.012",
      citation_publisher: "PTEC Press",
      citation_abstract: "An evaluation of inquiry-based chemistry instruction.",
    });
    expect(meta.citation_pdf_url).toBe(
      "https://library.ptec.edu.kh/api/publications/journal-of-chemical-education/file",
    );
  });

  it("merges keywords and subjects with de-duplication", () => {
    const meta = publicationScholarMeta({
      ...samplePub,
      keywords: ["Chemistry Education", "Overlap"],
      subjects: ["Overlap", "Science Education"],
    });
    expect(meta.citation_keywords).toBe("Chemistry Education; Overlap; Science Education");
  });
});
