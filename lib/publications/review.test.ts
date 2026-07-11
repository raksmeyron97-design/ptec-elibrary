import { describe, expect, it } from "vitest";

import { buildPublicationReview, type PublicationReviewInput } from "./review";

const validInput: PublicationReviewInput = {
  title: "Digital pedagogy adoption",
  title_km: "ការទទួលយកគរុកោសល្យឌីជីថល",
  slug: "digital-pedagogy-adoption",
  journal_name: "PTEC Journal of Education",
  volume: "12",
  issue_no: "3",
  page_start: "101",
  page_end: "118",
  doi: "10.1000/ptec.2026.001",
  publication_date: "2026-05-01",
  abstract: "Findings [cite:ref-a] and context [cite:ref-b].",
  abstract_km: "លទ្ធផល [cite:ref-a] និងបរិបទ [cite:ref-b]។",
  keywords: ["pedagogy"],
  subjects: ["Education"],
  license: "CC BY 4.0",
  cover_url: "https://cdn.example.org/cover.webp",
  hasPdf: true,
  authorshipCount: 2,
  references: [
    { id: "ref-a", text: "Smith, J. (2024). Teacher training." },
    { id: "ref-b", text: "Chan, D. (2023). Lesson study." },
  ],
};

describe("buildPublicationReview", () => {
  it("declares a complete publication publishable with no items", () => {
    const review = buildPublicationReview(validInput);
    expect(review.errors).toEqual([]);
    expect(review.warnings).toEqual([]);
    expect(review.publishable).toBe(true);
    expect(review.references).toHaveLength(2);
  });

  it("blocks on missing title, slug, PDF, and dangling citations", () => {
    const review = buildPublicationReview({
      ...validInput,
      title: " ",
      slug: "",
      hasPdf: false,
      abstract: "Dangling [cite:ref-missing].",
    });

    expect(review.publishable).toBe(false);
    expect(review.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "missing_title",
        "missing_slug",
        "missing_pdf",
        "missing_citation_target",
      ]),
    );
    const titleItem = review.errors.find((item) => item.code === "missing_title");
    expect(titleItem).toMatchObject({ step: "basic", field: "title" });
  });

  it("blocks invalid article DOI and out-of-range dates", () => {
    const review = buildPublicationReview({
      ...validInput,
      doi: "not-a-doi",
      publication_date: "1899-01-01",
    });
    expect(review.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining(["invalid_publication_doi", "invalid_publication_date"]),
    );
  });

  it("warns without blocking on uncited references, language mismatch, and gaps", () => {
    const review = buildPublicationReview({
      ...validInput,
      abstract: "No citations here.",
      abstract_km: "This Khmer field is actually full English text pasted by accident.",
      keywords: [],
      authorshipCount: 0,
      page_start: "118",
      page_end: "101",
    });

    expect(review.publishable).toBe(true);
    expect(review.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "uncited_references",
        "abstract_km_language",
        "missing_keywords",
        "no_authors",
        "page_range_reversed",
      ]),
    );
  });

  it("flags likely duplicate references by DOI", () => {
    const review = buildPublicationReview({
      ...validInput,
      abstract: "Cited [cite:ref-a] [cite:ref-b].",
      references: [
        { id: "ref-a", text: "Smith 2024.", doi: "10.1000/dup" },
        { id: "ref-b", text: "Smith, J. (2024) again.", doi: "10.1000/DUP" },
      ],
    });

    // A repeated DOI is already a blocking reference error; the duplicate
    // warning covers weaker matches (title+year) that validation allows.
    expect(
      review.items.some(
        (item) => item.code === "duplicate_doi" || item.code === "likely_duplicate_reference",
      ),
    ).toBe(true);
  });

  it("recommends optional enrichment instead of demanding it", () => {
    const review = buildPublicationReview({
      ...validInput,
      abstract_km: "",
      cover_url: null,
      license: "",
      subjects: [],
    });

    expect(review.publishable).toBe(true);
    expect(review.recommendations.map((item) => item.code)).toEqual(
      expect.arrayContaining(["no_khmer_abstract", "no_cover", "no_license", "no_subjects"]),
    );
  });
});
