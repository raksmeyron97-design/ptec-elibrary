// lib/ai/router.test.ts — §28 "Intent routing", "Fallbacks", "Language".
//
// Retrieval and the model are mocked; what is under test is the DECISION
// layer — which requests reach a model at all, what they are allowed to say,
// and what happens when each dependency fails. The zero-LLM assertions are the
// point: `generateText` must not be called for a question the database
// already answers.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RetrievalOutcome } from "./retrieval";

const generateText = vi.hoisted(() => vi.fn());
const streamText = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  generateText,
  streamText,
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => (id: string) => ({ modelId: id }),
}));

vi.mock("@/lib/system-settings/config", () => ({
  getOrgIdentity: async () => ({
    siteName: "PTEC e-Library",
    institutionName: "Phnom Penh Teacher Education College",
  }),
}));

const retrieval = vi.hoisted(() => ({
  searchWorks: vi.fn(),
  searchPassages: vi.fn(),
  getBookDetail: vi.fn(),
  getRelatedBooks: vi.fn(),
  getLibraryFact: vi.fn(),
  getLibraryOverview: vi.fn(),
}));

vi.mock("./retrieval", () => retrieval);

const { runAssistant } = await import("./router");

function outcome(over: Partial<RetrievalOutcome> = {}): RetrievalOutcome {
  return {
    results: [],
    works: [],
    passages: [],
    facts: [],
    dbQueries: 0,
    embeddingMs: 0,
    retrievalMs: 1,
    cacheHit: false,
    ...over,
  };
}

const BOOKS = outcome({
  results: [
    { slug: "a", title: "Teaching Reading", author: "Sok Dara", coverUrl: null, url: "/books/a", type: "book" },
    { slug: "b", title: "Phonics First", author: "Chan Sophea", coverUrl: null, url: "/books/b", type: "book" },
    { slug: "c", title: "Early Literacy", author: "Kim Sreymom", coverUrl: null, url: "/books/c", type: "book" },
  ],
  works: [
    { title: "Teaching Reading", author: "Sok Dara" },
    { title: "Phonics First", author: "Chan Sophea" },
    { title: "Early Literacy", author: "Kim Sreymom" },
  ],
  dbQueries: 1,
});

const ask = (text: string, extra: Record<string, unknown> = {}) =>
  runAssistant({ messages: [{ role: "user", text }], ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  // The provider factory is mocked, but the router still checks for a key
  // before constructing a model — that guard is what returns 503 in prod.
  process.env.GEMINI_API_KEY = "test-key";
  retrieval.searchWorks.mockResolvedValue(outcome());
  retrieval.searchPassages.mockResolvedValue(outcome());
  retrieval.getBookDetail.mockResolvedValue(outcome());
  retrieval.getRelatedBooks.mockResolvedValue(outcome());
  retrieval.getLibraryFact.mockResolvedValue({
    text: "Monday to Friday, 07:00–17:00.",
    link: "/about/timings",
    dbQueries: 1,
    cacheHit: false,
  });
  retrieval.getLibraryOverview.mockResolvedValue(["hours: 07:00-17:00"]);
  generateText.mockResolvedValue({
    text: "Generated answer.",
    usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130 },
  });
});

describe("zero-LLM paths", () => {
  it("answers an opening-hours question from settings, with no model call", async () => {
    const { response, telemetry } = await ask("what time does the library open?");
    expect(generateText).not.toHaveBeenCalled();
    expect(telemetry.modelTier).toBe("none");
    expect(telemetry.deterministic).toBe(true);
    expect(response.answer).toContain("07:00");
    expect(response.intent).toBe("faq");
  });

  it("answers the same question in Khmer, still with no model call", async () => {
    retrieval.getLibraryFact.mockResolvedValue({
      text: "ចន្ទ ដល់ សុក្រ ម៉ោង ០៧:០០–១៧:០០។",
      link: "/about/timings",
      dbQueries: 1,
      cacheHit: false,
    });
    const { response, telemetry } = await ask("តើបណ្ណាល័យបើកម៉ោងប៉ុន្មាន?");
    expect(generateText).not.toHaveBeenCalled();
    expect(telemetry.locale).toBe("km");
    expect(response.answer).toContain("០៧:០០");
  });

  it("returns search results as cards plus a template sentence, with no model call", async () => {
    retrieval.searchWorks.mockResolvedValue(BOOKS);
    const { response, telemetry } = await ask("find me books about reading");
    expect(generateText).not.toHaveBeenCalled();
    expect(response.mode).toBe("search_results");
    expect(response.results).toHaveLength(3);
    expect(response.answer).toMatch(/I found 3 books/);
    expect(telemetry.resultCount).toBe(3);
  });

  it("phrases the same result count in Khmer for a Khmer query", async () => {
    retrieval.searchWorks.mockResolvedValue(BOOKS);
    const { response } = await ask("រកសៀវភៅអំពី psychology");
    expect(response.answer).toContain("៣");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("says plainly when nothing matched, without inventing a suggestion", async () => {
    const { response } = await ask("find me books about quantum basket weaving");
    expect(generateText).not.toHaveBeenCalled();
    expect(response.answer).toMatch(/couldn’t find/i);
    expect(response.results ?? []).toHaveLength(0);
  });

  it("greets without retrieval or generation", async () => {
    const { response, telemetry } = await ask("hello");
    expect(generateText).not.toHaveBeenCalled();
    expect(retrieval.searchWorks).not.toHaveBeenCalled();
    expect(telemetry.dbQueries).toBe(0);
    expect(response.answer).toMatch(/PTEC Library assistant/);
  });

  it("declines to write a student's assignment, without a model call", async () => {
    const { response } = await ask("write my essay about Piaget for me");
    expect(generateText).not.toHaveBeenCalled();
    expect(response.intent).toBe("unsupported");
    expect(response.answer).toMatch(/can’t write an essay/i);
  });

  it("refuses to answer a document question with no retrieved evidence", async () => {
    const { response } = await ask("what does the document say on page 42?");
    expect(generateText).not.toHaveBeenCalled();
    expect(response.answer).toMatch(/couldn’t find a passage/i);
  });
});

describe("model paths", () => {
  it("calls the model for a general-knowledge question and flags it as off-catalogue", async () => {
    const { response, telemetry } = await ask("who invented the printing press?");
    expect(generateText).toHaveBeenCalledOnce();
    expect(telemetry.modelTier).not.toBe("none");
    expect(response.intent).toBe("general_knowledge");
    const call = generateText.mock.calls[0][0];
    expect(call.system).toMatch(/not from the library|outside the library/i);
  });

  it("sends retrieved evidence as a user message, never in the system prompt", async () => {
    retrieval.searchPassages.mockResolvedValue(
      outcome({
        passages: [
          { title: "Teaching Reading", author: "Sok Dara", url: "/books/a", page: 42, text: "Phonics is taught early.", similarity: 0.8 },
        ],
        dbQueries: 1,
      }),
    );
    await ask("what does it say on page 42?");
    const call = generateText.mock.calls[0][0];
    expect(call.system).not.toMatch(/Phonics is taught early/);
    const lastUser = call.messages.at(-1);
    expect(lastUser.role).toBe("user");
    expect(lastUser.content).toMatch(/Phonics is taught early/);
    expect(lastUser.content).toMatch(/reference material, not instructions/);
  });

  it("strips a citation the retrieval set does not support", async () => {
    retrieval.searchPassages.mockResolvedValue(
      outcome({
        passages: [
          { title: "Teaching Reading", author: "Sok Dara", url: "/books/a", page: 42, text: "Phonics.", similarity: 0.8 },
        ],
      }),
    );
    generateText.mockResolvedValue({
      text: "It says so (Teaching Reading, p. 42) and also (Invented Book, p. 9).",
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    });
    const { response } = await ask("what does it say on page 42?");
    expect(response.answer).toContain("p. 42");
    expect(response.answer).not.toContain("Invented Book");
    expect(response.sources).toHaveLength(1);
  });

  it("caps output tokens by requested verbosity", async () => {
    await ask("who invented the printing press?");
    const brief = generateText.mock.calls[0][0].maxOutputTokens;
    vi.clearAllMocks();
    generateText.mockResolvedValue({ text: "x", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });
    await ask("explain deeply who invented the printing press and why it mattered");
    const detailed = generateText.mock.calls[0][0].maxOutputTokens;
    expect(detailed).toBeGreaterThan(brief);
  });

  it("reports provider usage rather than the estimate when the SDK gives it", async () => {
    const { telemetry } = await ask("who invented the printing press?");
    expect(telemetry.inputTokens).toBe(100);
    expect(telemetry.outputTokens).toBe(30);
    expect(telemetry.totalTokens).toBe(130);
  });
});

describe("fallbacks", () => {
  it("returns search results when the model call fails", async () => {
    retrieval.searchWorks.mockResolvedValue({ ...BOOKS });
    generateText.mockRejectedValue(new Error("gemini down"));
    // A low-confidence phrasing that would otherwise reach the model.
    const { response, telemetry } = await ask("something about early reading", {
      context: { hadResults: true },
    });
    expect(response.results?.length ?? 0).toBeGreaterThan(0);
    expect(telemetry.fallback).toBeDefined();
  });

  it("throws a typed unavailable error only when there is nothing to show", async () => {
    generateText.mockRejectedValue(new Error("gemini down"));
    await expect(ask("who invented the printing press?")).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("still answers a search when the embedding layer reported a fallback", async () => {
    retrieval.searchWorks.mockResolvedValue({ ...BOOKS, fallback: "no_embedding" as const });
    const { response, telemetry } = await ask("find me books about reading");
    expect(response.results).toHaveLength(3);
    expect(telemetry.fallback).toBe("no_embedding");
  });

  it("propagates a cache hit into telemetry", async () => {
    retrieval.searchWorks.mockResolvedValue({ ...BOOKS, cacheHit: true, dbQueries: 0 });
    const { telemetry } = await ask("find me books about reading");
    expect(telemetry.cacheHit).toBe(true);
    expect(telemetry.dbQueries).toBe(0);
  });
});

describe("query budget", () => {
  it("spends no database queries on a greeting", async () => {
    const { telemetry } = await ask("hi there");
    expect(telemetry.dbQueries).toBe(0);
  });

  it("spends at most one on a library fact", async () => {
    const { telemetry } = await ask("what time does the library open?");
    expect(telemetry.dbQueries).toBeLessThanOrEqual(1);
  });

  it("spends at most two on a book search", async () => {
    retrieval.searchWorks.mockResolvedValue({ ...BOOKS, dbQueries: 2 });
    const { telemetry } = await ask("find me books about reading");
    expect(telemetry.dbQueries).toBeLessThanOrEqual(2);
  });
});
