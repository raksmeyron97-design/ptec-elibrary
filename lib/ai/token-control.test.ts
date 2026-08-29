// lib/ai/token-control.test.ts — §28 "Token control".
//
// The budgets are the product here. These tests assert that a long history, a
// huge retrieval set and an oversized document all end up inside the declared
// ceilings, because every one of those was an uncapped input path before 2.0.

import { describe, expect, it } from "vitest";
import {
  INPUT_TARGET_TOKENS,
  MAX_CONTEXT_TOKENS,
  MAX_EVIDENCE_TOKENS,
  MAX_HISTORY_TOKENS,
  MAX_OUTPUT_TOKENS,
  MAX_PASSAGE_TOKENS,
  clampToTokens,
  estimateTokens,
} from "./token-budget";
import { buildContext, compactWork } from "./context";
import { compressConversation, needsHistory } from "./conversation";
import { buildSystemPrompt } from "./prompts";
import type { InboundMessage } from "./guardrails";

const LOREM =
  "Educational psychology examines how people learn and retain knowledge, drawing on cognitive science, developmental theory and classroom practice. ";

describe("estimateTokens", () => {
  it("charges Khmer more per character than Latin", () => {
    const latin = "abcdefghij".repeat(10); // 100 chars
    const khmer = "ការអប់រំគរុកោសល្យ".repeat(6);
    expect(estimateTokens(khmer) / khmer.length).toBeGreaterThan(
      estimateTokens(latin) / latin.length,
    );
  });

  it("is zero-ish for empty input and monotonic in length", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(400))).toBeGreaterThan(estimateTokens("a".repeat(100)));
  });
});

describe("clampToTokens", () => {
  it("never exceeds the budget, in either script", () => {
    for (const text of [LOREM.repeat(20), "ការអប់រំគរុកោសល្យនិងការស្រាវជ្រាវ".repeat(40)]) {
      for (const budget of [10, 40, 130]) {
        expect(estimateTokens(clampToTokens(text, budget))).toBeLessThanOrEqual(budget);
      }
    }
  });

  it("leaves text that already fits completely untouched", () => {
    expect(clampToTokens("short answer", 100)).toBe("short answer");
  });

  it("marks truncation so the model can see the text was cut", () => {
    expect(clampToTokens(LOREM.repeat(10), 20).endsWith("…")).toBe(true);
  });
});

describe("buildContext", () => {
  const bigPassages = Array.from({ length: 12 }, (_, i) => ({
    title: `Document ${i}`,
    author: "Author",
    page: i + 1,
    text: LOREM.repeat(8),
  }));
  const bigWorks = Array.from({ length: 30 }, (_, i) => ({
    title: `Book ${i}`,
    author: "Author",
    kind: "Education",
    summary: LOREM.repeat(4),
  }));

  it("stays inside the evidence budget however much it is handed", () => {
    const ctx = buildContext({ query: "learning", passages: bigPassages, works: bigWorks });
    expect(ctx.tokens).toBeLessThanOrEqual(MAX_EVIDENCE_TOKENS);
  });

  it("honours a smaller explicit budget", () => {
    const ctx = buildContext({ query: "learning", passages: bigPassages, budget: 200 });
    expect(ctx.tokens).toBeLessThanOrEqual(200);
    expect(ctx.passagesUsed).toBeLessThan(bigPassages.length);
  });

  it("reports how many passages survived, so grounding matches what was sent", () => {
    const ctx = buildContext({ query: "learning", passages: bigPassages.slice(0, 3) });
    expect(ctx.passagesUsed).toBe(3);
  });

  it("caps each passage independently of the block budget", () => {
    const ctx = buildContext({
      query: "learning",
      passages: [{ title: "T", author: "A", page: 1, text: LOREM.repeat(50) }],
    });
    // One passage line = the compact prefix plus at most MAX_PASSAGE_TOKENS.
    expect(ctx.tokens).toBeLessThan(MAX_PASSAGE_TOKENS + 80);
  });

  it("says so explicitly when nothing was retrieved", () => {
    const ctx = buildContext({ query: "nothing" });
    expect(ctx.block).toMatch(/No matching library records/);
    expect(ctx.worksUsed).toBe(0);
  });

  it("never emits raw database wrappers — only the fields a model needs", () => {
    const line = compactWork({
      title: "Teaching Reading",
      author: "Sok Dara",
      kind: "Education",
      summary: LOREM,
      year: 2021,
    });
    expect(line).not.toMatch(/cover_url|slug|"id"|departments|\{/);
    expect(line).toContain("Teaching Reading");
  });
});

describe("compressConversation", () => {
  const long: InboundMessage[] = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "model",
    text: `${i % 2 === 0 ? "Question" : "Answer"} ${i}: ${LOREM.repeat(2)}`,
  }));

  it("drops history entirely for a self-contained question", () => {
    const c = compressConversation([
      ...long,
      { role: "user", text: "Which books cover assessment for learning in primary schools?" },
    ]);
    expect(c.history).toHaveLength(0);
    expect(c.overheadTokens).toBe(0);
  });

  it("keeps recent context for a follow-up that needs it, within budget", () => {
    const c = compressConversation([...long, { role: "user", text: "what about the second one?" }]);
    expect(c.history.length).toBeGreaterThan(0);
    expect(c.overheadTokens).toBeLessThanOrEqual(MAX_HISTORY_TOKENS);
  });

  it("keeps the whole conversation overhead under the §8 target", () => {
    const c = compressConversation([...long, { role: "user", text: "and that one?" }]);
    expect(c.overheadTokens).toBeLessThan(500);
  });

  it("identifies the current question regardless of trailing model turns", () => {
    const c = compressConversation([
      { role: "user", text: "first" },
      { role: "model", text: "answer" },
      { role: "user", text: "  the real question  " },
    ]);
    expect(c.current).toBe("the real question");
  });

  it("handles a single-message conversation", () => {
    const c = compressConversation([{ role: "user", text: "hello" }]);
    expect(c.current).toBe("hello");
    expect(c.history).toHaveLength(0);
  });

  it("recognises dependent follow-ups in both languages", () => {
    expect(needsHistory("what about the second one?")).toBe(true);
    expect(needsHistory("ចុះមួយទៀត?")).toBe(true);
    expect(needsHistory("Which theses discuss phonics instruction in Cambodian schools?")).toBe(
      false,
    );
  });
});

describe("prompt size", () => {
  const org = { siteName: "PTEC e-Library", institutionName: "Phnom Penh Teacher Education College" };

  it("keeps every system prompt small enough to leave room for evidence", () => {
    for (const intent of [
      "faq", "book_search", "thesis_search", "pdf_question", "general_knowledge",
    ] as const) {
      for (const locale of ["en", "km"] as const) {
        const p = buildSystemPrompt({ org, intent, locale, verbosity: "normal" });
        expect(estimateTokens(p)).toBeLessThan(200);
      }
    }
  });

  it("a full worst-case prompt still fits the context ceiling", () => {
    const system = buildSystemPrompt({
      org, intent: "pdf_question", locale: "km", verbosity: "detailed",
    });
    const ctx = buildContext({
      query: "x",
      passages: Array.from({ length: 5 }, (_, i) => ({
        title: `Doc ${i}`, author: "A", page: i, text: LOREM.repeat(10),
      })),
    });
    const history = compressConversation([
      { role: "user", text: "first question about phonics" },
      { role: "model", text: LOREM.repeat(5) },
      { role: "user", text: "what about that one?" },
    ]);
    const total = estimateTokens(system) + ctx.tokens + history.overheadTokens;
    expect(total).toBeLessThanOrEqual(MAX_CONTEXT_TOKENS);
  });

  it("a typical request lands near the input target rather than the ceiling", () => {
    const system = buildSystemPrompt({
      org, intent: "book_search", locale: "en", verbosity: "normal",
    });
    const ctx = buildContext({
      query: "educational psychology",
      works: Array.from({ length: 5 }, (_, i) => ({
        title: `Book ${i}`, author: "Author", kind: "Education", summary: LOREM,
      })),
    });
    expect(estimateTokens(system) + ctx.tokens).toBeLessThanOrEqual(INPUT_TARGET_TOKENS);
  });
});

describe("output budgets", () => {
  it("defaults to short answers and only widens on request", () => {
    expect(MAX_OUTPUT_TOKENS.brief).toBeLessThan(MAX_OUTPUT_TOKENS.normal);
    expect(MAX_OUTPUT_TOKENS.normal).toBeLessThan(MAX_OUTPUT_TOKENS.detailed);
    expect(MAX_OUTPUT_TOKENS.normal).toBeLessThanOrEqual(350);
  });
});
