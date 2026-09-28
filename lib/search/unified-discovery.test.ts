// Phase 9.2 — the route-level rules of unified discovery (docs/UNIFIED-DISCOVERY.md),
// pinned by reading the route: the ranking and facet rules themselves are
// unit-tested in ranking.test.ts, facets.test.ts and subject-class.test.ts.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const route = () => read("app/api/search/native/route.ts");

describe("unified discovery in the native search route", () => {
  it("orders the blended list across collections by relevance, never by popularity", () => {
    const src = route();
    expect(src).toMatch(/const blended = activeTypes[\s\S]{0,200}\.sort\(\(a, b\) => compareAcrossCollections\(a, b, sort\)\)/);
    // The old shape — each type's top four, concatenated in a fixed order — is gone.
    expect(src).not.toMatch(/activeTypes\.flatMap\(\(t\) =>\s*byType\[t\]\.allCandidates\.filter\(\(c\) => matchesFacets\(c, selections\)\)\.slice\(0, PAGE_SIZE_ALL\)/);
  });

  it("the Physical library IS the catalogue leg, so old ?type=catalog links keep working", () => {
    expect(route()).toMatch(/scope === "physical" && requestedType === "all" \? "catalog" : requestedType/);
  });

  it("the Digital library's list AND its facets leave print out, while every leg still runs for the counts", () => {
    const src = route();
    expect(src).toMatch(/const scopeTypes = scope === "digital" \? typeIds\.filter\(\(t\) => t !== "catalog"\) : typeIds;/);
    expect(src).toMatch(/const unionCandidates = scopeTypes\.flatMap/);
  });

  it("print records take their subject class from the CALL NUMBER, digital books from a confirmed category mapping", () => {
    const src = route();
    expect(src).toMatch(/subjectClass: subjectClassOfCallNumber\(r\.ddc\)/);
    expect(src).toMatch(/subjectClass: subjectClassOfCategory\(category\)/);
  });

  it("pages the blended list and never logs a deeper page as a new query", () => {
    const src = route();
    expect(src).toMatch(/hasMore: blended\.length > blendFrom \+ PAGE_SIZE_BLEND/);
    expect(src).toMatch(/failedLegs\.size === 0 && page === 1\) logSearchQuery/);
  });
});

describe("unified discovery on the page", () => {
  const page = () => read("app/[locale]/(public)/search/SearchPageClient.tsx");

  it("Load more APPENDS, and only to the list it continues", () => {
    expect(page()).toMatch(/if \(!appending \|\| !previous\) return incoming;/);
    expect(page()).toMatch(/const appending = pg > 1 && listKeyRef\.current === listKey;/);
  });

  it("a print book's first action is where it stands on the shelf", () => {
    expect(page()).toMatch(/href: `\$\{viewHref\}#where`, label: t\("actionWhere"\)/);
    expect(read("app/[locale]/(public)/catalogs/[slug]/page.tsx")).toMatch(/id="where"/);
  });

  it("the homepage hero can search the Physical library", () => {
    expect(read("components/ui/home/AskLibraryHero.tsx")).toMatch(/\{ id: "catalog", labelKey: "tabCatalog" \}/);
  });
});
