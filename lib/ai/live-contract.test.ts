// lib/ai/live-contract.test.ts — the two defects only a live model could show,
// pinned so a live model cannot show them again.
//
// AI Brain 2.0's whole finding was that the mock benchmark was blind to the
// things that were actually wrong: every offline metric was green while
// Gemini cut most evidence answers off after one sentence and the grounding
// parser threw away the citations a real model writes. Both were fixed, and a
// fix that is only proved by a run nobody schedules is not a fix.
//
// So the contract has two halves, and BOTH are needed:
//
//   here          the ARITHMETIC and the PARSER, offline, on every commit.
//                 These are properties of our code and can be pinned exactly.
//   --live-suite  that the PROVIDER still agrees — `finishReason=stop`, no
//                 hallucinated citation — weekly, against the real model
//                 (docs/AI-BRAIN-2-1-LIVE-MONITORING.md).
//
// This file is the first half. It cannot prove Gemini's behaviour; it proves
// that if Gemini behaves as it did in September 2026, we handle it.

import { describe, expect, it } from "vitest";
import { THINKING_HEADROOM, buildGeneration, type Plan } from "./plan";
import { classifyIntent } from "./intent";
import { compressConversation } from "./conversation";
import { MAX_OUTPUT_TOKENS } from "./token-budget";
import { thinkingBudgetFor } from "./models";
import { enforceGrounding, extractCitations } from "./guardrails";
import type { Source } from "./response";

const ORG = { siteName: "PTEC e-Library", institutionName: "Phnom Penh Teacher Education College" };

function planFor(question: string, passages: number): Plan {
  const intent = classifyIntent(question);
  return {
    intent,
    mode: "hybrid",
    compressed: compressConversation([{ role: "user", text: question }]),
    facts: [],
    injection: false,
    retrieval: {
      results: [],
      works: [],
      facts: [],
      passages: Array.from({ length: passages }, (_, i) => ({
        title: "Research Methods in Education (8th Edition)",
        author: "Louis Cohen, Lawrence Manion",
        url: "/books/research-methods-in-education-8th-edition",
        page: 470 + i,
        text: `Passage ${i} about validity in educational research.`,
        similarity: 0.8,
      })),
      dbQueries: 1,
      embeddingMs: 0,
      retrievalMs: 1,
      cacheHit: false,
    },
  };
}

describe("thinking tokens may never eat the reader's answer", () => {
  it("the reasoning tier gets its whole text budget ON TOP of thinking", () => {
    // Run 1 of the AI Brain 2.0 live evaluation: "What is action research?"
    // came back 75 characters long, ending mid-sentence, finishReason=length,
    // usage {textTokens: 10, reasoningTokens: 336} — a 350-token cap with 336
    // of it spent thinking. Every evidence question with ≥ 3 passages runs on
    // that tier, so this was most evidence answers in production.
    const gen = buildGeneration(planFor("What is validity?", 5), ORG);
    expect(gen.thinkingBudget).toBe(thinkingBudgetFor("reasoning"));
    expect(gen.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS.normal + THINKING_HEADROOM * gen.thinkingBudget);
    // The text budget must survive a model that spends its ENTIRE thinking
    // allowance — which run 4 showed it can exceed, hence the headroom.
    expect(gen.maxOutputTokens - gen.thinkingBudget).toBeGreaterThanOrEqual(MAX_OUTPUT_TOKENS.normal);
  });

  it("the headroom is more than one thinking budget, because the budget is a guide", () => {
    // Run 4: two answers were still cut at text + 1× thinking. Gemini treats
    // `thinkingBudget` as a target, not a cap.
    expect(THINKING_HEADROOM).toBeGreaterThan(1);
  });

  it("a path with no thinking is charged nothing extra", () => {
    const gen = buildGeneration(planFor("What is validity?", 1), ORG);
    expect(gen.thinkingBudget).toBe(0);
    expect(gen.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS.normal);
  });
});

describe("the citation forms a real model actually writes", () => {
  // Every string below was produced by gemini-3.5-flash during the AI Brain
  // 2.0 live runs and recorded in docs/AI-BRAIN-2-FINAL-REPORT.md §7. The
  // parser read exactly ONE of them before that phase, so 11 correct answers
  // were reported as "no citation survived" and 6 as "hallucinated".
  const sources: Source[] = [
    {
      title: "Research Methods in Education (8th Edition)",
      author: "Louis Cohen",
      page: 470,
      url: "/books/rme?page=470",
      snippet: "…",
    },
    {
      title: "Qualitative Inquiry and Research Design (4th Edition)",
      author: "John W. Creswell",
      page: 8,
      pageEnd: 9,
      url: "/books/qi?page=8",
      snippet: "…",
    },
  ];

  // NOTE ON SHAPE: the parser reads citations out of PARENTHETICALS, plus a
  // bare page attributed to the nearest preceding title. A citation written
  // with no brackets at all ("See Title, pp. 8–9.") is deliberately NOT read —
  // no live run produced one, and a parser that accepted it would accept any
  // sentence containing a title and a number. §19: widen to the forms a model
  // actually writes, and no further.
  const forms: Array<[string, string]> = [
    ["plain", "Validity is discussed at length (Research Methods in Education (8th Edition), p. 470)."],
    ["italic title, bare page in prose", "*Research Methods in Education (8th Edition)* treats this fully (p. 470)."],
    ["two in one bracket", "Both agree (*Research Methods in Education (8th Edition)*, p. 470; *Qualitative Inquiry and Research Design (4th Edition)*, pp. 8–9)."],
    ["a page range", "The two approaches differ (Qualitative Inquiry and Research Design (4th Edition), pp. 8–9)."],
    ["author, APA style", "Creswell sets this out (Creswell, pp. 8–9)."],
    ["a FULL byline", "A literature review is essential (John W. Creswell, pp. 8–9)."],
    ["Khmer page word, Arabic digits", "អត្ថបទបញ្ជាក់ (Research Methods in Education (8th Edition), ទំព័រ 470)។"],
    ["a shortened title", "The argument runs on (Research Methods in Education, p. 470)."],
  ];

  for (const [name, answer] of forms) {
    it(`reads and grounds: ${name}`, () => {
      const result = enforceGrounding(answer, sources);
      expect(result.hallucinated).toHaveLength(0);
      expect(result.grounded.length).toBeGreaterThanOrEqual(1);
      // A citation that survives must have a real page behind it.
      for (const c of result.grounded) {
        expect([470, 8, 9]).toContain(c.page);
      }
      // And nothing legitimate is stripped out of the prose.
      expect(result.answer.length).toBeGreaterThan(answer.length * 0.6);
    });
  }

  it("a page the retrieval set does not contain is still deleted", () => {
    // The parser was widened; it was NOT loosened. A syntactically valid
    // citation is not automatically a correct one.
    const result = enforceGrounding(
      "This is claimed elsewhere (Research Methods in Education (8th Edition), p. 999).",
      sources,
    );
    expect(result.grounded).toHaveLength(0);
    expect(result.hallucinated).toHaveLength(1);
    expect(result.answer).not.toContain("p. 999");
  });

  it("a title the retrieval set does not contain is deleted", () => {
    const result = enforceGrounding("As shown (A Book We Do Not Hold, p. 470).", sources);
    expect(result.grounded).toHaveLength(0);
    expect(result.hallucinated).toHaveLength(1);
  });

  it("an author's surname may be ANY word of the byline the model wrote", () => {
    // The live regression run of 2026-09-12 produced
    // `(Alan Bryman, p. 36–38, p. 47)` and `(John W. Creswell, pp. 58–59)`.
    // Both were correct — the pages were retrieved and the people wrote the
    // books — and both were deleted as hallucinations, because the matcher
    // took only the FIRST word of the citation and that word was a given
    // name. Two correct citations, removed from a reader's answer.
    for (const form of [
      "(John W. Creswell, pp. 8–9)",
      "(Creswell, pp. 8–9)",
      "(J. Creswell, pp. 8–9)",
    ]) {
      const r = enforceGrounding(`As set out ${form}.`, sources);
      expect(r.hallucinated, form).toHaveLength(0);
      expect(r.grounded, form).toHaveLength(1);
    }
  });

  it("and a person who wrote none of the retrieved works is still deleted", () => {
    // Widened to read a form, NOT loosened about what it verifies.
    const invented = enforceGrounding("As claimed (Margaret Atwood, p. 470).", sources);
    expect(invented.grounded).toHaveLength(0);
    expect(invented.hallucinated).toHaveLength(1);
    // A real author, at a page no source holds.
    const wrongPage = enforceGrounding("As claimed (Creswell, p. 999).", sources);
    expect(wrongPage.grounded).toHaveLength(0);
    expect(wrongPage.hallucinated).toHaveLength(1);
  });

  it("every parsed citation names the FIRST page it mentions", () => {
    // A range is one passage and its first page is the one the source card
    // opens at; a list repeats the page word.
    expect(extractCitations("(Title, pp. 8–9)")[0]?.page).toBe(8);
    expect(extractCitations("(Title, p. 108, p. 110)")[0]?.page).toBe(108);
    expect(extractCitations("(Title, ទំព័រ ៤៧០)")[0]?.page).toBe(470);
  });
});
