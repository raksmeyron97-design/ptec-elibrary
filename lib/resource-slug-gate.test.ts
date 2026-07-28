import { describe, it, expect } from "vitest";
import { resolveSlugGate, RESOURCE_GATES } from "@/lib/resource-slug-gate";

describe("resolveSlugGate — pure published-slug existence", () => {
  const live = new Set(["thesis-one", "thesis-two"]);

  it("returns ok for a known published slug", () => {
    expect(resolveSlugGate("thesis-one", live)).toEqual({ kind: "ok" });
  });

  it("returns not-found for an unknown slug", () => {
    expect(resolveSlugGate("nope-xyz", live)).toEqual({ kind: "not-found" });
    expect(resolveSlugGate("", live)).toEqual({ kind: "not-found" });
  });

  it("does no fuzzy matching — exact slug only", () => {
    expect(resolveSlugGate("thesis-on", live)).toEqual({ kind: "not-found" });
    expect(resolveSlugGate("THESIS-ONE", live)).toEqual({ kind: "not-found" });
  });
});

describe("RESOURCE_GATES config maps each type to its real table + public column", () => {
  it("theses gate reads research_reports.is_published", () => {
    expect(RESOURCE_GATES.theses).toEqual({
      table: "research_reports",
      publishedColumn: "is_published",
    });
  });

  it("publications gate reads publications.is_published", () => {
    expect(RESOURCE_GATES.publications).toEqual({
      table: "publications",
      publishedColumn: "is_published",
    });
  });

  it("catalogs gate reads catalog_books.is_active (physical items use is_active, not is_published)", () => {
    expect(RESOURCE_GATES.catalogs).toEqual({
      table: "catalog_books",
      publishedColumn: "is_active",
    });
  });
});
