import { describe, it, expect } from "vitest";
import { scoreBookSeo, type BookSeoFields } from "./book-seo-score";

const full: BookSeoFields = {
  title: "Methods in Educational Research",
  summary:
    "A comprehensive, practice-oriented guide to designing and conducting rigorous educational research studies.",
  author: "Marguerite Lodico",
  language: "English",
  isbn: "978-0-7879-7962-2",
  publisher: "Jossey-Bass",
  year: 2010,
  pages: 480,
  tags: ["research"],
  coverPresent: true,
};

const empty: BookSeoFields = {
  title: "Action Research Top 10",
  summary: "",
  author: "Unknown",
  language: "",
  isbn: "",
  publisher: "",
  year: null,
  pages: 1,
  tags: [],
  coverPresent: false,
};

describe("scoreBookSeo", () => {
  it("scores a fully-populated record at 100%", () => {
    const { percent, checks } = scoreBookSeo(full);
    expect(percent).toBe(100);
    expect(checks.every((c) => c.status === "ok")).toBe(true);
  });

  it("flags each missing weighted field on a bare record", () => {
    const { percent, checks } = scoreBookSeo(empty);
    expect(percent).toBeLessThan(30);
    const byId = Object.fromEntries(checks.map((c) => [c.id, c.status]));
    expect(byId.description).toBe("missing");
    expect(byId.cover).toBe("missing");
    expect(byId.author).toBe("missing"); // "Unknown" is not a known author
    expect(byId.year).toBe("missing");
    expect(byId.pages).toBe("missing"); // pages:1 sentinel
    expect(byId.language).toBe("missing");
  });

  it("warns (does not fail) on a short description", () => {
    const { checks } = scoreBookSeo({ ...full, summary: "Too short." });
    expect(checks.find((c) => c.id === "description")!.status).toBe("warn");
  });

  it("treats ISBN/publisher/tags as optional (unweighted)", () => {
    const { checks, percent } = scoreBookSeo({ ...full, isbn: "", publisher: "", tags: [] });
    // Still 100% — the optional fields don't reduce the weighted score.
    expect(percent).toBe(100);
    expect(checks.find((c) => c.id === "isbn")!.weighted).toBe(false);
    expect(checks.find((c) => c.id === "publisher")!.status).toBe("warn");
  });
});
