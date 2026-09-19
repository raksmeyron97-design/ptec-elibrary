// A match is a match in the reader's script.
//
// The candidate pool is built with an unanchored `ilike '%term%'` and that is
// correct — Khmer has no word boundaries, so a Khmer query must be able to
// match inside a run. The defect was that the SCORER asked the same unanchored
// question of Latin text, where boundaries exist and an infix is an accident.
// Both halves of that sentence are load-bearing, so both are tested here: the
// Latin rule tightens and the Khmer rule must not.

import { describe, expect, it } from "vitest";

import { normalizeSearchText, termMatches } from "./normalize";
import { prepareQuery, searchScore, type Candidate } from "./ranking";

const match = (haystack: string, term: string) =>
  termMatches(normalizeSearchText(haystack), normalizeSearchText(term));

describe("termMatches — Latin terms must begin a word", () => {
  it("refuses the infix matches production was scoring", () => {
    // Every pair here was observed on https://library.ptec.edu.kh on
    // 2026-09-19: "blockchain cryptocurrency mining" returned four education
    // titles and "formula one aerodynamics" returned twenty-six, in a library
    // holding nothing on either subject.
    expect(match("Examining Lesson Quality", "mining")).toBe(false);
    expect(match("Lesson 9: Using a Smartphone Camera", "one")).toBe(false);
    expect(match("Mobile Phones and Internet Use in Cambodia 2016", "one")).toBe(false);
    expect(match("Story Telling", "to")).toBe(false);
  });

  it("keeps the truncation people actually search with", () => {
    // Prefix, not whole word: typing the stem of a word is how a reader
    // searches, and refusing it would trade one precision defect for a worse
    // recall one.
    expect(match("Researching Education", "research")).toBe(true);
    expect(match("Elementary Survey Sampling", "sampl")).toBe(true);
    expect(match("Qualitative Research Methods", "method")).toBe(true);
  });

  it("matches at the start of the text as well as after a space", () => {
    expect(match("Mining and Minerals", "mining")).toBe(true);
    expect(match("One Hundred Lessons", "one")).toBe(true);
  });

  it("treats punctuation as a boundary, because normalization already does", () => {
    expect(match("Research-Based Teaching", "based")).toBe(true);
    expect(match("Lesson 9: Using a Camera", "using")).toBe(true);
  });
});

describe("termMatches — Khmer keeps substring matching", () => {
  it("still finds a Khmer term inside a run", () => {
    // ការចិញ្ចឹម = "raising/farming". There is no boundary between it and what
    // follows, so this is a real partial match and the only kind Khmer has.
    expect(match("ការចិញ្ចឹមមាន់", "ការចិញ្ចឹម")).toBe(true);
    expect(match("ធរណីមាត្រក្នុងលំហ", "ក្នុងលំហ")).toBe(true);
    expect(match("គណិតវិទ្យា ថ្នាក់ទី៩", "គណិតវិទ្យា")).toBe(true);
  });

  it("does not apply the Latin rule to a mixed-script query term", () => {
    // A term containing Khmer is a Khmer term; asking it to begin a word would
    // silently break every Khmer search, which is most of this collection.
    expect(match("សៀវភៅណែនាំគ្រូបង្រៀន គណិតវិទ្យា", "គ្រូបង្រៀន")).toBe(true);
  });

  it("finds a Latin word inside a Khmer title", () => {
    expect(match("ការវិភាគទិន្នន័យតាម SPSS 16.0", "spss")).toBe(true);
  });
});

// ── The consequence in the relevance model ───────────────────────────────────

const candidate = (over: Partial<Candidate>): Candidate =>
  ({
    id: "id",
    ref: "ref",
    type: "book",
    title: "",
    author: "",
    coverUrl: null,
    url: "/books/ref",
    searchableText: "",
    titleText: "",
    authorText: "",
    subjectText: "",
    keywordText: "",
    bodyText: "",
    dateValue: 0,
    popularityValue: 0,
    ...over,
  }) as Candidate;

const score = (row: Candidate, q: string) =>
  searchScore(row, prepareQuery(q), new Set()).score ?? 0;

describe("searchScore", () => {
  it("scores nothing for a row whose only match was an infix", () => {
    const row = candidate({
      title: "Examining Lesson Quality",
      titleText: "Examining Lesson Quality",
      searchableText: "Examining Lesson Quality",
    });
    expect(score(row, "blockchain cryptocurrency mining")).toBe(0);
  });

  it("still scores a row that matches a whole word", () => {
    const row = candidate({
      title: "The Book of GEET Book One Basic Science",
      titleText: "The Book of GEET Book One Basic Science",
      searchableText: "The Book of GEET Book One Basic Science",
    });
    expect(score(row, "formula one aerodynamics")).toBeGreaterThan(0);
  });

  it("leaves an exact title match at the top of the model", () => {
    const row = candidate({
      title: "Practical Research Methods",
      titleText: "Practical Research Methods",
      searchableText: "Practical Research Methods",
    });
    expect(score(row, "Practical Research Methods")).toBeGreaterThanOrEqual(260);
  });

  it("leaves Khmer retrieval exactly as it was", () => {
    const row = candidate({
      title: "ការចិញ្ចឹមមាន់",
      titleText: "ការចិញ្ចឹមមាន់",
      searchableText: "ការចិញ្ចឹមមាន់",
    });
    expect(score(row, "ការចិញ្ចឹម")).toBeGreaterThan(0);
  });

  it("does not let a subject or keyword infix rescue an unrelated row", () => {
    const row = candidate({
      title: "Quantitative Data Analysis in Education",
      titleText: "Quantitative Data Analysis in Education",
      subjectText: "Education",
      keywordText: "statistics education",
      bodyText: "An introduction to quantitative data analysis.",
      searchableText: "Quantitative Data Analysis in Education statistics education",
    });
    expect(score(row, "blockchain cryptocurrency mining")).toBe(0);
  });
});

describe("the route drops what the model said nothing about", () => {
  it("filters zero-score rows for every query, not only an ISBN one", async () => {
    // The rule and its reasoning already existed for ISBN queries; the pool is
    // built the same unanchored way for all of them. A source scan, because
    // the route needs a database to run and this is a statement about its
    // shape (docs/SEARCH-QUALITY-2026-09.md §3).
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(
      join(__dirname, "..", "..", "app", "api", "search", "native", "route.ts"),
      "utf8",
    );
    const fn = source.slice(source.indexOf("function rankCandidates("));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain('query.normalized');
    expect(body).toContain('(r.score ?? 0) > 0 || protectedIds.has(r.id)');
    // The trigram seeds are exempt: the index made a positive claim the term
    // scorer cannot see, which is the whole reason the fuzzy pass exists.
    expect(body).toContain("seedIds");
    // The pool count is CORRECTED by the drops, never replaced by the page
    // that survived — that would understate a broad query by the fetch limit.
    expect(body).toContain("(count ?? 0) - dropped");
  });
});
