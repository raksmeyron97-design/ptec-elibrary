import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// SEO Phase 2.7 (F12): three statements in llms.txt were false. The route is a
// template, so the test reads its source.
const src = readFileSync(path.resolve(__dirname, "../../app/llms.txt/route.ts"), "utf8");

describe("/llms.txt says only what is true", () => {
  it("lists no catalogue records — they are noindex and out of the sitemap", () => {
    expect(src).not.toMatch(/from\("catalog_books"\)/);
    expect(src).not.toMatch(/Recent Catalog Records/);
  });
  it("does not claim the English URL is canonical for Khmer pages", () => {
    expect(src).not.toMatch(/The English URL is canonical/);
    expect(src).toMatch(/Each language version is its own canonical URL/);
  });
  it("says which records carry a licence, as lib/seo/thesis-seo.ts emits it (Phase 7.3)", () => {
    expect(src).toMatch(/journal\s+articles and open-access theses carry one/);
    expect(src).toMatch(/books carry no \\`license\\` at all/);
    expect(src).not.toMatch(/books\s+and theses carry no/);
  });
  it("does not claim every catalogue record is noindex — a described one may be indexed (P2-1)", () => {
    expect(src).not.toMatch(/they answer \\`noindex, follow\\` and are not in the sitemap/);
    expect(src).toMatch(/None is in the sitemap and most answer/);
  });
  it("names the structured-data types the pages actually emit (Phase 4)", () => {
    expect(src).toMatch(/Book, Thesis or ScholarlyArticle/);
  });
});
