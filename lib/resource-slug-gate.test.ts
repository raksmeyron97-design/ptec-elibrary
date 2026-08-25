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

describe("resolveSlugGate — retired-slug redirects", () => {
  const live = new Set(["current-slug", "other-book"]);

  it("301s a retired slug to the record's current one", () => {
    const redirects = new Map([["old-slug", "current-slug"]]);
    expect(resolveSlugGate("old-slug", live, [], redirects)).toEqual({
      kind: "redirect",
      slug: "current-slug",
    });
  });

  it("prefers a live slug over a redirect — a slug reused by a new record is not a redirect", () => {
    const redirects = new Map([["current-slug", "other-book"]]);
    expect(resolveSlugGate("current-slug", live, [], redirects)).toEqual({ kind: "ok" });
  });

  it("never follows a redirect onto itself", () => {
    const redirects = new Map([["loop", "loop"]]);
    expect(resolveSlugGate("loop", live, [], redirects)).toEqual({ kind: "not-found" });
  });

  it("never 301s to a target that is not live — a deactivated record 404s rather than redirecting to a dead page", () => {
    const redirects = new Map([["old-slug", "deactivated-book"]]);
    expect(resolveSlugGate("old-slug", live, [], redirects)).toEqual({ kind: "not-found" });
  });

  it("leaves resources with no redirect map behaving exactly as before", () => {
    expect(resolveSlugGate("old-slug", live)).toEqual({ kind: "not-found" });
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

  it("posts gate reads posts.is_published — the trigger-maintained mirror of `status` (0073), NOT `status` itself", () => {
    expect(RESOURCE_GATES.posts).toEqual({
      table: "posts",
      publishedColumn: "is_published",
    });
  });

  it("posts declare no reserved segments — /posts has no static child route besides [slug]", () => {
    // If one is ever added, the directory-reading test below fails first; this
    // pins the current, deliberate emptiness so the two can't silently diverge.
    expect(RESOURCE_GATES.posts).not.toHaveProperty("reserved");
  });

  it("catalogs gate reads catalog_books.is_active (physical items use is_active, not is_published)", () => {
    expect(RESOURCE_GATES.catalogs).toEqual({
      table: "catalog_books",
      publishedColumn: "is_active",
      redirectTable: "catalog_slug_redirects",
    });
  });

  it("catalogs is the only gate carrying a redirect map — it is the only one whose slug is editable after creation", () => {
    const withRedirects = Object.entries(RESOURCE_GATES)
      .filter(([, cfg]) => "redirectTable" in cfg)
      .map(([name]) => name);
    expect(withRedirects).toEqual(["catalogs"]);
  });

  it("team profiles gate reads the team_members_public VIEW — anon reads of the base table were closed in 0071, so gating team_members itself would 401 at the edge and permanently fail open", () => {
    expect(RESOURCE_GATES["about/team"]).toEqual({
      table: "team_members_public",
      publishedColumn: "is_published",
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