// lib/ai/output-budget.test.ts — the reader's answer budget is not the model's
// thinking budget.
//
// Found by the AI Brain 2 live run: Gemini counts thinking tokens against
// maxOutputTokens, and every evidence question with three or more passages
// runs on the reasoning tier (512 thinking tokens) inside a 350-token cap.
// "What is action research?" came back as 75 characters ending mid-sentence,
// finishReason=length, usage {textTokens: 10, reasoningTokens: 336}. The mock
// benchmark cannot see this; this test pins the arithmetic.

import { describe, expect, it } from "vitest";
import { THINKING_HEADROOM, buildGeneration, type Plan } from "./plan";
import { classifyIntent } from "./intent";
import { compressConversation } from "./conversation";
import { MAX_OUTPUT_TOKENS, SEARCH_FORMAT_OUTPUT_TOKENS } from "./token-budget";
import { thinkingBudgetFor } from "./models";

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
        title: "Research Methods in Education",
        author: "Cohen",
        url: "/books/rme",
        page: 10 + i,
        text: `Passage ${i} about the topic.`,
        similarity: 0.8,
      })),
      dbQueries: 1,
      embeddingMs: 0,
      retrievalMs: 1,
      cacheHit: false,
    },
  };
}

describe("maxOutputTokens leaves the whole text budget to the answer", () => {
  it("adds the thinking budget on top of the text budget on the reasoning tier", () => {
    const gen = buildGeneration(planFor("What is action research?", 5), ORG);
    expect(gen.thinkingBudget).toBe(thinkingBudgetFor("reasoning"));
    expect(gen.thinkingBudget).toBeGreaterThan(0);
    expect(gen.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS.normal + THINKING_HEADROOM * gen.thinkingBudget);
  });

  it("charges nothing extra when there is no thinking", () => {
    const gen = buildGeneration(planFor("What is action research?", 1), ORG);
    expect(gen.thinkingBudget).toBe(0);
    expect(gen.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS.normal);
  });

  it("keeps the smaller cap for formatting a result list", () => {
    const gen = buildGeneration(planFor("find me books about reading", 0), ORG);
    expect(gen.maxOutputTokens).toBe(SEARCH_FORMAT_OUTPUT_TOKENS + THINKING_HEADROOM * gen.thinkingBudget);
  });
});
