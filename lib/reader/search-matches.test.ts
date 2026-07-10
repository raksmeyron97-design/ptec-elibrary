import { describe, it, expect } from "vitest";
import {
  itemStrings,
  findPageMatches,
  renderItemHtml,
  escapeHtml,
} from "./search-matches";

describe("itemStrings", () => {
  it("keeps index alignment for non-text items", () => {
    const items = [{ str: "Hello" }, { type: "beginMarkedContent" }, { str: "World" }];
    expect(itemStrings(items)).toEqual(["Hello", "", "World"]);
  });

  it("NFC-normalizes item text", () => {
    // "é" decomposed (e + combining acute) → composed
    expect(itemStrings([{ str: "café" }])).toEqual(["café"]);
  });
});

describe("findPageMatches", () => {
  it("finds a case-insensitive match inside one item", () => {
    const [m] = findPageMatches(["The Reading Room"], "reading");
    expect(m.spans).toEqual([{ itemIndex: 0, start: 4, end: 11 }]);
    expect(m.snippet).toContain("Reading");
  });

  it("finds a match that spans two text runs", () => {
    const matches = findPageMatches(["chalk", "board"], "kboa");
    expect(matches).toHaveLength(1);
    expect(matches[0].spans).toEqual([
      { itemIndex: 0, start: 4, end: 5 },
      { itemIndex: 1, start: 0, end: 3 },
    ]);
  });

  it("finds Khmer text split across many runs (no-space script)", () => {
    // "សាលារៀន" (school) split mid-word, as Khmer PDFs often extract
    const matches = findPageMatches(["សាលា", "រៀន គ្រូ"], "សាលារៀន");
    expect(matches).toHaveLength(1);
    expect(matches[0].spans[0].itemIndex).toBe(0);
    expect(matches[0].spans[1].itemIndex).toBe(1);
  });

  it("matches decomposed query against composed text", () => {
    expect(findPageMatches(["café culture"], "café")).toHaveLength(1);
  });

  it("returns every non-overlapping occurrence in order", () => {
    const matches = findPageMatches(["ana banana"], "ana");
    expect(matches.map((m) => m.spans[0].start)).toEqual([0, 5]);
  });

  it("skips empty items without producing empty spans", () => {
    const [m] = findPageMatches(["ab", "", "cd"], "bc");
    expect(m.spans).toEqual([
      { itemIndex: 0, start: 1, end: 2 },
      { itemIndex: 2, start: 0, end: 1 },
    ]);
  });

  it("returns nothing for an empty query", () => {
    expect(findPageMatches(["abc"], "  ".trim())).toEqual([]);
  });
});

describe("renderItemHtml", () => {
  it("escapes HTML in undecorated text", () => {
    expect(renderItemHtml("a <b> & \"c\"", [])).toBe("a &lt;b&gt; &amp; &quot;c&quot;");
  });

  it("wraps a decorated range and escapes inside it", () => {
    expect(
      renderItemHtml("x <mark> y", [{ start: 2, end: 8, cls: "ebook-mark" }]),
    ).toBe('x <mark class="ebook-mark">&lt;mark&gt;</mark> y');
  });

  it("lets the last decoration win on overlap (current match over plain)", () => {
    const html = renderItemHtml("abcdef", [
      { start: 0, end: 6, cls: "ebook-mark" },
      { start: 2, end: 4, cls: "ebook-mark ebook-mark-current" },
    ]);
    expect(html).toBe(
      '<mark class="ebook-mark">ab</mark>' +
        '<mark class="ebook-mark ebook-mark-current">cd</mark>' +
        '<mark class="ebook-mark">ef</mark>',
    );
  });

  it("merges adjacent segments with the same class", () => {
    const html = renderItemHtml("abcd", [
      { start: 0, end: 2, cls: "ebook-mark" },
      { start: 2, end: 4, cls: "ebook-mark" },
    ]);
    expect(html).toBe('<mark class="ebook-mark">abcd</mark>');
  });

  it("clamps out-of-range decorations", () => {
    expect(renderItemHtml("ab", [{ start: -3, end: 99, cls: "m" }])).toBe(
      '<mark class="m">ab</mark>',
    );
  });
});

describe("escapeHtml", () => {
  it("escapes the four significant characters", () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;",
    );
  });
});
