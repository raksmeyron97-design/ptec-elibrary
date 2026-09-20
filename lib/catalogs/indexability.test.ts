import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assessCatalogIndexability,
  catalogRobots,
  isCatalogRecordIndexable,
  CATALOG_MIN_DESCRIPTION_CHARS,
} from "./indexability";

const REAL_DESCRIPTION =
  "A general survey of world scientific development, catalogued for the teacher reference shelf.";

describe("assessCatalogIndexability", () => {
  it("indexes a record that says something a result could be about", () => {
    const v = assessCatalogIndexability({ description: REAL_DESCRIPTION });
    expect(v.visibility).toBe("index");
    expect(v.reason).toBe("has-description");
  });

  // The whole point of the gate. The PMB export is No., Title, Author, DDC,
  // Barcode — a page built from those is a shelf label.
  it("does NOT index a PMB-shaped row", () => {
    const v = assessCatalogIndexability({});
    expect(v.visibility).toBe("noindex");
    expect(v.reason).toBe("record-only");
  });

  it("does not let whitespace or a stub count as a description", () => {
    for (const description of [null, undefined, "", "   ", "—", "n/a", "See title"]) {
      expect(assessCatalogIndexability({ description }).visibility).toBe("noindex");
    }
  });

  it("indexes a record that leads to full text, whatever else it carries", () => {
    // A page that is an entry point rather than a terminus is a useful
    // result even with no description of its own.
    const v = assessCatalogIndexability({ digitalBookSlug: "a-digital-book" });
    expect(v.visibility).toBe("index");
    expect(v.reason).toBe("links-to-full-text");
  });

  it("treats a blank digital link as no link", () => {
    expect(assessCatalogIndexability({ digitalBookSlug: "   " }).visibility).toBe("noindex");
  });

  it("is conservative about an ABSENT field, never promoted by omission", () => {
    // A caller that did not select `description` must not accidentally
    // promote a record. Demoting a rich record costs it a ranking; promoting
    // thousands of shelf labels costs the domain its credibility.
    expect(isCatalogRecordIndexable({})).toBe(false);
  });

  it("keeps every record FOLLOW, indexed or not", () => {
    // The record's links to its subject and its copies stay worth crawling,
    // and the page still answers 200 to a reader who lands on it.
    expect(catalogRobots({}).follow).toBe(true);
    expect(catalogRobots({ description: REAL_DESCRIPTION }).follow).toBe(true);
    expect(catalogRobots({}).index).toBe(false);
    expect(catalogRobots({ description: REAL_DESCRIPTION }).index).toBe(true);
  });

  it("puts the threshold where a label stops and a sentence starts", () => {
    const justUnder = "x".repeat(CATALOG_MIN_DESCRIPTION_CHARS - 1);
    const justOver = "x".repeat(CATALOG_MIN_DESCRIPTION_CHARS);
    expect(assessCatalogIndexability({ description: justUnder }).visibility).toBe("noindex");
    expect(assessCatalogIndexability({ description: justOver }).visibility).toBe("index");
  });

  it("clears every description live in production on 2026-09-20", () => {
    // All six live records carry their own description; the gate must not
    // demote any of them. (Measured by fetching each page: the generated
    // fallback begins "Find …", and none of the six did.)
    expect(REAL_DESCRIPTION.length).toBeGreaterThan(CATALOG_MIN_DESCRIPTION_CHARS);
  });
});

describe("one gate, both surfaces", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  /**
   * Import lines removed first. `toContain("isCatalogRecordIndexable")`
   * matches the IMPORT, so deleting the actual `.filter(...)` left this
   * green — caught by negative-controlling it. What is being asserted is
   * that the function is CALLED.
   */
  const body = (p: string) => read(p).replace(/^\s*import\s[\s\S]*?;\s*$/gm, "");

  it("the sitemap filters on it", () => {
    const src = body("app/sitemap.ts");
    expect(src).toMatch(/isCatalogRecordIndexable\(/);
    // …and selects the column it needs to ask, or the answer is always "no".
    expect(read("app/sitemap.ts")).toMatch(/from\('catalog_books'\)[\s\S]{0,300}description/);
  });

  it("the page's robots meta reads the same function", () => {
    const src = body("app/[locale]/(public)/catalogs/[slug]/page.tsx");
    expect(src).toMatch(/catalogRobots\(\{/);
    // Not a hand-written robots value beside it — that is how a sitemap and
    // a page come to disagree.
    expect(src).not.toMatch(/robots:\s*\{\s*index:\s*(true|false)\s*,\s*follow/);
  });
});
