/**
 * "Search in: …" on the Physical Library — which columns a query reaches, and
 * that nothing a reader types can become PostgREST structure or a wildcard.
 */
import { describe, it, expect } from "vitest";
import {
  CATALOG_SEARCH_SCOPES,
  catalogSearchLegs,
  isbnSearchDigits,
  looksLikeIsbn,
  parseSearchScope,
  sanitizeOrTerm,
  sanitizeValueTerm,
} from "@/lib/catalogs/search-scope";

describe("parseSearchScope", () => {
  it("accepts every published scope", () => {
    for (const s of CATALOG_SEARCH_SCOPES) expect(parseSearchScope(s)).toBe(s);
  });

  it("falls back to all fields for anything else — including the empty value the form submits", () => {
    for (const raw of [undefined, null, "", "keywords", "TITLE", "title "]) {
      expect(parseSearchScope(raw)).toBe("all");
    }
  });
});

describe("sanitising what a reader typed", () => {
  it("the .or() term loses structure characters and every wildcard", () => {
    expect(sanitizeOrTerm("a,b(c).d")).toBe("a b c d");
    expect(sanitizeOrTerm("100% _x_ *")).toBe("100 x");
    expect(sanitizeOrTerm("  lots   of   space ")).toBe("lots of space");
  });

  it("a value term keeps its dots (DDC, 'Vol. 2') but still no wildcards", () => {
    expect(sanitizeValueTerm("372.7")).toBe("372.7");
    expect(sanitizeValueTerm("Vol. 2")).toBe("Vol. 2");
    expect(sanitizeValueTerm("*")).toBe("");
    expect(sanitizeValueTerm("%_")).toBe("");
  });
});

describe("ISBN queries", () => {
  it("are matched as the stored digits", () => {
    expect(isbnSearchDigits("978-9924-100-01-4")).toBe("9789924100014");
    expect(isbnSearchDigits("0 306 40615 x")).toBe("030640615X");
  });

  it("are recognised only when the query is an ISBN and nothing else", () => {
    expect(looksLikeIsbn("978-9924-100-01-4")).toBe(true);
    expect(looksLikeIsbn("030640615X")).toBe(true);
    expect(looksLikeIsbn("372.7")).toBe(false);          // a DDC class
    expect(looksLikeIsbn("2019")).toBe(false);           // a year
    expect(looksLikeIsbn("grade 12 maths 978")).toBe(false);
    expect(looksLikeIsbn("97899241000")).toBe(false);    // 11 digits
  });
});

describe("catalogSearchLegs", () => {
  it("all fields: the historical .or() leg plus the DDC leg, dot intact", () => {
    expect(catalogSearchLegs("372.7", "all")).toEqual([
      { kind: "or", filter: "title.ilike.%372 7%,author.ilike.%372 7%,isbn.ilike.%372 7%,accession_number.ilike.%372 7%" },
      { kind: "ilike", column: "ddc", pattern: "%372.7%" },
    ]);
  });

  it("all fields: a hyphenated ISBN also searches the stored digits", () => {
    const legs = catalogSearchLegs("978-9924-100-01-4", "all");
    expect(legs).toContainEqual({ kind: "ilike", column: "isbn", pattern: "%9789924100014%" });
  });

  it("all fields: never adds the ISBN leg for an ordinary word", () => {
    expect(catalogSearchLegs("teaching", "all").some((l) => l.kind === "ilike" && l.column === "isbn")).toBe(false);
  });

  it("each narrow scope reaches its own column only", () => {
    expect(catalogSearchLegs("Hattie", "author")).toEqual([{ kind: "ilike", column: "author", pattern: "%Hattie%" }]);
    expect(catalogSearchLegs("Vol. 2", "title")).toEqual([{ kind: "ilike", column: "title", pattern: "%Vol. 2%" }]);
    expect(catalogSearchLegs("អប់រំ", "subject")).toEqual([{ kind: "ilike", column: "category", pattern: "%អប់រំ%" }]);
    expect(catalogSearchLegs("978-0-306-40615-7", "isbn")).toEqual([
      { kind: "ilike", column: "isbn", pattern: "%9780306406157%" },
      // …and as typed, for a row stored before normalisation.
      { kind: "ilike", column: "isbn", pattern: "%978-0-306-40615-7%" },
    ]);
    expect(catalogSearchLegs("9780306406157", "isbn")).toEqual([
      { kind: "ilike", column: "isbn", pattern: "%9780306406157%" },
    ]);
    expect(catalogSearchLegs("371.1 HAT", "callnumber")).toEqual([
      { kind: "ilike", column: "ddc", pattern: "%371.1 HAT%" },
      { kind: "ilike", column: "shelf_location", pattern: "%371.1 HAT%" },
    ]);
  });

  it("Khmer passes through untouched", () => {
    expect(catalogSearchLegs("គណិតវិទ្យា ថ្នាក់ទី៤", "title")).toEqual([
      { kind: "ilike", column: "title", pattern: "%គណិតវិទ្យា ថ្នាក់ទី៤%" },
    ]);
  });

  it("a query with nothing searchable in its scope has NO legs — the page answers no results, never everything", () => {
    expect(catalogSearchLegs("*", "all")).toEqual([]);
    expect(catalogSearchLegs("%%", "title")).toEqual([]);
    expect(catalogSearchLegs("no digits", "isbn")).toEqual([]);
  });

  it("no leg ever carries a reader-supplied wildcard or .or() separator into its value", () => {
    const hostile = "a%b_c*d),title.eq.x(";
    for (const scope of CATALOG_SEARCH_SCOPES) {
      for (const leg of catalogSearchLegs(hostile, scope)) {
        const value = leg.kind === "or" ? leg.filter : leg.pattern;
        // Only the wildcards this module wraps the term in may remain.
        const inner = leg.kind === "or"
          ? value.split(",").map((part) => part.replace(/^[a-z_]+\.ilike\.%/, "").replace(/%$/, ""))
          : [value.replace(/^%/, "").replace(/%$/, "")];
        for (const term of inner) expect(term).not.toMatch(/[%_*(),]/);
        if (leg.kind === "or") expect(value.split(",")).toHaveLength(4);
      }
    }
  });
});
