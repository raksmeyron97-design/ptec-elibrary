import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveSlugGate, RESOURCE_GATES, type ResourceGateConfig } from "@/lib/resource-slug-gate";

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
    // Asserts the lookup target only. `reserved` is covered by its own tests
    // below, so adding a static child route here does not fail this one.
    expect(RESOURCE_GATES.theses).toMatchObject({
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

  // ── Static sibling routes must not be gated as slugs ──────────────────────
  describe("reserved segments", () => {
    const PUBLIC_DIR = path.join(__dirname, "..", "app/[locale]/(public)");

    it("treats a reserved segment as a real route without a lookup", () => {
      // /theses/summary is app/[locale]/(public)/theses/summary/page.tsx, but
      // the gate matches /theses/<anything>, looked it up against published
      // thesis slugs, found nothing and 404'd a page that exists — while the
      // sitemap advertised it.
      expect(resolveSlugGate("summary", new Set<string>(), ["summary"])).toEqual({ kind: "ok" });
      // ...and an unknown slug is still a 404.
      expect(resolveSlugGate("not-a-thesis", new Set<string>(), ["summary"])).toEqual({
        kind: "not-found",
      });
    });

    // `as const satisfies` keeps the literal types, so only the theses entry
    // has `reserved` — widen to the declared config type to read it uniformly.
    const gates = Object.entries(RESOURCE_GATES) as [string, ResourceGateConfig][];

    it.each(gates)(
      "%s lists every static child route it has",
      (segment, cfg) => {
        const dir = path.join(PUBLIC_DIR, segment);
        if (!fs.existsSync(dir)) return;
        const staticChildren = fs
          .readdirSync(dir, { withFileTypes: true })
          .filter(
            (e) =>
              e.isDirectory() &&
              !e.name.startsWith("[") &&
              fs.existsSync(path.join(dir, e.name, "page.tsx")),
          )
          .map((e) => e.name);
        // Anything here that the gate does not know about is a live 404.
        expect([...staticChildren].sort()).toEqual([...(cfg.reserved ?? [])].sort());
      },
    );
  });
});