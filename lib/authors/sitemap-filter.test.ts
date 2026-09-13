import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { authorUrlsWithWorks } from "./sitemap-filter";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const candidates = (...slugs: string[]) =>
  new Map(slugs.map((s) => [s, `${s}-created-at`] as const));

describe("the sitemap advertises only authors with works", () => {
  it("drops an author the directory does not list", () => {
    // The measured case: /authors/kenneth-n-berk-patrick-carey was in the
    // sitemap, answered index/follow, and had zero works.
    const { entries, degraded } = authorUrlsWithWorks(
      candidates("adrian-wallwork", "kenneth-n-berk-patrick-carey"),
      new Set(["adrian-wallwork"]),
    );
    expect(entries.map(([s]) => s)).toEqual(["adrian-wallwork"]);
    expect(degraded).toBe(false);
  });

  it("keeps the row's payload with the slug", () => {
    const { entries } = authorUrlsWithWorks(candidates("a"), new Set(["a"]));
    expect(entries).toEqual([["a", "a-created-at"]]);
  });

  it("keeps every author when they all have works", () => {
    const { entries, degraded } = authorUrlsWithWorks(
      candidates("a", "b", "c"),
      new Set(["a", "b", "c"]),
    );
    expect(entries).toHaveLength(3);
    expect(degraded).toBe(false);
  });

  it("ignores a listed author that has no addressable URL", () => {
    // The roster can name someone the sitemap cannot address (no slug column
    // before 0125, or a NULL slug that middleware hard-404s).
    const { entries } = authorUrlsWithWorks(candidates("a"), new Set(["a", "not-a-candidate"]));
    expect(entries.map(([s]) => s)).toEqual(["a"]);
  });
});

describe("an empty roster is UNKNOWN, not 'nobody has works'", () => {
  // getAuthorDirectory() catches its own errors and answers []. Acting on that
  // as data would drop all 157 author URLs to remove one.
  it("emits the unfiltered set and says it degraded", () => {
    const { entries, degraded } = authorUrlsWithWorks(candidates("a", "b"), new Set());
    expect(entries.map(([s]) => s)).toEqual(["a", "b"]);
    expect(degraded).toBe(true);
  });

  it("does NOT degrade when there are genuinely no authors", () => {
    // Empty roster beside an empty row set is consistent, not suspicious.
    const { entries, degraded } = authorUrlsWithWorks(new Map<string, null>(), new Set());
    expect(entries).toEqual([]);
    expect(degraded).toBe(false);
  });

  it("never returns fewer than it was given while degraded", () => {
    const input = candidates("a", "b", "c", "d");
    const { entries } = authorUrlsWithWorks(input, new Set());
    expect(entries).toHaveLength(input.size);
  });
});

// ── Source scans: the two call-site rules a refactor would most plausibly undo.
describe("the call sites keep the rules that make this safe", () => {
  it("app/sitemap.ts filters through the directory, not a fresh count", () => {
    // A second implementation of "has works" is how the sitemap and the hub
    // came to disagree in the first place.
    const src = read("app/sitemap.ts");
    expect(src).toContain("getListedAuthors()");
    expect(src).toContain("authorUrlsWithWorks(");
    expect(src).toMatch(/if \(degraded\)/);
  });

  it("the author works cap clears the largest author in the collection", () => {
    // MoEYS has 93 published books; at 60 the page showed 70 and 23 books had
    // no author path. The cap is applied per leg before the union, so it has
    // never meant "works shown" — see the comment on the constant.
    const src = read("lib/authors/profile.ts");
    const m = src.match(/const PER_TYPE_LIMIT = (\d+);/);
    expect(m, "PER_TYPE_LIMIT not found").toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(93);
  });
});
