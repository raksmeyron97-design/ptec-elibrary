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
  it("does not imply books or theses carry a licence in their structured data", () => {
    expect(src).toMatch(/books\s+and theses carry no \\`license\\`/);
  });
});
