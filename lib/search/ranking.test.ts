// The relevance model's contract. Every case is a shape the PTEC collection
// actually has: two editions of one textbook, a ministry author with 45
// titles, Khmer titles that differ only in a grade numeral, ISBNs stored
// hyphenated and typed bare.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  POPULARITY_CAP_RATIO,
  RANKING_WEIGHTS,
  compareBySort,
  pageHitKey,
  parseSort,
  prepareQuery,
  searchScore,
  type Candidate,
  type SearchResult,
  type SearchSort,
} from "./ranking";

let seq = 0;
function candidate(over: Partial<Candidate> & { title: string }): Candidate {
  seq += 1;
  const id = over.id ?? `id-${String(seq).padStart(3, "0")}`;
  return {
    id,
    ref: over.ref ?? id,
    type: "book",
    author: "",
    coverUrl: null,
    url: `/books/${id}`,
    views: 0,
    downloadCount: 0,
    rating: null,
    searchableText: [over.title, over.authorText, over.subjectText, over.keywordText, over.bodyText].filter(Boolean).join(" "),
    titleText: over.title,
    authorText: "",
    subjectText: "",
    keywordText: "",
    bodyText: "",
    dateValue: 0,
    popularityValue: 0,
    ...over,
  };
}

const none = new Set<string>();
const score = (row: Candidate, q: string, hits = none) => searchScore(row, prepareQuery(q), hits);

describe("searchScore — field order", () => {
  it("ranks exact title above prefix above contains", () => {
    const exact = score(candidate({ title: "Practical Research Methods" }), "Practical Research Methods");
    const prefix = score(candidate({ title: "Practical Research Methods for Teachers" }), "Practical Research Methods");
    const contains = score(candidate({ title: "A Guide to Practical Research Methods" }), "Practical Research Methods");
    expect(exact.score!).toBeGreaterThan(prefix.score!);
    expect(prefix.score!).toBeGreaterThan(contains.score!);
    expect(exact.matchedFields).toEqual(["title"]);
  });

  it("puts an exact ISBN above a title prefix and below an exact title", () => {
    const q = "978-1-4739-4629-3";
    const byIsbn = score(candidate({ title: "100 Activities for Teaching Research Methods", isbn: "9781473946293" }), q);
    const prefix = score(candidate({ title: "978-1-4739-4629-3 and more" }), q);
    expect(byIsbn.matchedFields).toContain("isbn");
    expect(byIsbn.score!).toBeGreaterThan(prefix.score!);
    expect(RANKING_WEIGHTS.isbnExact).toBeLessThan(RANKING_WEIGHTS.titleExact);
  });

  it("matches an ISBN across ISBN-10 / ISBN-13 / hyphenation", () => {
    const stored = candidate({ title: "Action Research in Practice", isbn: "0-415-17152-0" });
    for (const q of ["9780415171526", "0415171520", "978-0-415-17152-6", "0 415 17152 0"]) {
      expect(score(stored, q).matchedFields, q).toContain("isbn");
    }
  });

  it("does not treat digits inside a title as an ISBN", () => {
    const row = candidate({ title: "ការវិភាគទិន្នន័យតាម SPSS 16.0", isbn: "9780000000001" });
    expect(score(row, "SPSS 16.0").matchedFields).not.toContain("isbn");
  });

  it("author, subject, keywords and abstract score in that order", () => {
    const q = "creswell";
    const authorExact = score(candidate({ title: "x", authorText: "Creswell" }), q).score!;
    const author = score(candidate({ title: "x", authorText: "John W. Creswell" }), q).score!;
    const subjectExact = score(candidate({ title: "x", subjectText: "creswell" }), q).score!;
    const subject = score(candidate({ title: "x", subjectText: "creswell studies" }), q).score!;
    const keywords = score(candidate({ title: "x", keywordText: "creswell design" }), q).score!;
    const abstract = score(candidate({ title: "x", bodyText: "after creswell (2014)" }), q).score!;
    expect(authorExact).toBeGreaterThan(subjectExact);
    expect(subjectExact).toBeGreaterThan(author);
    expect(author).toBeGreaterThan(subject);
    expect(subject).toBeGreaterThan(keywords);
    expect(keywords).toBeGreaterThan(abstract);
  });
});

describe("searchScore — normalization", () => {
  it("matches a hyphenated title from a spaced query and vice versa", () => {
    expect(score(candidate({ title: "Competency-based Language Teaching" }), "competency based language teaching").matchedFields).toContain("title");
    expect(score(candidate({ title: "Competency based Language Teaching" }), "competency-based").matchedFields).toContain("title");
  });

  it("matches a Khmer title with its vowel signs and subscripts intact", () => {
    const row = candidate({ title: "ការសិក្សាបែបសកម្ម (Active Learning)" });
    const r = score(row, "ការសិក្សាបែបសកម្ម");
    expect(r.matchedFields).toContain("title");
    expect(r.score!).toBeGreaterThanOrEqual(RANKING_WEIGHTS.titlePrefix);
  });

  it("tells grade-numbered Khmer titles apart", () => {
    const g9 = score(candidate({ title: "កិច្ចតែងការភាសាខ្មែរ ថ្នាក់ទី៩" }), "កិច្ចតែងការភាសាខ្មែរ ថ្នាក់ទី៩");
    const g8 = score(candidate({ title: "កិច្ចតែងការភាសាខ្មែរ ថ្នាក់ទី៨" }), "កិច្ចតែងការភាសាខ្មែរ ថ្នាក់ទី៩");
    expect(g9.score!).toBeGreaterThan(g8.score!);
  });

  it("folds Latin diacritics on both sides", () => {
    expect(score(candidate({ title: "Zoë's Classroom" }), "zoe").matchedFields).toContain("title");
  });

  it("credits a term one typo away from a title word, below an exact term", () => {
    const q = "Practicl Research Methods";
    const typo = score(candidate({ title: "Practical Research Methods" }), q);
    const partial = score(candidate({ title: "A-Z of Digital Research Methods" }), q);
    expect(typo.score!).toBeGreaterThan(partial.score!);
    expect(typo.score! - partial.score!).toBeLessThan(RANKING_WEIGHTS.termTitle);
  });

  it("gives no typo credit to short terms or Khmer terms", () => {
    expect(score(candidate({ title: "Data Analysis" }), "dta").matchedFields).toEqual([]);
    expect(score(candidate({ title: "ការសិក្សាបែបសកម្ម" }), "ការសិក្សាបែបសកម្មម").matchedFields).toEqual([]);
  });

  it("scores a multi-word query as a phrase AND as terms, phrase winning", () => {
    const phrase = score(candidate({ title: "Classroom Management for Primary Teachers" }), "classroom management");
    const scattered = score(candidate({ title: "Management of the Primary Classroom" }), "classroom management");
    expect(phrase.score!).toBeGreaterThan(scattered.score!);
    expect(scattered.matchedFields).toContain("title");
  });
});

describe("searchScore — relevance dominates popularity", () => {
  it("never lets a popular weak match overtake an unpopular strong match", () => {
    const q = "classroom management";
    const strongQuiet = score(candidate({ title: "Classroom Management", views: 0, downloadCount: 0 }), q);
    const weakPopular = score(candidate({ title: "Teaching", bodyText: "notes on classroom management", views: 5000, downloadCount: 5000, rating: 5, year: new Date().getFullYear() }), q);
    expect(strongQuiet.score!).toBeGreaterThan(weakPopular.score!);
  });

  it("caps the boost at a fraction of relevance and gives an unmatched record none", () => {
    const q = "research";
    const quiet = score(candidate({ title: "Research" }), q);
    const loud = score(candidate({ title: "Research", views: 5000, downloadCount: 5000, rating: 5, year: new Date().getFullYear() }), q);
    expect(loud.score! - quiet.score!).toBeLessThanOrEqual(quiet.score! * POPULARITY_CAP_RATIO + 0.01);
    expect(loud.score!).toBeGreaterThan(quiet.score!);

    const unmatched = score(candidate({ title: "Chemistry", views: 5000, downloadCount: 5000, rating: 5 }), q);
    expect(unmatched.score).toBe(0);
    expect(unmatched.matchedFields).toEqual([]);
  });

  it("credits a PDF page hit to the parent record", () => {
    const row = candidate({ id: "b1", title: "Interviewing as Qualitative Research" });
    const hit = score(row, "ebbs and flows", new Set([pageHitKey("book", "b1")]));
    expect(hit.matchedFields).toEqual(["pdf"]);
    expect(hit.score).toBe(RANKING_WEIGHTS.pdfPage);
  });

  it("strips the scorer-only text from the result", () => {
    const r = score(candidate({ title: "x", bodyText: "secret abstract" }), "x") as SearchResult & { bodyText?: string; searchableText?: string };
    expect(r.bodyText).toBeUndefined();
    expect(r.searchableText).toBeUndefined();
  });
});

describe("compareBySort — total order", () => {
  const rows: SearchResult[] = [
    { id: "c", ref: "c", type: "book", title: "Alpha", author: "", coverUrl: null, url: "/c", year: 2020, views: 5, downloadCount: 1, rating: 4, score: 10 },
    { id: "a", ref: "a", type: "book", title: "alpha", author: "", coverUrl: null, url: "/a", year: 2020, views: 5, downloadCount: 1, rating: 4, score: 10 },
    { id: "b", ref: "b", type: "book", title: "Beta", author: "", coverUrl: null, url: "/b", year: 2021, views: 9, downloadCount: 0, rating: null, score: 10 },
    { id: "d", ref: "d", type: "research", title: "Gamma", author: "", coverUrl: null, url: "/d", year: null, views: 0, downloadCount: 7, rating: 2, score: 30 },
  ];
  const sorts: SearchSort[] = ["relevance", "newest", "oldest", "title", "views", "downloads", "rating"];

  function shuffled<T>(input: T[], seed: number): T[] {
    const out = [...input];
    let s = seed;
    for (let i = out.length - 1; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280;
      const j = Math.floor((s / 233280) * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  for (const sort of sorts) {
    it(`${sort}: the same set sorts identically from any input order`, () => {
      const reference = [...rows].sort((a, b) => compareBySort(a, b, sort)).map((r) => r.id);
      for (const seed of [1, 7, 42, 99]) {
        expect(shuffled(rows, seed).sort((a, b) => compareBySort(a, b, sort)).map((r) => r.id)).toEqual(reference);
      }
    });
  }

  it("breaks a full tie by id", () => {
    const a = { ...rows[0], id: "a" };
    const b = { ...rows[0], id: "b" };
    expect(compareBySort(a, b, "relevance")).toBeLessThan(0);
    expect(compareBySort(b, a, "relevance")).toBeGreaterThan(0);
    expect(compareBySort(a, a, "relevance")).toBe(0);
  });

  it("relevance is the default and legacy aliases still parse", () => {
    expect(parseSort(null)).toBe("relevance");
    expect(parseSort("most_viewed")).toBe("views");
    expect(parseSort("top_rated")).toBe("rating");
    expect(parseSort("nonsense")).toBe("relevance");
  });
});

describe("the route delegates to this module", () => {
  it("defines no scorer, sorter or normalizer of its own", () => {
    const src = readFileSync(join(process.cwd(), "app/api/search/native/route.ts"), "utf8");
    for (const banned of ["function searchScore(", "function compareBySort(", "function normalize(", "function tokenize(", "function parseSort("]) {
      expect(src, banned).not.toContain(banned);
    }
    expect(src).toContain('from "@/lib/search/ranking"');
  });
});
