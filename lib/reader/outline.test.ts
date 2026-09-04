import { describe, expect, it } from "vitest";
import { currentSectionIndex, flattenOutline, sectionTitleForPage, type FlatOutlineEntry } from "./outline";

const tree = [
  { title: "Introduction", dest: "intro", items: [] },
  {
    title: "Literature Review",
    dest: "lit",
    items: [
      { title: "Working memory", dest: "wm", items: [] },
      { title: "  ", dest: null, items: [{ title: "Deep", dest: "deep", items: [] }] },
    ],
  },
  { title: "Methodology", dest: ["ref", { name: "XYZ" }], items: [] },
];

describe("flattenOutline", () => {
  it("numbers the top level, indents children, keeps stable ids", () => {
    const flat = flattenOutline(tree);
    expect(flat.map((e) => [e.number, e.depth, e.title])).toEqual([
      ["01", 0, "Introduction"],
      ["02", 0, "Literature Review"],
      ["", 1, "Working memory"],
      ["", 1, "—"],
      ["", 2, "Deep"],
      ["03", 0, "Methodology"],
    ]);
    expect(flat.map((e) => e.id)).toEqual(["0", "1", "1.0", "1.1", "1.1.0", "2"]);
    expect(flat.every((e) => e.page === null)).toBe(true);
  });
  it("handles a missing outline", () => {
    expect(flattenOutline(null)).toEqual([]);
    expect(flattenOutline(undefined)).toEqual([]);
  });
});

describe("currentSectionIndex / sectionTitleForPage", () => {
  const entries: FlatOutlineEntry[] = flattenOutline(tree).map((e, i) => ({
    ...e,
    page: [1, 10, 12, null, 15, 40][i] ?? null,
  }));

  it("finds the last heading at or before the page, skipping unresolved ones", () => {
    expect(currentSectionIndex(entries, 1)).toBe(0);
    expect(currentSectionIndex(entries, 11)).toBe(1);
    expect(currentSectionIndex(entries, 13)).toBe(2);
    expect(currentSectionIndex(entries, 20)).toBe(4);
    expect(currentSectionIndex(entries, 400)).toBe(5);
  });
  it("prefers the more specific heading when two start on the same page", () => {
    const same = entries.map((e) => ({ ...e, page: e.page === 12 ? 10 : e.page }));
    expect(currentSectionIndex(same, 10)).toBe(2);
  });
  it("is -1 / null before the first heading or with no pages resolved", () => {
    expect(currentSectionIndex(entries.map((e) => ({ ...e, page: null })), 5)).toBe(-1);
    expect(sectionTitleForPage(entries, 0)).toBeNull();
    expect(sectionTitleForPage(entries, 42)).toBe("Methodology");
  });
});
