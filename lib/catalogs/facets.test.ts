/**
 * Facet counts on the Physical Library: disjunctive, exact, and never in
 * disagreement with the result a pill links to.
 */
import { describe, it, expect } from "vitest";
import {
  computeFacets,
  canonicalLanguage,
  facetPointOf,
  languageLabelKey,
  languageSpellings,
  matchesSelection,
  tabulateFacets,
  type FacetSourceRow,
} from "@/lib/catalogs/facets";

const EDU = "370 អប់រំ និងគរុកោសល្យ";
const SCI = "500 វិទ្យាសាស្ត្រធម្មជាតិ និងគណិតវិទ្យា";
const LIT = "800 អក្សរសិល្ប៍";

function rows(): FacetSourceRow[] {
  const r = (category: string | null, language: string | null, copies_available: number | null, n = 1) =>
    Array.from({ length: n }, () => ({ category, language, copies_available }));
  return [
    ...r(EDU, "km", 2, 5),
    ...r(EDU, "en", 0, 2),
    ...r(SCI, "km", 1, 3),
    ...r(SCI, "en", 1, 1),
    ...r(LIT, "km", 0, 1),
    ...r(null, "km", 1, 2),   // no category
    ...r("  ", "en", 1, 1),   // blank category reads as none
    ...r(EDU, null, 3, 1),    // no language
  ];
}

describe("tabulateFacets", () => {
  it("collapses rows into one cell per combination without losing a record", () => {
    const cells = tabulateFacets(rows());
    expect(cells.reduce((n, c) => n + c.count, 0)).toBe(rows().length);
    expect(cells.length).toBeLessThan(rows().length);
    expect(cells.find((c) => c.category === EDU && c.language === "km" && c.available)?.count).toBe(5);
  });

  it("treats a blank category as absent", () => {
    expect(facetPointOf({ category: "  ", language: "en", copies_available: 1 }).category).toBeNull();
  });
});

describe("computeFacets", () => {
  const cells = tabulateFacets(rows());

  it("with nothing selected, counts the whole catalogue", () => {
    const f = computeFacets(cells, { availableOnly: false });
    expect(f.total).toBe(16);
    expect(f.anyCategory).toBe(16);
    expect(f.categories).toEqual([
      { value: EDU, count: 8 },
      { value: SCI, count: 4 },
      { value: LIT, count: 1 },
    ]);
    expect(f.languages).toEqual([{ value: "km", count: 11 }, { value: "en", count: 4 }]);
    expect(f.available).toBe(13);
  });

  it("'All' counts records with no category too — it is not the sum of the chips", () => {
    const f = computeFacets(cells, { availableOnly: false });
    const chips = f.categories.reduce((n, c) => n + c.count, 0);
    expect(f.anyCategory).toBe(16);
    expect(chips).toBe(13);
  });

  it("is disjunctive: a dimension ignores its own selection and honours the others", () => {
    const f = computeFacets(cells, { language: "en", availableOnly: false });
    // The language row still offers Khmer, with its full count…
    expect(f.languages).toEqual([{ value: "km", count: 11 }, { value: "en", count: 4 }]);
    // …while the category row counts English records only.
    expect(f.categories).toEqual([{ value: EDU, count: 2 }, { value: SCI, count: 1 }]);
    expect(f.total).toBe(4);
    expect(f.available).toBe(2);
  });

  it("every count equals the number of records the pill would show", () => {
    const sel = { category: EDU, availableOnly: true };
    const f = computeFacets(cells, sel);
    const points = rows().map(facetPointOf);
    for (const { value, count } of f.languages) {
      expect(count).toBe(points.filter((p) => matchesSelection(p, { ...sel, language: value })).length);
    }
    for (const { value, count } of f.categories) {
      expect(count).toBe(points.filter((p) => matchesSelection(p, { ...sel, category: value })).length);
    }
    expect(f.available).toBe(points.filter((p) => matchesSelection(p, sel)).length);
    expect(f.total).toBe(points.filter((p) => matchesSelection(p, sel)).length);
  });

  it("matches a category exactly — a prefix is not the category", () => {
    const f = computeFacets(cells, { category: "370", availableOnly: false });
    expect(f.total).toBe(0);
  });

  it("orders DDC-prefixed categories by class number", () => {
    const f = computeFacets(
      tabulateFacets([
        { category: "900 ប្រវត្តិសាស្ត្រ", language: "km", copies_available: 1 },
        { category: "90 x", language: "km", copies_available: 1 },
        { category: "000 ចំណេះដឹងទូទៅ", language: "km", copies_available: 1 },
      ]),
      { availableOnly: false },
    );
    expect(f.categories.map((c) => c.value)).toEqual(["000 ចំណេះដឹងទូទៅ", "90 x", "900 ប្រវត្តិសាស្ត្រ"]);
  });

  it("an empty catalogue has empty facets, not an error", () => {
    expect(computeFacets([], { availableOnly: true })).toEqual({
      total: 0, anyCategory: 0, categories: [], languages: [], available: 0,
    });
  });
});

describe("languageLabelKey", () => {
  it("labels codes and the names older rows carry", () => {
    expect(languageLabelKey("km")).toBe("langKm");
    expect(languageLabelKey("Khmer")).toBe("langKm");
    expect(languageLabelKey("ខ្មែរ")).toBe("langKm");
    expect(languageLabelKey(" English ")).toBe("langEn");
    expect(languageLabelKey("fr")).toBe("langFr");
    expect(languageLabelKey("de")).toBe("langOther");
  });
});

describe("language folding", () => {
  it("folds known spellings to one code and leaves the rest as stored", () => {
    expect(canonicalLanguage("English")).toBe("en");
    expect(canonicalLanguage(" khmer ")).toBe("km");
    expect(canonicalLanguage("ខ្មែរ")).toBe("km");
    expect(canonicalLanguage("de")).toBe("de");
    expect(canonicalLanguage("  ")).toBeNull();
    expect(canonicalLanguage(null)).toBeNull();
  });

  it("counts a name and its code as one language", () => {
    const f = computeFacets(
      tabulateFacets([
        { category: null, language: "en", copies_available: 1 },
        { category: null, language: "English", copies_available: 1 },
        { category: null, language: "km", copies_available: 1 },
      ]),
      { availableOnly: false },
    );
    expect(f.languages).toEqual([{ value: "en", count: 2 }, { value: "km", count: 1 }]);
  });

  it("gives SQL the spellings a code was folded from — and nothing for an unknown value", () => {
    for (const code of ["km", "en", "fr", "zh"]) {
      for (const spelling of languageSpellings(code) ?? []) {
        expect(canonicalLanguage(spelling)).toBe(code);
        // Safe inside an .or() string: no structure characters, no wildcards.
        expect(spelling).not.toMatch(/[(),.%_*\\]/);
      }
    }
    expect(languageSpellings("de")).toBeNull();
    expect(languageSpellings("toString")).toBeNull();
  });
});
