import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPLATED_CLUSTER_MIN, withheldByDescriptionGate } from "./description-gate";

const base = { hasFile: false, templateClusterSize: 1, descriptionEmpty: false, descriptionStatus: "none" };

describe("withheldByDescriptionGate", () => {
  it("does nothing while the gate is off", () => {
    expect(withheldByDescriptionGate({ ...base, descriptionEmpty: true }, false)).toBe(false);
  });
  it("withholds a record with no file and an empty or templated description", () => {
    expect(withheldByDescriptionGate({ ...base, descriptionEmpty: true }, true)).toBe(true);
    expect(withheldByDescriptionGate({ ...base, templateClusterSize: TEMPLATED_CLUSTER_MIN }, true)).toBe(true);
  });
  it("never withholds a record with a file, an approved description, or text of its own", () => {
    expect(withheldByDescriptionGate({ ...base, hasFile: true, descriptionEmpty: true }, true)).toBe(false);
    expect(withheldByDescriptionGate({ ...base, descriptionEmpty: true, descriptionStatus: "approved" }, true)).toBe(false);
    expect(withheldByDescriptionGate({ ...base, templateClusterSize: TEMPLATED_CLUSTER_MIN - 1 }, true)).toBe(false);
  });
});

// The page's robots and the sitemap read ONE set, so a book can never be
// noindex while advertised, or advertised while noindex, for longer than one
// cache refresh (RUNBOOK, Phase 5).
describe("one withheld set for both consumers", () => {
  const ROOT = path.resolve(__dirname, "../..");
  const src = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
  it("the book page's robots and the books sitemap both read descriptionGateWithheldSlugs()", () => {
    const page = src("app/[locale]/(public)/books/[slug]/page.tsx");
    expect(page).toMatch(/\(await descriptionGateWithheldSlugs\(\)\)\.has\(slug\)/);
    expect(page).toMatch(/withheld \? \{ robots: \{ index: false, follow: true \} \}/);
    const sitemap = src("lib/seo/sitemap-entries.ts");
    expect(sitemap).toMatch(/const withheld = await descriptionGateWithheldSlugs\(\);[\s\S]{0,200}books\.filter\(\(book\) => !withheld\.has\(book\.slug\)\)/);
  });
  it("an unreadable set withholds nothing, and the gate is read from the environment only", () => {
    const server = src("lib/seo/description-gate.server.ts");
    expect(server).toMatch(/if \(!descriptionGateEnabled\(\)\) return new Set\(\);/);
    expect(server).toMatch(/catch \(error\) \{[\s\S]{0,300}return new Set\(\);/);
    expect(src("lib/seo/seo-flags.ts")).toMatch(/resolveSeoFlag\(process\.env\.SEO_DESCRIPTION_GATE\)/);
  });
  // The gate is a RUNTIME flag and the image is built in CI, which does not
  // have it: a sitemap prerendered at build put the withheld books back after
  // every deploy (2026-10-01). A `fetchCache` export is refused too — set to
  // force-no-store it would silently bypass getSitemapEntries()'s cache.
  it("the sitemap routes render at request time, never at build", () => {
    for (const route of ["app/sitemap.xml/route.ts", "app/sitemaps/[file]/route.ts"]) {
      const code = src(route).replace(/\/\/.*$/gm, "");
      expect(code, route).toMatch(/export const dynamic = "force-dynamic";/);
      expect(code, route).not.toMatch(/generateStaticParams|export const (revalidate|fetchCache)\b/);
    }
  });
});
