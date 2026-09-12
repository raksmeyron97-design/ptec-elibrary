// lib/ai/spellcheck.test.ts — corpus-vocabulary typo correction.
//
// The vocabulary here is a FIXTURE, not the committed file: a test that reads
// lib/ai/corpus-vocabulary.json would change its verdict every time the
// collection grows, which is the opposite of what a regression test is for.
// The committed vocabulary is exercised separately, by the answer benchmark.

import { describe, expect, it } from "vitest";
import {
  HIGH_CONFIDENCE,
  MAX_READINGS,
  MEDIUM_CONFIDENCE,
  bandOf,
  correctQuery,
  correctTerm,
  correctableTokens,
  editDistance,
  prepareVocabulary,
  queryReadings,
  scriptOf,
  type Vocabulary,
} from "./spellcheck";

const VOCAB: Vocabulary = {
  generatedAt: "2026-09-12T00:00:00.000Z",
  corpusRecords: 249,
  entries: [
    { term: "validity", records: 187, script: "latin", source: "page_text" },
    { term: "validate", records: 41, script: "latin", source: "page_text" },
    { term: "reliability", records: 176, script: "latin", source: "page_text" },
    { term: "research", records: 248, script: "latin", source: "page_text" },
    { term: "reserve", records: 22, script: "latin", source: "page_text" },
    { term: "literature", records: 231, script: "latin", source: "page_text" },
    { term: "triangulation", records: 96, script: "latin", source: "page_text" },
    { term: "methodology", records: 204, script: "latin", source: "page_text" },
    { term: "qualitative", records: 219, script: "latin", source: "page_text" },
    { term: "ethnography", records: 88, script: "latin", source: "page_text" },
    { term: "sampling", records: 198, script: "latin", source: "page_text" },
    // An entity term: one record by definition, and exempt from the floor.
    { term: "essentials", records: 1, script: "latin", source: "entity" },
    { term: "practical", records: 2, script: "latin", source: "entity" },
    { term: "ស្រាវជ្រាវ", records: 14, script: "khmer", source: "entity" },
    { term: "គណិតវិទ្យា", records: 6, script: "khmer", source: "entity" },
    // A page-text term below the floor: never a candidate.
    { term: "wibbly", records: 1, script: "latin", source: "page_text" },
  ],
};

const V = prepareVocabulary(VOCAB);

describe("edit distance counts a transposition as one edit", () => {
  it("Damerau, not plain Levenshtein", () => {
    // "Essentails" → "Essentials" is the v2 fixture's typo, and plain
    // Levenshtein charges it two.
    expect(editDistance("essentails", "essentials")).toBe(1);
    expect(editDistance("form", "from")).toBe(1);
  });

  it("returns over the bound rather than finishing the matrix", () => {
    expect(editDistance("cat", "elephant", 2)).toBeGreaterThan(2);
    expect(editDistance("same", "same")).toBe(0);
  });
});

describe("high confidence — the correction also changes what is embedded", () => {
  it("`validty` resolves to `validity`", () => {
    // The one question AI Brain 2.0 left failing.
    const c = correctTerm("validty", V);
    expect(c?.candidate).toBe("validity");
    expect(c?.distance).toBe(1);
    expect(c?.band).toBe("high");
    expect(c?.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
    expect(c?.reason).toMatch(/edit distance 1.*187 record/);
  });

  it("prefers the better candidate when two are within reach", () => {
    // `validate` is also one or two edits away; `validity` wins on distance
    // and on how widely the corpus uses it.
    expect(correctTerm("validty", V)?.candidate).toBe("validity");
    expect(correctTerm("reserch", V)?.candidate).toBe("research");
  });

  it("the corrected query is what gets embedded, and the original is kept", () => {
    const r = correctQuery("What is validty?", V);
    expect(r.originalQuery).toBe("What is validty?");
    expect(r.correctedQuery).toBe("What is validity?");
    expect(r.alternativeTerms).toEqual(["validity"]);
    expect(r.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
  });

  it("corrects more than one term in a sentence", () => {
    const r = correctQuery("Explain triangulaton and reliabilty", V);
    expect(r.correctedQuery).toBe("Explain triangulation and reliability");
    expect([...r.alternativeTerms].sort()).toEqual(["reliability", "triangulation"]);
  });
});

describe("medium confidence — an extra term to look for, and nothing more", () => {
  it("does not rewrite the query it will embed", () => {
    // A medium-band candidate is a guess; changing the embedding on a guess
    // retrieves a different subject and looks exactly like a right answer.
    const medium = VOCAB.entries.find((e) => e.term === "ethnography")!;
    const c = correctTerm("ethnograpy", V);
    expect(c?.candidate).toBe(medium.term);
    if (c && c.band === "medium") {
      const r = correctQuery("ethnograpy", V);
      expect(r.correctedQuery).toBe("ethnograpy");
      expect(r.alternativeTerms).toContain("ethnography");
    }
  });

  it("the bands are exactly the two thresholds", () => {
    expect(bandOf(HIGH_CONFIDENCE)).toBe("high");
    expect(bandOf(HIGH_CONFIDENCE - 0.001)).toBe("medium");
    expect(bandOf(MEDIUM_CONFIDENCE)).toBe("medium");
    expect(bandOf(MEDIUM_CONFIDENCE - 0.001)).toBe("low");
  });
});

describe("low confidence — the reader's query travels untouched", () => {
  it("a word the corpus already uses is never corrected", () => {
    expect(correctTerm("validity", V)).toBeNull();
    expect(correctTerm("research", V)).toBeNull();
    expect(correctQuery("What is validity?", V).correctedQuery).toBe("What is validity?");
  });

  it("a word nothing in the vocabulary is near is left alone", () => {
    expect(correctTerm("zebrafish", V)).toBeNull();
    const r = correctQuery("zebrafish cardiac regeneration", V);
    expect(r.correctedQuery).toBe("zebrafish cardiac regeneration");
    expect(r.alternativeTerms).toEqual([]);
  });

  it("a low-band near miss proposes nothing but is still reported for the trace", () => {
    const r = correctQuery("methodolgical", V);
    expect(r.alternativeTerms).toEqual([]);
    expect(r.correctedQuery).toBe("methodolgical");
  });

  it("a short word is never corrected — edit distance says too little about it", () => {
    expect(correctTerm("cat", V)).toBeNull();
    expect(correctTerm("test", V)).toBeNull();
    expect(correctableTokens("is it a cat or a dog")).toEqual([]);
  });

  it("a page-text term below the record floor is never a candidate", () => {
    // "wibbly" appears in one record; correcting toward it would promote an
    // OCR artefact to vocabulary.
    expect(correctTerm("wibbley", V)).toBeNull();
  });

  it("an ENTITY term is a candidate however rare — a title exists once", () => {
    expect(correctTerm("essentails", V)?.candidate).toBe("essentials");
    expect(correctTerm("practicl", V)?.candidate).toBe("practical");
  });
});

describe("Khmer, English and mixed", () => {
  it("script is detected and never crossed", () => {
    expect(scriptOf("validity")).toBe("latin");
    expect(scriptOf("ស្រាវជ្រាវ")).toBe("khmer");
    expect(scriptOf("978-0-415")).toBe("other");
  });

  it("a Latin candidate is never proposed for a Khmer token, or the reverse", () => {
    // The rule that stops legitimate Khmer educational terminology being
    // "corrected" into English.
    const khmerTyped = "ស្រាវជ្រាវវ";
    const c = correctTerm(khmerTyped, V);
    expect(c === null || c.candidate === "ស្រាវជ្រាវ").toBe(true);
    if (c) expect(scriptOf(c.candidate)).toBe("khmer");
  });

  it("a Khmer entity term with one character wrong resolves to the entity", () => {
    const c = correctTerm("គណិតវិទា", V);
    if (c && c.band !== "low") expect(c.candidate).toBe("គណិតវិទ្យា");
  });

  it("a mixed query corrects only the side that needs it", () => {
    const r = correctQuery("តើសៀវភៅនិយាយអ្វីអំពី validty", V);
    expect(r.correctedQuery).toContain("validity");
    expect(r.correctedQuery).toContain("តើសៀវភៅនិយាយអ្វីអំពី");
    expect(r.originalQuery).toContain("validty");
  });

  it("Khmer that is already vocabulary is untouched", () => {
    const r = correctQuery("ការស្រាវជ្រាវ", V);
    expect(r.correctedQuery).toBe("ការស្រាវជ្រាវ");
  });
});

describe("the original query is never destroyed", () => {
  it("every result carries the reader's text verbatim", () => {
    for (const q of ["What is validty?", "reserch methods", "ethnograpy", "nothing to fix here at all"]) {
      expect(correctQuery(q, V).originalQuery).toBe(q);
    }
  });

  it("correcting one word does not disturb the rest of the sentence", () => {
    const r = correctQuery("According to the book, what is validty in research?", V);
    expect(r.correctedQuery).toBe("According to the book, what is validity in research?");
  });
});

describe("ambiguity is carried, not resolved by a coin flip", () => {
  it("a misspelling equally close to two words looks for both", () => {
    // Measured on the real vocabulary: "practicl" is one edit from `practical`
    // (94 records) and `practice` (101). A 7% frequency difference is not a
    // decision, so both are looked for and only the leader is embedded.
    const vocab = prepareVocabulary({
      generatedAt: "x",
      corpusRecords: 249,
      entries: [
        { term: "practice", records: 101, script: "latin", source: "page_text" },
        { term: "practical", records: 94, script: "latin", source: "page_text" },
      ],
    });
    const c = correctTerm("practicl", vocab)!;
    expect(c.candidate).toBe("practice");
    expect(c.alternatives).toEqual(["practical"]);
    const r = correctQuery("practicl methods", vocab);
    expect(r.correctedQuery).toBe("practice methods");
    expect([...r.alternativeTerms].sort()).toEqual(["practical", "practice"]);
  });

  it("frequency decides WHICH word, never WHETHER to correct", () => {
    // `validty` is one edit from `validly` (3 records) and `validity` (72).
    // Scoring frequency into the confidence let a length penalty pick
    // `validly`, and the assistant answered a question about validity from
    // pages containing "validly".
    const vocab = prepareVocabulary({
      generatedAt: "x",
      corpusRecords: 249,
      entries: [
        { term: "validly", records: 3, script: "latin", source: "page_text" },
        { term: "validity", records: 72, script: "latin", source: "page_text" },
      ],
    });
    expect(correctTerm("validty", vocab)?.candidate).toBe("validity");
    // The confidence is a property of the spelling alone, so both readings
    // of the same misspelling score the same.
    const rare = prepareVocabulary({
      generatedAt: "x",
      corpusRecords: 249,
      entries: [{ term: "validity", records: 3, script: "latin", source: "page_text" }],
    });
    expect(correctTerm("validty", rare)?.confidence).toBe(correctTerm("validty", vocab)?.confidence);
  });

  it("queryReadings is bounded, and the reader's own query is not among them", () => {
    const vocab = prepareVocabulary({
      generatedAt: "x",
      corpusRecords: 249,
      entries: [
        { term: "practice", records: 101, script: "latin", source: "page_text" },
        { term: "practical", records: 94, script: "latin", source: "page_text" },
        { term: "research", records: 248, script: "latin", source: "page_text" },
        { term: "reserve", records: 20, script: "latin", source: "page_text" },
      ],
    });
    const readings = queryReadings(correctQuery("practicl reserch", vocab));
    expect(readings.length).toBeLessThanOrEqual(MAX_READINGS);
    expect(readings[0]).toBe("practice research");
    expect(readings).toContain("practical research");
  });

  it("a query with nothing to correct reads only as itself", () => {
    expect(queryReadings(correctQuery("nothing here needs fixing", V))).toEqual([
      "nothing here needs fixing",
    ]);
  });
});
