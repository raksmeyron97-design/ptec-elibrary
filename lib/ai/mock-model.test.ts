// The e2e stand-in model is only useful if it answers the way the pipeline
// expects — from the evidence it was handed, in the citation form grounding
// verifies. A mock that invents an answer would make every e2e assertion a
// test of the mock.

import { describe, expect, it } from "vitest";
import { isMockProvider, mockAnswerFor } from "./mock-model";
import { buildContext } from "./context";
import { enforceGrounding } from "./guardrails";
import { buildSources } from "./citations";

const PASSAGES = [
  { title: "Foundations of Education", author: "Sok Dara", page: 12, text: "Formative assessment is a continuous process rather than an event." },
  { title: "Foundations of Education", author: "Sok Dara", page: 24, text: "Classroom management rests on predictable routines." },
];

const CONTEXT = buildContext({ query: "formative assessment", passages: PASSAGES }).block;

describe("mockAnswerFor", () => {
  it("answers from the passages it was given, citing the page it quoted", () => {
    const answer = mockAnswerFor(CONTEXT);
    expect(answer).toContain("Formative assessment");
    expect(answer).toMatch(/\(Foundations of Education, p\. 12\)/);
  });

  it("produces citations that survive grounding", () => {
    // The real guarantee: the mock is on the same side of enforceGrounding as
    // a live model, so a broken context builder fails the e2e run rather than
    // being papered over.
    const sources = buildSources(
      PASSAGES.map((p) => ({ ...p, url: "/books/foundations-of-education", similarity: 0.8 })),
    );
    const grounded = enforceGrounding(mockAnswerFor(CONTEXT), sources);
    expect(grounded.hallucinated).toHaveLength(0);
    expect(grounded.grounded.length).toBeGreaterThan(0);
  });

  it("reads an author field that contains parentheses", () => {
    // Five baseline failures were this: `(Leonard A. Jason, David S. Glenwick
    // (Editors))` stopped the old parser at the first `)`, and the mock refused
    // over four correct passages.
    const block = buildContext({
      query: "grounded theory",
      passages: [
        { title: "Handbook of Methodological Approaches to Community-Based Research", author: "Leonard A. Jason, David S. Glenwick (Editors)", page: 44, text: "Grounded theory builds theory from data." },
        { title: "Pedagogy and Practice: Leadership Guide", author: "Department for Education and Skills (DfES), United Kingdom", page: 85, text: "Formative assessment informs the next lesson." },
      ],
    }).block;
    const answer = mockAnswerFor(block);
    expect(answer).toContain("Grounded theory builds theory from data.");
    expect(answer).toMatch(/\(Handbook of Methodological Approaches to Community-Based Research, p\. 44\)/);
    expect(answer).toMatch(/\(Pedagogy and Practice: Leadership Guide, p\. 85\)/);
  });

  it("cites the first page of a merged page range", () => {
    const line = `[1] "Handbook" (Anon), pp. 44–45: Grounded theory builds theory from data.`;
    expect(mockAnswerFor(line)).toMatch(/\(Handbook, p\. 44\)/);
  });

  it("says it has nothing when the context carries no passages", () => {
    const empty = buildContext({ query: "zebrafish", passages: [] }).block;
    expect(mockAnswerFor(empty)).toMatch(/could not find/i);
  });

  it("is off unless the flag is explicitly set", () => {
    const previous = process.env.AI_MOCK_PROVIDER;
    delete process.env.AI_MOCK_PROVIDER;
    expect(isMockProvider()).toBe(false);
    process.env.AI_MOCK_PROVIDER = "1";
    expect(isMockProvider()).toBe(true);
    if (previous === undefined) delete process.env.AI_MOCK_PROVIDER;
    else process.env.AI_MOCK_PROVIDER = previous;
  });
});
