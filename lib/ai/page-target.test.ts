import { describe, expect, it } from "vitest";
import {
  MAX_PAGE_SPAN,
  coversTarget,
  formatPageTarget,
  pagesOf,
  parsePageTarget,
  stripPageTarget,
} from "./page-target";

describe("parsePageTarget — single pages", () => {
  it.each([
    ["What is on page 87 of \"Practical Research Methods\"?", 87],
    ["What does page 294 say about triangulation?", 294],
    ["see p. 42 for the definition", 42],
    ["see p.42 for the definition", 42],
    ["quoted on pg 9", 9],
    ["Cohen et al., 2018, p. 294", 294],
  ])("%s → %i", (text, page) => {
    expect(parsePageTarget(text)).toEqual({ from: page, to: page, range: false });
  });

  it("reads Khmer digits and the Khmer page word", () => {
    expect(parsePageTarget("តើទំព័រ ៨៧ និយាយអំពីអ្វី?")).toEqual({ from: 87, to: 87, range: false });
    expect(parsePageTarget("ទំព័រទី ១២៣")).toEqual({ from: 123, to: 123, range: false });
  });
});

describe("parsePageTarget — ranges", () => {
  it.each([
    ["Explain the discussion of validity in pages 274 to 290 of X.", 274, 290],
    ["Summarize pages 175 to 185.", 175, 185],
    ["pp. 8–9", 8, 9],
    ["pp. 58-59", 58, 59],
    ["see pages 12 through 20", 12, 20],
    ["ទំព័រ ២៧៤ ដល់ ២៩០", 274, 290],
  ])("%s → %i–%i", (text, from, to) => {
    expect(parsePageTarget(text)).toEqual({ from, to, range: true });
  });

  it("a range beats the single-page reading of the same text", () => {
    // The whole reason RANGE_RE runs first: answering pages 274–290 with page
    // 274 alone looks precise and is not what was asked.
    expect(parsePageTarget("pages 274 to 290")).toEqual({ from: 274, to: 290, range: true });
  });

  it("refuses a span longer than a passage, and does not silently take its first page as a range", () => {
    const whole = parsePageTarget("explain pages 1 to 400 of the handbook");
    // It falls back to the single-page reading rather than scoping an answer
    // to a third of a book — and it must NOT claim to be a range.
    expect(whole).toEqual({ from: 1, to: 1, range: false });
    expect(parsePageTarget(`pages 10 to ${10 + MAX_PAGE_SPAN}`)).toEqual({ from: 10, to: 10 + MAX_PAGE_SPAN, range: true });
    expect(parsePageTarget(`pages 10 to ${11 + MAX_PAGE_SPAN}`)?.range).toBe(false);
  });

  it("refuses a descending range", () => {
    expect(parsePageTarget("pages 12-3 of the report")).toEqual({ from: 12, to: 12, range: false });
  });
});

describe("parsePageTarget — what is NOT a page", () => {
  it.each([
    "What is action research?",
    "Do you have the 8th edition?",
    "Which books were published in 2018?",
    "Find books for grade 12",
    "How many pages does it have?",
    "តើសៀវភៅនេះនិយាយអំពីអ្វី?",
  ])("%s", (text) => {
    expect(parsePageTarget(text)).toBeNull();
  });

  it("does not read an ISBN as a page", () => {
    // The digits are long and the reference is an identifier; reading "978…"
    // as page 978 would scope an availability question to a page.
    expect(parsePageTarget("do you have ISBN 978-0-415-27410-4?")).toBeNull();
    expect(parsePageTarget("ISBN 9780415274104")).toBeNull();
  });

  it("refuses page 0 and an implausible page number", () => {
    expect(parsePageTarget("page 0")).toBeNull();
    expect(parsePageTarget("page 100000")).toBeNull();
  });

  it("needs the page WORD — a bare number is never a page", () => {
    expect(parsePageTarget("294")).toBeNull();
    expect(parsePageTarget("chapter 14")).toBeNull();
  });
});

describe("stripPageTarget", () => {
  it("leaves the topic and takes the page reference", () => {
    expect(stripPageTarget('What does page 294 of "X" say about triangulation?')).toBe(
      'What does of "X" say about triangulation?',
    );
    expect(stripPageTarget("Explain validity in pages 274 to 290.")).toBe("Explain validity in .");
  });

  it("is a no-op when there is no page reference", () => {
    expect(stripPageTarget("What is action research?")).toBe("What is action research?");
  });
});

describe("pagesOf / formatPageTarget / coversTarget", () => {
  it("enumerates a range in order", () => {
    expect(pagesOf({ from: 8, to: 11, range: true })).toEqual([8, 9, 10, 11]);
    expect(pagesOf({ from: 87, to: 87, range: false })).toEqual([87]);
  });

  it("formats for a citation or a refusal", () => {
    expect(formatPageTarget({ from: 87, to: 87, range: false })).toBe("87");
    expect(formatPageTarget({ from: 274, to: 290, range: true })).toBe("274–290");
  });

  it("a merged run of adjacent pages covers the page the reader named", () => {
    const target = { from: 89, to: 89, range: false };
    expect(coversTarget(target, 88, 90)).toBe(true);
    expect(coversTarget(target, 89)).toBe(true);
    expect(coversTarget(target, 90, 92)).toBe(false);
    expect(coversTarget(target, 85, 87)).toBe(false);
  });
});
