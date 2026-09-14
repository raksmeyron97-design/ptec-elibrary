import { describe, expect, it } from "vitest";
import {
  ARTICLE_SECTIONS,
  affiliationMarkers,
  articleDates,
  articleSections,
  dedupeScholarship,
  type ArticleSectionFlags,
  type ArticleSectionId,
} from "@/lib/publications/article-layout";
import type { PublicationAffiliation, PublicationAuthorship } from "@/lib/publications";

const labels = Object.fromEntries(ARTICLE_SECTIONS.map((id) => [id, `L:${id}`])) as Record<ArticleSectionId, string>;
const none = Object.fromEntries(ARTICLE_SECTIONS.map((id) => [id, false])) as ArticleSectionFlags;

describe("articleSections — no dead anchors", () => {
  it("lists only the sections that rendered, in reading order", () => {
    const has = { ...none, related: true, abstract: true, references: true };
    expect(articleSections(has, labels).map((s) => s.id)).toEqual(["abstract", "references", "related"]);
  });

  it("is empty when nothing rendered — the nav then renders nothing", () => {
    expect(articleSections(none, labels)).toEqual([]);
  });

  it("carries each section's own label", () => {
    expect(articleSections({ ...none, figures: true }, labels)).toEqual([{ id: "figures", label: "L:figures" }]);
  });

  it("orders the body the way a scholarly article reads", () => {
    expect(ARTICLE_SECTIONS.indexOf("abstract")).toBeLessThan(ARTICLE_SECTIONS.indexOf("fulltext"));
    expect(ARTICLE_SECTIONS.indexOf("fulltext")).toBeLessThan(ARTICLE_SECTIONS.indexOf("figures"));
    expect(ARTICLE_SECTIONS.indexOf("figures")).toBeLessThan(ARTICLE_SECTIONS.indexOf("references"));
    expect(ARTICLE_SECTIONS.indexOf("references")).toBeLessThan(ARTICLE_SECTIONS.indexOf("authors"));
    expect(ARTICLE_SECTIONS.at(-1)).toBe("related");
  });
});

describe("dedupeScholarship — each related item shown once", () => {
  const rel = (id: string, reason = "keywords") => ({ publication: { id }, reason });

  it("keeps an item in the strongest block only: journal > authors > related", () => {
    const out = dedupeScholarship({
      journal: [{ id: "j1" }, { id: "both" }],
      authors: [{ id: "both" }, { id: "a1" }],
      related: [rel("both", "journal"), rel("a1", "author"), rel("r1")],
      relatedId: (r) => r.publication.id,
    });
    expect(out.journal.map((j) => j.id)).toEqual(["j1", "both"]);
    expect(out.authors.map((a) => a.id)).toEqual(["a1"]);
    expect(out.related.map((r) => r.publication.id)).toEqual(["r1"]);
  });

  it("reproduces the live duplicate: an author's other article is not also a related article", () => {
    // Production, 2026-09-14: "The Challenge of Enhancing Teacher Professional
    // Identity…" appeared in More from this author AND in Related Articles.
    const out = dedupeScholarship({
      journal: [],
      authors: [{ id: "challenge" }],
      related: [rel("challenge", "author")],
      relatedId: (r) => r.publication.id,
    });
    expect(out.authors).toHaveLength(1);
    expect(out.related).toHaveLength(0);
  });

  it("preserves each list's own order and adds nothing", () => {
    const out = dedupeScholarship({
      journal: [{ id: "b" }, { id: "a" }],
      authors: [{ id: "d" }, { id: "c" }],
      related: [rel("f"), rel("e")],
      relatedId: (r) => r.publication.id,
    });
    expect([...out.journal, ...out.authors].map((x) => x.id)).toEqual(["b", "a", "d", "c"]);
    expect(out.related.map((r) => r.publication.id)).toEqual(["f", "e"]);
  });
});

describe("articleDates — the record's own dates, never invented", () => {
  it("leads with the article's own publication date", () => {
    expect(articleDates({ publicationDate: "2014-09-17", publishedAt: "2026-05-01T10:00:00Z", issueDate: null })).toEqual({
      published: "2014-09-17",
      issue: null,
    });
  });

  it("falls back to the library's publish date when the article states none", () => {
    expect(articleDates({ publicationDate: null, publishedAt: "2025-02-04T00:00:00Z", issueDate: null }).published).toBe(
      "2025-02-04T00:00:00Z",
    );
  });

  it("adds the issue date only when it is a different day", () => {
    expect(articleDates({ publicationDate: "2014-09-17", publishedAt: null, issueDate: "2014-11-11" }).issue).toBe("2014-11-11");
    expect(articleDates({ publicationDate: "2014-11-11", publishedAt: null, issueDate: "2014-11-11" }).issue).toBeNull();
    // A timestamp on the same calendar day is still the same day.
    expect(articleDates({ publicationDate: "2014-11-11", publishedAt: null, issueDate: "2014-11-11T00:00:00Z" }).issue).toBeNull();
  });

  it("states nothing rather than a bad date", () => {
    expect(articleDates({ publicationDate: "not a date", publishedAt: null, issueDate: "also not" })).toEqual({
      published: null,
      issue: null,
    });
  });
});

describe("affiliationMarkers — numbered by first appearance", () => {
  const aff = (id: string): PublicationAffiliation => ({ id, name: id, name_km: null, city: null, country: null });
  const who = (id: string, affiliation_ids: string[], author_order = 1): PublicationAuthorship => ({
    author: { id, full_name: id, full_name_km: null, orcid: null, email: null, bio: null, bio_km: null, photo_url: null },
    author_order,
    is_corresponding: false,
    affiliation_ids,
  });

  it("numbers left to right across the byline, once per affiliation", () => {
    const { markerFor, ordered } = affiliationMarkers(
      [who("a", ["okayama", "ptec"]), who("b", ["ptec"]), who("c", ["rupp"])],
      [aff("ptec"), aff("rupp"), aff("okayama")],
    );
    expect([...markerFor.entries()]).toEqual([["okayama", 1], ["ptec", 2], ["rupp", 3]]);
    expect(ordered.map((o) => [o.marker, o.affiliation.id])).toEqual([[1, "okayama"], [2, "ptec"], [3, "rupp"]]);
  });

  it("never gives a marker to an affiliation that did not load", () => {
    const { markerFor, ordered } = affiliationMarkers([who("a", ["gone", "ptec"])], [aff("ptec")]);
    expect(markerFor.has("gone")).toBe(false);
    expect(markerFor.get("ptec")).toBe(1);
    expect(ordered).toHaveLength(1);
  });

  it("is empty for a byline with no affiliations", () => {
    expect(affiliationMarkers([who("a", [])], []).ordered).toEqual([]);
  });
});
