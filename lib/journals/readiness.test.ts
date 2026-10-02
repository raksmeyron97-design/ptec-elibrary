import { describe, expect, it } from "vitest";
import { journalReadiness } from "./readiness";

const empty = {
  title: "Southeast Asian Review of Education",
  title_km: null,
  title_km_source: null,
  issn: null,
  e_issn: null,
  print_issn: null,
  publisher_name: null,
  description: null,
  access_model: null,
  peer_review: null,
  indexed_in: [],
  language: null,
  country: null,
  frequency: null,
  website_url: null,
  cover_url: null,
  is_published: true,
  is_indexable: true,
  articleCount: 1,
} as const;

describe("journalReadiness", () => {
  it("a name-only journal is incomplete but still indexable once it holds an article", () => {
    const r = journalReadiness({ ...empty, indexed_in: [] });
    expect(r.checks.find((c) => c.id === "identity")?.ok).toBe(true);
    expect(r.checks.filter((c) => !c.ok).map((c) => c.id)).toContain("issn");
    expect(r.score).toBeLessThan(30);
    expect(r.indexing).toBe("indexed");
  });

  it("a complete record scores 100", () => {
    const r = journalReadiness({
      ...empty,
      title_km: "ទស្សនាវដ្ដី",
      title_km_source: "official",
      print_issn: "0021-9584",
      publisher_name: "ACS",
      description: "About.",
      access_model: "hybrid",
      peer_review: "single_blind",
      indexed_in: ["scopus"],
      language: "en",
      country: "US",
      frequency: "monthly",
      website_url: "https://example.org",
      cover_url: "https://example.org/c.jpg",
    });
    expect(r.score).toBe(100);
    expect(r.invalidIssns).toEqual([]);
  });

  it("an invalid ISSN is a warning and does not count as an identifier", () => {
    const r = journalReadiness({ ...empty, issn: "2789-0001", indexed_in: [] });
    expect(r.invalidIssns).toEqual(["2789-0001"]);
    expect(r.checks.find((c) => c.id === "issn")?.ok).toBe(false);
  });

  it("a Khmer title without a stated source asks the librarian to state it", () => {
    const r = journalReadiness({ ...empty, title_km: "ទស្សនាវដ្ដី", indexed_in: [] });
    expect(r.checks.find((c) => c.id === "khmerTitleSource")?.ok).toBe(false);
  });

  it("states the indexing rule the public page applies", () => {
    expect(journalReadiness({ ...empty, is_published: false, indexed_in: [] }).indexing).toBe("unpublished");
    expect(journalReadiness({ ...empty, is_indexable: false, indexed_in: [] }).indexing).toBe("optedOut");
    expect(journalReadiness({ ...empty, articleCount: 0, indexed_in: [] }).indexing).toBe("noArticles");
  });
});
