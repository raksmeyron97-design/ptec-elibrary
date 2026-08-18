import { describe, it, expect } from "vitest";
import { HomeExclusions, resourceKey, type HomeResourceRef } from "./exclusions";

const book = (slug: string): HomeResourceRef => ({ type: "book", slug });
const thesis = (slug: string): HomeResourceRef => ({ type: "thesis", slug });

describe("HomeExclusions", () => {
  it("takes the first unclaimed items, in candidate order", () => {
    const ex = new HomeExclusions();
    expect(ex.take([book("a"), book("b"), book("c")], 2).map((b) => b.slug)).toEqual(["a", "b"]);
  });

  it("backfills past items an earlier section already claimed", () => {
    const ex = new HomeExclusions();
    ex.claim([book("a"), book("b")]);
    // Same ranking, different section: it skips a and b and fills from c.
    expect(ex.take([book("a"), book("b"), book("c"), book("d")], 2).map((b) => b.slug)).toEqual([
      "c",
      "d",
    ]);
  });

  it("returns fewer than the limit rather than repeating, when the pool runs dry", () => {
    const ex = new HomeExclusions();
    ex.claim([book("a")]);
    expect(ex.take([book("a"), book("b")], 4).map((b) => b.slug)).toEqual(["b"]);
  });

  it("dedupes within a single candidate list", () => {
    // Two fetchers merged into one array can each yield the same row.
    const ex = new HomeExclusions();
    expect(ex.take([book("a"), book("a"), book("b")], 3).map((b) => b.slug)).toEqual(["a", "b"]);
  });

  it("keys on type as well as slug, so a book and a thesis may share one", () => {
    const ex = new HomeExclusions();
    ex.claim([book("research")]);
    expect(ex.has(thesis("research"))).toBe(false);
    expect(ex.take([thesis("research")], 1)).toHaveLength(1);
  });

  it("never lets the same resource be claimed twice across a whole page", () => {
    // The composition shape the homepage actually uses: hero → featured →
    // arrivals, every section drawing from overlapping rankings.
    const byDownloads = ["a", "b", "c", "d", "e", "f"].map(book);
    const byViews = ["c", "a", "g", "b", "h", "i"].map(book);
    const byRecency = ["g", "a", "j", "c", "k"].map(book);

    const ex = new HomeExclusions();
    const hero = ex.claim(byDownloads.slice(0, 3));
    const featured = ex.take(byViews, 3);
    const arrivals = ex.take(byRecency, 3);

    const all = [...hero, ...featured, ...arrivals].map(resourceKey);
    expect(new Set(all).size).toBe(all.length);
    expect(featured.map((b) => b.slug)).toEqual(["g", "h", "i"]);
    expect(arrivals.map((b) => b.slug)).toEqual(["j", "k"]);
    expect(ex.size).toBe(all.length);
  });

  it("reports every key it has claimed", () => {
    const ex = new HomeExclusions();
    ex.claim([book("a")]);
    ex.take([thesis("t")], 1);
    expect(ex.keys().sort()).toEqual(["book:a", "thesis:t"]);
  });
});
