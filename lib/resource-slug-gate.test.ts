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

  it("subjects gate on EXISTENCE — categories has no publication column", () => {
    // A category is public by existing. Whether its PAGE is indexable is a
    // different question, answered by resource count (the page emits noindex
    // and getIndexableSubjects() drops it from the sitemap) — never by a
    // column. Gating on a column that does not exist would 404 every subject.
    expect(RESOURCE_GATES.subjects).toEqual({ table: "categories" });
    expect(RESOURCE_GATES.subjects).not.toHaveProperty("publishedColumn");
  });

  it("subjects declares no reserved segments, because it has no static children", () => {
    expect(RESOURCE_GATES.subjects).not.toHaveProperty("reserved");
  });

  it("every gate either names a publication column or deliberately omits one", () => {
    // Guards the `&undefined=eq.true` failure mode: a filter PostgREST
    // rejects, which fails the gate OPEN and silently stops gating a resource
    // while every test above still passes.
    for (const [name, cfg] of Object.entries(RESOURCE_GATES)) {
      const col = (cfg as { publishedColumn?: unknown }).publishedColumn;
      expect(
        col === undefined || (typeof col === "string" && col.length > 0),
        `${name}: publishedColumn must be a non-empty string or absent`,
      ).toBe(true);
    }
  });

  it("catalogs is the only gate carrying a redirect map — it is the only one whose slug is editable after creation", () => {
    const withRedirects = Object.entries(RESOURCE_GATES)
      .filter(([, cfg]) => "redirectTable" in cfg)
      .map(([name]) => name);
    expect(withRedirects).toEqual(["catalogs"]);
  });

  it("authors gate reads the author_profiles_public VIEW — a profile resolves across publication_authors AND authors, which this gate's one-table shape cannot express, so 0126 unions them", () => {
    expect(RESOURCE_GATES.authors).toEqual({
      table: "author_profiles_public",
      publishedColumn: "is_published",
    });
  });

  it("authors declare no redirect map — an author slug change retires the old URL rather than 301ing it", () => {
    expect(RESOURCE_GATES.authors).not.toHaveProperty("redirectTable");
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
// ── Every [slug] page body must normalize its route param ─────────────────
//
// Next delivers a non-ASCII path segment PERCENT-ENCODED to the page
// component, while generateMetadata receives it decoded. A page that queries
// with the raw param therefore renders a <title> from the real record and a
// "not found" body for the same URL — a soft 404 that only ever hits
// Khmer-slugged records, and that returns HTTP 200 so no monitor sees it.
// That is exactly how /books/<khmer-slug>/read 404'd in production while the
// detail page beside it worked. decodeSlugParam() is idempotent, so the rule
// is simply: if a file reads a `slug` route param, every function that does
// must run it through decodeSlugParam.
describe("[slug] route params are decoded before any lookup", () => {
  const PUBLIC_DIR = path.join(__dirname, "..", "app/[locale]/(public)");

  function slugPages(dir: string, found: string[] = []): string[] {
    if (!fs.existsSync(dir)) return found;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) slugPages(full, found);
      else if (entry.name === "page.tsx" && dir.includes("[slug]")) found.push(full);
    }
    return found;
  }

  const pages = slugPages(PUBLIC_DIR);

  it("finds the [slug] pages to check", () => {
    expect(pages.length).toBeGreaterThan(5);
  });

  it.each(pages.map((p) => [path.relative(PUBLIC_DIR, p), p]))(
    "%s decodes the slug param everywhere it destructures one",
    (_rel, file) => {
      const src = fs.readFileSync(file, "utf8");
      // Count the places this file pulls `slug` out of params. Each one is a
      // separate entry point (generateMetadata, the default export, …) and
      // each needs its own decode.
      const destructures = src.match(/\bslug(?:\s*:\s*\w+)?\s*[,}]/g) ?? [];
      if (destructures.length === 0) return;
      const decodes = src.match(/decodeSlugParam\s*\(/g) ?? [];
      expect(
        decodes.length,
        `${path.basename(path.dirname(file))} reads a slug route param but calls ` +
          `decodeSlugParam ${decodes.length} time(s) — a page body that skips it ` +
          `soft-404s every non-ASCII slug`,
      ).toBeGreaterThan(0);
      // Both entry points must decode, not just one.
      expect(src.includes("export async function generateMetadata") && decodes.length >= 2).toBe(
        true,
      );
    },
  );
});

// ── Every declared gate is actually wired into middleware ────────────────────
//
// A gate is two halves: a RESOURCE_GATES entry and a line in middleware's
// dispatch loop. Either half alone does nothing, and the failure is silent —
// the route keeps answering HTTP 200 with not-found content, which is the
// soft-404 this whole module exists to prevent.
//
// /paths had NEITHER half. It answered 200 with the layout's indexable robots
// value and a bare "PTEC Library" title for any slug at all, because
// paths/[slug]/loading.tsx streams the 200 before notFound() ever runs.
describe("middleware wires every gate RESOURCE_GATES declares", () => {
  const middleware = fs
    .readFileSync(path.join(__dirname, "..", "middleware.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

  it.each(Object.keys(RESOURCE_GATES).map((k) => [k]))(
    "dispatches /%s/<slug> through its gate",
    (segment) => {
      const dotted = `["${segment}", RESOURCE_GATES.${segment}]`;
      const bracketed = `["${segment}", RESOURCE_GATES["${segment}"]]`;
      expect(
        middleware.includes(dotted) || middleware.includes(bracketed),
        `RESOURCE_GATES.${segment} is declared but middleware never dispatches ` +
          `to it — /${segment}/<unknown> still answers 200 with not-found content`,
      ).toBe(true);
    },
  );

  it("declares no dispatch for a gate that does not exist", () => {
    const dispatched = [...middleware.matchAll(/\["([^"]+)", RESOURCE_GATES[.[]/g)].map(
      (m) => m[1],
    );
    expect(dispatched.length).toBe(Object.keys(RESOURCE_GATES).length);
    for (const segment of dispatched) {
      expect(Object.keys(RESOURCE_GATES)).toContain(segment);
    }
  });
});

describe("learning paths gate", () => {
  it("reads learning_paths.is_published — the trigger-maintained mirror of `status` (0111)", () => {
    // `status` is an enum, not a boolean, so it cannot bind to this gate's
    // =eq.true filter; is_published is also the column the anon RLS policy
    // ("Public can view published paths", 0063) predicates on, so the edge
    // snapshot and the policy agree by construction.
    expect(RESOURCE_GATES.paths).toEqual({
      table: "learning_paths",
      publishedColumn: "is_published",
    });
  });

  it("declares no reserved segments — /paths has no static child route besides [slug]", () => {
    expect(RESOURCE_GATES.paths).not.toHaveProperty("reserved");
  });

  it("declares no redirect map — a path slug change retires the old URL", () => {
    expect(RESOURCE_GATES.paths).not.toHaveProperty("redirectTable");
  });
});

// ── Every public [slug] route must be gated ─────────────────────────────────
//
// THE TEST THAT WAS MISSING. The suite above iterates over the gates that
// EXIST and checks each one's reserved children. It never asked the opposite
// question — does every [slug] route HAVE a gate? — and that is exactly how
// /subjects/<anything> shipped answering HTTP 200 for every string on earth
// (docs/SEO-3.0-AUDIT.md F-6): `subjects` was simply never added to
// RESOURCE_GATES, and nothing noticed for as long as the route existed.
//
// A public route streams its `loading.tsx` shell before the page can call
// notFound(), so without a gate the 200 is already on the wire. The fix is
// structural: enumerate the routes from the filesystem, not from the registry,
// so a NEW route is ungated-by-omission exactly once — here, in red.

describe("every public [slug] route is gated, or exempt with a reason", () => {
  const PUBLIC = path.join(__dirname, "..", "app/[locale]/(public)");

  /**
   * Routes that legitimately have no entry in RESOURCE_GATES.
   *
   * Each needs a REASON, not just an entry: an exemption without one is how a
   * missing gate hides in a list that looks deliberate.
   */
  const EXEMPT: Record<string, string> = {
    // Books have their own gate (lib/book-slug-gate.ts), which additionally
    // resolves retired slugs through book_slug_redirects (0091).
    "books/[slug]": "gated by lib/book-slug-gate.ts, not RESOURCE_GATES",
    // A child of the book route: middleware gates the parent segment, so an
    // unknown book never reaches its /read page in the first place.
    "books/[slug]/read": "child of books/[slug], gated by the parent",
  };

  function slugRoutes(dir: string, prefix = "", out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (fs.existsSync(path.join(dir, entry.name, "page.tsx")) && rel.includes("[slug]")) {
        out.push(rel);
      }
      slugRoutes(path.join(dir, entry.name), rel, out);
    }
    return out;
  }

  it("finds the public [slug] routes", () => {
    expect(slugRoutes(PUBLIC).length).toBeGreaterThanOrEqual(8);
  });

  it("leaves no [slug] route ungated by omission", () => {
    const ungated = slugRoutes(PUBLIC).filter((route) => {
      if (route in EXEMPT) return false;
      // "authors/[slug]" → "authors"; "about/team/[slug]" → "about/team".
      const segment = route.replace(/\/\[slug\].*$/, "");
      return !(segment in RESOURCE_GATES);
    });

    expect(
      ungated,
      "These public detail routes have no slug gate, so an unknown slug " +
        "returns HTTP 200 with not-found content — a soft 404 on an unbounded " +
        "URL space. Add the segment to RESOURCE_GATES (and to middleware's " +
        "gate list), or add it to EXEMPT above WITH the reason it needs none.",
    ).toEqual([]);
  });

  it("every exemption names a route that still exists", () => {
    const routes = new Set(slugRoutes(PUBLIC));
    expect(Object.keys(EXEMPT).filter((r) => !routes.has(r))).toEqual([]);
  });

  it("every gate is reachable from middleware", () => {
    // A gate that middleware never consults is a gate that does nothing — the
    // registry and the enforcement point must not drift apart.
    const middleware = fs.readFileSync(path.join(__dirname, "..", "middleware.ts"), "utf8");
    const unreferenced = Object.keys(RESOURCE_GATES).filter(
      (key) => !middleware.includes(`RESOURCE_GATES.${key}`) && !middleware.includes(`RESOURCE_GATES["${key}"]`),
    );
    expect(unreferenced).toEqual([]);
  });
});
