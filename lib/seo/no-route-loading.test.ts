// Indexable public routes render their H1 and primary content in the shell:
// no route-level loading.tsx (CLAUDE.md; docs/seo/AUDIT-VERIFICATION.md F2,
// decision D9). A route-level boundary streamed the WHOLE page inside
// <div hidden>, so a reader without JavaScript saw a skeleton and a footer.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const PUBLIC = path.join(__dirname, "..", "..", "app", "[locale]", "(public)");

/** Routes allowed a loading.tsx, each with the reason. */
const ALLOWED: Record<string, string> = {
  "search": "noindex; a search-shaped skeleton paints on every document load",
  "books/[slug]/read": "the reader: noindex, and a client-only PDF viewer",
  "dashboard": "private (noindex, nofollow)",
  "dashboard/settings": "private (noindex, nofollow)",
  "lists/[id]": "private (noindex, nofollow)",
  "offline-books": "private offline shell",
  "offline-reader": "private offline shell",
  "dev-dashboard-preview": "development preview, never public",
};

function loadingRoutes(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name === "loading.tsx") out.push(prefix.replace(/\/$/, ""));
    if (e.isDirectory()) {
      // Route groups like (home) are not URL segments.
      const seg = /^\(.*\)$/.test(e.name) ? "" : `${e.name}/`;
      out.push(...loadingRoutes(path.join(dir, e.name), prefix + seg));
    }
  }
  return out;
}

describe("indexable public routes stream nothing before their H1", () => {
  const found = loadingRoutes(PUBLIC);

  it("finds the routes that keep a boundary (the scan works)", () => {
    expect(found).toContain("search");
  });

  it("allows a route-level loading.tsx only where the reason is written down", () => {
    const unexpected = found.filter((r) => !(r in ALLOWED));
    expect(unexpected, "an indexable route got a loading.tsx back — its H1 would stream hidden").toEqual([]);
  });

  it("has no catch-all boundary above every route", () => {
    expect(fs.existsSync(path.join(PUBLIC, "loading.tsx"))).toBe(false);
  });
});
