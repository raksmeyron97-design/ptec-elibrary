// lib/ai/entity.test.ts — one rule for "the work the reader named".
//
// Every case is a title from the live catalogue that one of the three old
// resolvers got wrong (docs/AI_BRAIN_2_AUDIT.md §3).

import { describe, expect, it } from "vitest";
import { orderedWordsPattern, rankByTitle, resolveTitle, titleMatch } from "./entity";

describe("titleMatch bands", () => {
  it("prefers the exact title over an edition that contains it", () => {
    // "Who wrote English for Writing Research Papers?" answered with the 2nd
    // edition because it is more downloaded and "contains" the query.
    expect(titleMatch("English for Writing Research Papers", "English for Writing Research Papers").band).toBe("exact");
    expect(titleMatch("English for Writing Research Papers (2nd Edition)", "English for Writing Research Papers").band).toBe("edition");
  });

  it("matches an edition-suffixed title from a query without the suffix, and vice versa", () => {
    expect(titleMatch("Interviewing as Qualitative Research (3rd Edition)", "Interviewing as Qualitative Research").band).toBe("edition");
    expect(titleMatch("Research Methods in Education (8th Edition)", "research methods in education 8th edition").band).toBe("normalized");
  });

  it("ignores case, diacritics and punctuation", () => {
    expect(titleMatch("From Teacher to Manager: Managing Language Teaching Organizations", "from teacher to manager managing language teaching organizations").band).toBe("normalized");
  });

  it("reads a prefix as the work, a containment as a candidate", () => {
    expect(titleMatch("Qualitative Research from Start to Finish (2nd Edition)", "Qualitative Research from Start").band).toBe("prefix");
    expect(titleMatch("Handbook of Methodological Approaches to Community-Based Research", "Community-Based Research").band).toBe("contains");
  });

  it("tolerates one typo per word, and calls it fuzzy rather than exact", () => {
    expect(titleMatch("Practical Research Methods", "Practicl Reserch Methods").band).toBe("fuzzy");
    expect(titleMatch("Practical Research Methods", "Practical Research Methods").band).toBe("exact");
  });

  it("does not let shared words claim identity", () => {
    // Two textbooks sharing "research" and "methods" are neighbours, not the
    // same book.
    const m = titleMatch("Research Methods in Education (8th Edition)", "Practical Research Methods");
    expect(["tokens", "none"]).toContain(m.band);
    expect(m.score).toBeLessThan(0.8);
  });

  it("returns none for empty input", () => {
    expect(titleMatch("", "x").band).toBe("none");
    expect(titleMatch("A Book", "").band).toBe("none");
  });
});

describe("rankByTitle / resolveTitle", () => {
  const pool = [
    { title: "Research Design: Qualitative, Quantitative and Mixed Methods Approaches", popularity: 900 },
    { title: "Research Methods in Education (8th Edition)", popularity: 500 },
    { title: "Interviewing as Qualitative Research (3rd Edition)", popularity: 3 },
    { title: "English for Writing Research Papers (2nd Edition)", popularity: 400 },
    { title: "English for Writing Research Papers", popularity: 20 },
  ];

  it("puts the named title first however unpopular it is", () => {
    const ranked = rankByTitle(pool, "Interviewing as Qualitative Research (3rd Edition)");
    expect(ranked[0].item.title).toBe("Interviewing as Qualitative Research (3rd Edition)");
    expect(ranked[0].match.band).toBe("exact");
  });

  it("lets popularity decide only inside a band", () => {
    const ranked = rankByTitle(pool, "research");
    // Every title contains "research"; the most downloaded leads.
    expect(ranked[0].item.title).toBe("Research Design: Qualitative, Quantitative and Mixed Methods Approaches");
  });

  it("resolves the exact edition over the more popular one", () => {
    const r = resolveTitle(pool, "English for Writing Research Papers");
    expect(r?.item.title).toBe("English for Writing Research Papers");
    expect(r?.match.band).toBe("exact");
  });

  it("prefers the row whose byline the query also names", () => {
    const withAuthors = [
      { title: "Practical Research Methods", author: "Catherine Dawson", popularity: 1 },
      { title: "Practical Research Methods", author: "Someone Else", popularity: 100 },
    ];
    expect(rankByTitle(withAuthors, "Practical Research Methods by Catherine Dawson")[0].item.author).toBe("Catherine Dawson");
  });

  it("refuses to resolve a work from shared words alone", () => {
    expect(resolveTitle(pool, "qualitative methods handbook")).toBeNull();
  });
});

describe("orderedWordsPattern", () => {
  it("drops the punctuation a reader does not type", () => {
    expect(orderedWordsPattern("Interviewing as Qualitative Research (3rd Edition)")).toBe(
      "%interviewing%as%qualitative%research%3rd%edition%",
    );
  });
  it("returns null for nothing usable", () => {
    expect(orderedWordsPattern("?")).toBeNull();
  });
});
