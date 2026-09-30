import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { authorIsIndexable, DEFAULT_AUTHOR_MIN_WORKS, parseAuthorMinWorks } from "./indexability";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

describe("authorIsIndexable", () => {
  it("indexes an author with the threshold's works or more", () => {
    expect(authorIsIndexable({ workCount: 3, hasApprovedBio: false })).toBe(true);
    expect(authorIsIndexable({ workCount: 93, hasApprovedBio: false })).toBe(true);
  });
  it("withholds a thin page without an approved biography", () => {
    expect(authorIsIndexable({ workCount: 1, hasApprovedBio: false })).toBe(false);
    expect(authorIsIndexable({ workCount: 2, hasApprovedBio: false })).toBe(false);
  });
  it("an approved biography earns indexing below the threshold", () => {
    expect(authorIsIndexable({ workCount: 1, hasApprovedBio: true })).toBe(true);
  });
  it("never indexes a page with no public works, biography or not", () => {
    expect(authorIsIndexable({ workCount: 0, hasApprovedBio: true })).toBe(false);
  });
  it("takes the threshold from config", () => {
    expect(authorIsIndexable({ workCount: 2, hasApprovedBio: false }, 2)).toBe(true);
    expect(authorIsIndexable({ workCount: 4, hasApprovedBio: false }, 5)).toBe(false);
  });
});

describe("parseAuthorMinWorks", () => {
  it("accepts a whole number ≥ 1 and defaults otherwise", () => {
    expect(parseAuthorMinWorks("5")).toBe(5);
    expect(parseAuthorMinWorks(" 2 ")).toBe(2);
    for (const bad of [undefined, "", "0", "-1", "2.5", "three"]) {
      expect(parseAuthorMinWorks(bad)).toBe(DEFAULT_AUTHOR_MIN_WORKS);
    }
  });
});

describe("one rule for the page and the sitemap", () => {
  it("the author page's robots and the author sitemap both call authorIsIndexable", () => {
    expect(read("app/[locale]/(public)/authors/[slug]/page.tsx")).toMatch(/authorIsIndexable\(/);
    expect(read("lib/seo/sitemap-entries.ts")).toMatch(/authorIsIndexable\(/);
  });
});
