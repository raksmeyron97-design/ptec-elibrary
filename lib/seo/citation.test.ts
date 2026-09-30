import { describe, it, expect } from "vitest";
import {
  bookScholarMeta,
  thesisScholarMeta,
  thesisCitationLocale,
  isCohortLabel,
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

  it("publishes a 1 January date as its year: a stored year, not a known day", () => {
    expect(formatScholarDate("2016-01-01")).toBe("2016");
    expect(formatScholarDate("2023-01-01T00:00:00+00:00")).toBe("2023");
  });

  it("publishes no date when nothing parses, never the current year", () => {
    // No date is published rather than an invented one (docs/seo F3/F9).
    expect(formatScholarDate(null, undefined)).toBeUndefined();
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
      citation_publication_date: "2024/06/15",
      citation_isbn: "978-1-234567-89-0",
      citation_language: "English",
      citation_keywords: "Assessment; PISA",
    });
    // Phase 3.7: a book's PDF needs a sign-in, so no PDF is named to Scholar.
    expect(meta.citation_pdf_url).toBeUndefined();
  });

  it("does NOT assert PTEC as citation_publisher (PTEC is the provider)", () => {
    const meta = bookScholarMeta(sampleRow, ["Jane Doe"]);
    expect(meta.citation_publisher).toBeUndefined();
  });

  it("emits citation_publisher only when the record names a real publisher", () => {
    const meta = bookScholarMeta({ ...sampleRow, publisher: "Routledge" }, ["Jane Doe"]);
    expect(meta.citation_publisher).toBe("Routledge");
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
    doi: "10.5281/ptec.2026.001",
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
      citation_doi: "10.5281/ptec.2026.001",
    });
  });

  it("drops a placeholder DOI (10.1234/…) instead of publishing it", () => {
    const meta = thesisScholarMeta({ ...sampleRow, doi: "10.1234/eds" });
    expect(meta.citation_doi).toBeUndefined();
  });

  it("names a PDF only when the caller hands it a public full text", () => {
    // Phase 3.4: the old /api/theses/<id>/file answered 401 anonymously and
    // sits under a robots-blocked path — never a URL Scholar could fetch.
    expect(thesisScholarMeta(sampleRow).citation_pdf_url).toBeUndefined();
    const pdfUrl = "https://library.ptec.edu.kh/theses/my-thesis/fulltext.pdf";
    expect(thesisScholarMeta(sampleRow, undefined, { pdfUrl }).citation_pdf_url).toBe(pdfUrl);
  });

  it("never lists a cohort label as an author", () => {
    const meta = thesisScholarMeta({ ...sampleRow, author_names: "គរុនិស្សិត ១២+៤ ជំនាន់ទី២, Sok San" });
    expect(meta.citation_author).toEqual(["Sok San"]);
    expect(isCohortLabel("Cohort 2023")).toBe(true);
    expect(isCohortLabel("Sok Dara")).toBe(false);
  });

  it("emits tags only on the page in the work's language", () => {
    const km = { ...sampleRow, language: "km" };
    expect(thesisScholarMeta(km, undefined, { locale: "en" })).toEqual({});
    expect(thesisScholarMeta(km, undefined, { locale: "km" }).citation_title).toBe(sampleRow.title);
    expect(thesisScholarMeta(km, undefined, { locale: "km" }).citation_language).toBe("km");
    expect(thesisCitationLocale({ language: "km_en", title: "x" })).toBe("km");
    expect(thesisCitationLocale({ language: null, title: "ការស្រាវជ្រាវ" })).toBe("km");
    expect(thesisCitationLocale({ language: null, title: "Research" })).toBe("en");
  });

  it("a research report carries the technical-report tags instead of the dissertation tag", () => {
    const meta = thesisScholarMeta({ ...sampleRow, thesis_type: "research_report", report_number: "PTEC-RR-2024-03" });
    expect(meta.citation_dissertation_institution).toBeUndefined();
    expect(meta.citation_technical_report_institution).toBe("Phnom Penh Teacher Education College");
    expect(meta.citation_technical_report_number).toBe("PTEC-RR-2024-03");
  });

  it("names the abstract page it sits on", () => {
    const abstractUrl = "https://library.ptec.edu.kh/theses/my-thesis";
    expect(thesisScholarMeta(sampleRow, undefined, { abstractUrl }).citation_abstract_html_url).toBe(abstractUrl);
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
    issn: null,
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
    seo_title: null,
    seo_description: null,
    og_image: null,
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
    // Phase 3.7: no PDF unless the caller hands over a public full text.
    expect(meta.citation_pdf_url).toBeUndefined();
    const pdfUrl = "https://library.ptec.edu.kh/journals/articles/journal-of-chemical-education/fulltext.pdf";
    expect(publicationScholarMeta(samplePub, { pdfUrl }).citation_pdf_url).toBe(pdfUrl);
  });

  it("emits a validated ISSN, never a reviewed-book ISBN, and drops a bad DOI", () => {
    const meta = publicationScholarMeta({
      ...samplePub,
      doi: "10.1234/eds", // placeholder → dropped
      issn: "0021-9584", // valid ISSN → emitted
      isbn: "978-0-470-50552-6", // reviewed book's ISBN → NOT emitted as citation_isbn
    });
    expect(meta.citation_doi).toBeUndefined();
    expect(meta.citation_issn).toBe("0021-9584");
    expect(meta.citation_isbn).toBeUndefined();
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
