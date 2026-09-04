import { describe, expect, it } from "vitest";
import { makeSnippet } from "./snippet";

const page =
  "Formative assessment is best understood as a continuous process rather than an event. " +
  "The teacher gathers evidence of learning during instruction, interprets it against the " +
  "intended outcome, and adjusts the next step accordingly.";

describe("makeSnippet", () => {
  it("centres the window on the match and marks both cuts", () => {
    const out = makeSnippet(page, "interprets it", 20);
    expect(out).toContain("interprets it");
    expect(out.startsWith("…")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
  });

  it("does not open with an ellipsis when the match is at the start", () => {
    expect(makeSnippet(page, "Formative", 20).startsWith("…")).toBe(false);
  });

  it("falls back to the head of the page when the query is not literal", () => {
    const out = makeSnippet(page, "pedagogical epistemology", 20);
    expect(out.startsWith("Formative assessment")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
  });

  it("collapses whitespace so a PDF's line breaks do not reach the reader", () => {
    expect(makeSnippet("a\n\n  b\tc", "b", 5)).toBe("a b c");
  });

  it("is case-insensitive and safe on empty input", () => {
    expect(makeSnippet(page, "FORMATIVE", 5)).toContain("Formative");
    expect(makeSnippet("", "x")).toBe("");
  });

  it("adds no ellipsis when the whole page fits", () => {
    expect(makeSnippet("short page", "page", 90)).toBe("short page");
  });
});
