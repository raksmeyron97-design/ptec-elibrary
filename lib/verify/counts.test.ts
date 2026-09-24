import { describe, expect, it } from "vitest";

import { printedCount, printedOfCount, printedOfTotal } from "@/lib/verify/counts";

describe("a count is read from what the page prints", () => {
  it("reads a plain count", () => {
    expect(printedCount("<span>256 items</span>", "items")).toBe(256);
    expect(printedCount("<span>1 item</span>", "items")).toBe(1);
    expect(printedCount("<span>1,037 works</span>", "works")).toBe(1037);
    expect(printedCount("<span>12 e-books</span>", "e-books")).toBe(12);
  });

  it("is null when the page prints no such count", () => {
    expect(printedCount("<span>No resources found</span>", "items")).toBeNull();
  });
});

describe("the word-boundary trap", () => {
  it("does not read a CSS class as a count", () => {
    // The real production markup. `\b` matches between "s" and "-", so
    // /(\d+)\s+items?\b/ finds "0 items" in `shrink-0 items-center` — every
    // homepage tile parsed as zero, and the verifier reported "sum 0" as a
    // pass.
    const tile =
      '<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">' +
      '<svg viewBox="0 0 24 24"></svg></span>' +
      '<span class="text-text-muted">256 items</span>';
    expect(/(\d[\d,]*)\s+items?\b/.exec(tile)?.[1]).toBe("0"); // the trap, still there
    expect(printedCount(tile, "items")).toBe(256); // and not fallen into
  });

  it("does not match a longer word starting with the noun", () => {
    expect(printedCount("<p>3 workshops were held</p>", "works")).toBeNull();
    expect(printedCount("<p>5 itemised entries</p>", "items")).toBeNull();
  });

  it("still matches when punctuation follows", () => {
    expect(printedCount("<p>7 works.</p>", "works")).toBe(7);
    expect(printedCount("<p>7 works, listed below</p>", "works")).toBe(7);
  });
});

describe("a filtered listing prints two numbers", () => {
  it("reads the filtered count and the total apart", () => {
    const html = "<span>238 of 1956 e-books</span>";
    expect(printedOfCount(html, "e-books")).toBe(238);
    expect(printedOfTotal(html, "e-books")).toBe(1956);
  });

  it("is null for an unfiltered listing", () => {
    expect(printedOfCount("<span>1956 resources</span>", "resources")).toBeNull();
  });
});
