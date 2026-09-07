// lib/ai/provider.test.ts
// The dual-provider decision layer, offline.
//
// What is under test is not "does Ollama work" — that needs a box, and
// scripts/test-local-ai.ts is where you ask it. It is the set of rules that
// decide WHO answers and what happens when the local one cannot:
//
//   · text falls back to Gemini, embeddings never do (a Gemini vector against
//     bge-m3 rows is silent noise, and silence is the failure mode this file
//     exists to prevent);
//   · a down box costs one timeout per cooldown, not one per request;
//   · a dimension that disagrees with the index is refused before a write.
//
// Every call goes through an injected `fetch`, so the whole surface — refused
// connections, timeouts, 5xx, malformed bodies, a stream that dies mid-answer
// — is reachable without a server, and the adapter is exercised through the
// REAL `generateText`/`streamText`, so a future SDK bump fails here rather
// than in production.

import { describe, expect, it, vi } from "vitest";
import { generateText, streamText } from "ai";
import { CircuitBreaker } from "./circuit-breaker";
import {
  OllamaError,
  modelIsPresent,
  ollamaChat,
  ollamaEmbed,
  ollamaHealth,
  ollamaLanguageModel,
  sseDataFrames,
  toOllamaMessages,
  type FetchLike,
  type LanguageModelV3,
  type OllamaClientOptions,
} from "./ollama";
import {
  OLLAMA_DEFAULTS,
  ollamaOpenAiBase,
  resolveProviderConfig,
  type AIProviderConfig,
} from "./provider-config";
import { createAIProvider } from "./provider";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const BASE = "http://ollama.test:11434/v1";

function client(fetchImpl: FetchLike, over: Partial<OllamaClientOptions> = {}): OllamaClientOptions {
  return { baseUrl: BASE, rootUrl: "http://ollama.test:11434", timeoutMs: 1_000, fetch: fetchImpl, ...over };
}

/** A `Response` with only the parts the client reads. */
function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    body: null,
  } as unknown as Response;
}

/**
 * A streamed response. `fail` breaks the connection AFTER the frames have
 * been read — deliberately on a later pull, because `controller.error()`
 * called beside `enqueue()` resets the queue and the bytes never arrive,
 * which models a refused connection rather than one that died mid-answer.
 */
function sseResponse(frames: string[], { fail }: { fail?: Error } = {}): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < frames.length) {
        controller.enqueue(encoder.encode(frames[i++]));
        return;
      }
      if (fail) controller.error(fail);
      else controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as unknown as Response;
}

function completion(text: string, over: Record<string, unknown> = {}): unknown {
  return {
    id: "cmpl-1",
    model: "qwen2.5:3b",
    choices: [{ message: { content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    ...over,
  };
}

/** A stand-in for the Gemini model, so no test can reach a billed provider. */
function fakeGemini(modelId: string, text = "cloud answer"): LanguageModelV3 {
  return {
    specificationVersion: "v3",
    provider: "google",
    modelId,
    supportedUrls: {},
    async doGenerate() {
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 5, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 3, text: 3, reasoning: undefined },
        },
        warnings: [],
      };
    },
    async doStream() {
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "text-start", id: "0" });
            controller.enqueue({ type: "text-delta", id: "0", delta: text });
            controller.enqueue({ type: "text-end", id: "0" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage: {
                inputTokens: { total: 5, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 3, text: 3, reasoning: undefined },
              },
            });
            controller.close();
          },
        }),
      };
    },
  } as LanguageModelV3;
}

function config(over: Partial<AIProviderConfig> = {}): AIProviderConfig {
  return {
    ...resolveProviderConfig({ AI_PROVIDER: "ollama", OLLAMA_BASE_URL: BASE, GEMINI_API_KEY: "test-key" }),
    ollamaTimeoutMs: 1_000,
    ollamaEmbedTimeoutMs: 1_000,
    ...over,
  };
}

const silent = () => {};

/** `vi.fn` typed as a fetch, so `mock.calls[0]` keeps its argument tuple. */
function fetchSpy(impl: FetchLike) {
  return vi.fn<FetchLike>(impl);
}

// ── Configuration ─────────────────────────────────────────────────────────────
describe("resolveProviderConfig", () => {
  it("defaults to Gemini when AI_PROVIDER is unset — an existing deploy must not move on its own", () => {
    const cfg = resolveProviderConfig({ GEMINI_API_KEY: "k" });
    expect(cfg.chatProvider).toBe("gemini");
    expect(cfg.embedProvider).toBe("gemini");
    expect(cfg.ollamaBaseUrl).toBe(OLLAMA_DEFAULTS.baseUrl);
  });

  it("keeps EMBEDDING on Gemini even when generation moves to Ollama", () => {
    // The whole index is 768-dim Gemini vectors. Moving generation is free;
    // moving embeddings without a migration would silently poison retrieval.
    const cfg = resolveProviderConfig({ AI_PROVIDER: "ollama", GEMINI_API_KEY: "k" });
    expect(cfg.chatProvider).toBe("ollama");
    expect(cfg.embedProvider).toBe("gemini");
    expect(cfg.embedModel).toBe("gemini-embedding-001");
    expect(cfg.embedDim).toBe(768);
  });

  it("follows the embedding provider's model and dimension when it is moved deliberately", () => {
    const cfg = resolveProviderConfig({ AI_EMBED_PROVIDER: "ollama", OLLAMA_EMBED_MODEL: "bge-m3" });
    expect(cfg.embedModel).toBe("bge-m3");
    expect(cfg.embedDim).toBe(1024);
  });

  it("normalises the base URL whether or not /v1 was given", () => {
    expect(ollamaOpenAiBase("http://box:11434")).toBe("http://box:11434/v1");
    expect(ollamaOpenAiBase("http://box:11434/v1/")).toBe("http://box:11434/v1");
    expect(resolveProviderConfig({ OLLAMA_BASE_URL: "http://box:11434/" }).ollamaRootUrl).toBe("http://box:11434");
  });

  it("reads the fallback flag in the spellings an operator actually types", () => {
    expect(resolveProviderConfig({}).fallbackToGemini).toBe(true);
    expect(resolveProviderConfig({ LOCAL_AI_FALLBACK_TO_GEMINI: "false" }).fallbackToGemini).toBe(false);
    expect(resolveProviderConfig({ LOCAL_AI_FALLBACK_TO_GEMINI: "off" }).fallbackToGemini).toBe(false);
    expect(resolveProviderConfig({ LOCAL_AI_FALLBACK_TO_GEMINI: "1" }).fallbackToGemini).toBe(true);
    // A typo must not silently disable the safety net.
    expect(resolveProviderConfig({ LOCAL_AI_FALLBACK_TO_GEMINI: "yeah" }).fallbackToGemini).toBe(true);
  });

  it("ignores an unparsable timeout rather than disabling the budget", () => {
    expect(resolveProviderConfig({ OLLAMA_TIMEOUT_MS: "abc" }).ollamaTimeoutMs).toBe(OLLAMA_DEFAULTS.timeoutMs);
    expect(resolveProviderConfig({ OLLAMA_TIMEOUT_MS: "0" }).ollamaTimeoutMs).toBe(OLLAMA_DEFAULTS.timeoutMs);
    expect(resolveProviderConfig({ OLLAMA_TIMEOUT_MS: "9000" }).ollamaTimeoutMs).toBe(9_000);
  });
});

// ── Circuit breaker ───────────────────────────────────────────────────────────
describe("CircuitBreaker", () => {
  it("opens only after CONSECUTIVE failures reach the threshold", () => {
    const now = 0;
    const b = new CircuitBreaker({ threshold: 3, cooldownMs: 100, now: () => now });
    b.recordFailure();
    b.recordFailure();
    expect(b.allows()).toBe(true);
    b.recordSuccess(); // one good answer wipes the streak
    b.recordFailure();
    b.recordFailure();
    expect(b.allows()).toBe(true);
    b.recordFailure();
    expect(b.allows()).toBe(false);
  });

  it("admits one trial request after the cooldown and closes on its success", () => {
    let now = 1_000;
    const b = new CircuitBreaker({ threshold: 1, cooldownMs: 100, now: () => now });
    b.recordFailure();
    expect(b.allows()).toBe(false);
    now += 99;
    expect(b.allows()).toBe(false);
    now += 1;
    expect(b.allows()).toBe(true);
    // The trial is exclusive: a second caller in the same instant waits.
    expect(b.allows()).toBe(false);
    b.recordSuccess();
    expect(b.allows()).toBe(true);
    expect(b.state().open).toBe(false);
  });
});

// ── HTTP client ───────────────────────────────────────────────────────────────
describe("ollamaChat", () => {
  it("posts to /v1/chat/completions and maps the OpenAI shape", async () => {
    const fetchMock = fetchSpy(async () => jsonResponse(completion("សួស្តី")));
    const result = await ollamaChat(client(fetchMock), {
      model: "qwen2.5:3b",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 128,
    });
    expect(result.text).toBe("សួស្តី");
    expect(result.usage).toEqual({ promptTokens: 11, completionTokens: 7, totalTokens: 18 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/chat/completions`);
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "qwen2.5:3b", stream: false, max_tokens: 128 });
  });

  it("classifies a refused connection as unreachable, not as a bad answer", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      ollamaChat(client(fetchMock), { model: "m", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ kind: "unreachable" });
  });

  it("classifies a budget overrun as a timeout", async () => {
    const fetchMock: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    await expect(
      ollamaChat(client(fetchMock, { timeoutMs: 10 }), { model: "m", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ kind: "timeout" });
  });

  it("carries the status of an HTTP failure", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "model not found" }, { status: 404 }));
    await expect(
      ollamaChat(client(fetchMock), { model: "nope", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ kind: "http", status: 404 });
  });

  it("refuses a 200 that carries no message content rather than returning empty text", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ choices: [] }));
    await expect(
      ollamaChat(client(fetchMock), { model: "m", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ kind: "bad_response" });
  });
});

describe("ollamaEmbed", () => {
  it("returns one vector per input, in the order asked", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
      }),
    );
    const vectors = await ollamaEmbed(client(fetchMock), { model: "bge-m3", input: ["a", "b"] });
    expect(vectors).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it("refuses a short batch — a missing vector would be written against the wrong row", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [{ embedding: [1, 0] }] }));
    await expect(
      ollamaEmbed(client(fetchMock), { model: "bge-m3", input: ["a", "b"] }),
    ).rejects.toMatchObject({ kind: "bad_response" });
  });

  it("makes no request at all for an empty batch", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [] }));
    expect(await ollamaEmbed(client(fetchMock), { model: "bge-m3", input: [] })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ollamaHealth", () => {
  it("reports the tags the daemon holds", async () => {
    const fetchMock = fetchSpy(async () => jsonResponse({ models: [{ name: "qwen2.5:3b" }, { name: "bge-m3:latest" }] }));
    const health = await ollamaHealth(client(fetchMock));
    expect(health.ok).toBe(true);
    expect(health.models).toEqual(["qwen2.5:3b", "bge-m3:latest"]);
    expect(fetchMock.mock.calls[0][0]).toBe("http://ollama.test:11434/api/tags");
  });

  it("never throws — a health probe that crashes cannot report ill health", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const health = await ollamaHealth(client(fetchMock));
    expect(health.ok).toBe(false);
    expect(health.error).toContain("unreachable");
  });

  it("matches a tag whether or not :latest was typed", () => {
    expect(modelIsPresent(["bge-m3:latest"], "bge-m3")).toBe(true);
    expect(modelIsPresent(["qwen2.5:3b"], "qwen2.5:3b")).toBe(true);
    expect(modelIsPresent(["qwen2.5:7b"], "qwen2.5:3b")).toBe(false);
  });
});

describe("sseDataFrames", () => {
  it("reassembles frames split across reads and stops at [DONE]", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const e = new TextEncoder();
        controller.enqueue(e.encode('data: {"a":1}\n\ndata: {"b'));
        controller.enqueue(e.encode('":2}\n\ndata: [DONE]\n\ndata: {"never":true}\n'));
        controller.close();
      },
    });
    const seen: string[] = [];
    for await (const frame of sseDataFrames(stream)) seen.push(frame);
    expect(seen).toEqual(['{"a":1}', '{"b":2}']);
  });
});

// ── AI-SDK adapter ────────────────────────────────────────────────────────────
describe("the Ollama language model, through the real AI SDK", () => {
  it("answers a generateText call", async () => {
    const fetchMock = fetchSpy(async () => jsonResponse(completion("A library is a collection.")));
    const result = await generateText({
      model: ollamaLanguageModel(client(fetchMock), "qwen2.5:3b"),
      system: "You are a librarian.",
      messages: [{ role: "user", content: "What is a library?" }],
      maxOutputTokens: 200,
    });
    expect(result.text).toBe("A library is a collection.");
    expect(result.usage.inputTokens).toBe(11);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.messages).toEqual([
      { role: "system", content: "You are a librarian." },
      { role: "user", content: "What is a library?" },
    ]);
  });

  it("streams deltas in order", async () => {
    const frames = [
      'data: {"id":"1","model":"qwen2.5:3b","choices":[{"delta":{"content":"បណ្ណាល័យ"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" is a library"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":9}}\n\n',
      "data: [DONE]\n\n",
    ];
    const result = streamText({
      model: ollamaLanguageModel(client(async () => sseResponse(frames)), "qwen2.5:3b"),
      messages: [{ role: "user", content: "hi" }],
    });
    const chunks: string[] = [];
    for await (const delta of result.textStream) chunks.push(delta);
    expect(chunks.join("")).toBe("បណ្ណាល័យ is a library");
    expect((await result.usage).outputTokens).toBe(9);
  });

  it("surfaces a stream that dies mid-answer instead of truncating silently", async () => {
    const frames = ['data: {"choices":[{"delta":{"content":"half an ans"}}]}\n\n'];
    const result = streamText({
      model: ollamaLanguageModel(client(async () => sseResponse(frames, { fail: new Error("connection reset") })), "m"),
      messages: [{ role: "user", content: "hi" }],
    });
    const errors: unknown[] = [];
    const text: string[] = [];
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") text.push(part.text);
      if (part.type === "error") errors.push(part.error);
    }
    expect(text.join("")).toBe("half an ans");
    expect(errors).toHaveLength(1);
  });

  it("drops a part it cannot send and says so, rather than sending half a prompt in silence", () => {
    const { messages, warnings } = toOllamaMessages([
      { role: "system", content: "sys" },
      {
        role: "user",
        content: [
          { type: "text", text: "look at " },
          { type: "file", data: "AAA", mediaType: "image/png" },
          { type: "text", text: "this" },
        ],
      },
    ]);
    expect(messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "look at this" },
    ]);
    expect(warnings).toEqual([{ type: "unsupported", feature: "user file part" }]);
  });
});

// ── The provider's decisions ──────────────────────────────────────────────────
describe("chatCompletion falls back", () => {
  it("answers from Ollama when the box is up, and never touches Gemini", async () => {
    const geminiModel = vi.fn(fakeGemini);
    const provider = createAIProvider(config(), {
      fetch: async () => jsonResponse(completion("local answer")),
      geminiModel,
      log: silent,
    });
    const { text, trace } = await provider.complete("What is a library?");
    expect(text).toBe("local answer");
    expect(trace).toMatchObject({ provider: "ollama", modelId: "qwen2.5:3b", fellBack: false });
    expect(geminiModel).not.toHaveBeenCalled();
  });

  it("hands the SAME request to Gemini when the box is down", async () => {
    const provider = createAIProvider(config(), {
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
      geminiModel: (id) => fakeGemini(id),
      log: silent,
    });
    const { text, trace } = await provider.complete("What is a library?");
    expect(text).toBe("cloud answer");
    expect(trace.fellBack).toBe(true);
    expect(trace.provider).toBe("gemini");
    expect(trace.primaryError).toBe("unreachable");
  });

  it("falls back before the first byte of a stream, so the reader sees one answer", async () => {
    const provider = createAIProvider(config(), {
      fetch: async () => jsonResponse({ error: "loading model" }, { status: 503 }),
      geminiModel: (id) => fakeGemini(id, "cloud stream"),
      log: silent,
    });
    const { model, trace } = provider.languageModel();
    const result = streamText({ model, messages: [{ role: "user", content: "hi" }] });
    let out = "";
    for await (const delta of result.textStream) out += delta;
    expect(out).toBe("cloud stream");
    expect(trace.fellBack).toBe(true);
  });

  it("propagates the local failure when the operator turned the fallback off", async () => {
    const provider = createAIProvider(config({ fallbackToGemini: false }), {
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
      geminiModel: () => fakeGemini("should-not-be-used"),
      log: silent,
    });
    await expect(provider.complete("hi")).rejects.toBeInstanceOf(OllamaError);
  });

  it("stops paying the timeout once the breaker opens", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    let now = 0;
    const provider = createAIProvider(config({ breakerFailures: 2, breakerCooldownMs: 60_000 }), {
      fetch: fetchMock,
      now: () => now,
      geminiModel: (id) => fakeGemini(id),
      log: silent,
    });
    await provider.complete("one");
    await provider.complete("two");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const third = await provider.complete("three");
    expect(fetchMock).toHaveBeenCalledTimes(2); // the box was not asked at all
    expect(third.trace.primarySkipped).toBe(true);
    expect(third.text).toBe("cloud answer");
    expect(provider.breakerState().open).toBe(true);

    // …and tries again once the cooldown has passed.
    now += 60_000;
    await provider.complete("four");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("routes generation to Gemini directly when AI_PROVIDER=gemini, with no local call", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(completion("local")));
    const provider = createAIProvider(config({ chatProvider: "gemini" }), {
      fetch: fetchMock,
      geminiModel: (id) => fakeGemini(id),
      log: silent,
    });
    const { trace } = await provider.complete("hi");
    expect(trace.provider).toBe("gemini");
    expect(trace.fellBack).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("embeddings never fall back", () => {
  const ollamaEmbedCfg = () =>
    config({ embedProvider: "ollama", embedModel: "bge-m3", embedDim: 3, ollamaEmbedModel: "bge-m3" });

  it("returns L2-normalised vectors from the local model", async () => {
    const provider = createAIProvider(ollamaEmbedCfg(), {
      fetch: async () => jsonResponse({ data: [{ embedding: [3, 0, 4] }] }),
      log: silent,
    });
    const [vector] = await provider.generateEmbedding("សៀវភៅ");
    expect(vector).toEqual([0.6, 0, 0.8]);
  });

  it("throws rather than letting Gemini answer with a vector from another space", async () => {
    const geminiEmbed = { documents: vi.fn(), query: vi.fn() };
    const provider = createAIProvider(ollamaEmbedCfg(), {
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
      geminiEmbed,
      log: silent,
    });
    await expect(provider.generateEmbedding("x")).rejects.toBeInstanceOf(OllamaError);
    await expect(provider.embedQuery("x")).rejects.toBeInstanceOf(OllamaError);
    // The whole point: a fallback here would write noise into pgvector.
    expect(geminiEmbed.documents).not.toHaveBeenCalled();
    expect(geminiEmbed.query).not.toHaveBeenCalled();
  });

  it("refuses a vector whose width disagrees with the index", async () => {
    const provider = createAIProvider(ollamaEmbedCfg(), {
      fetch: async () => jsonResponse({ data: [{ embedding: [1, 0, 0, 0] }] }),
      log: silent,
    });
    await expect(provider.generateEmbedding("x")).rejects.toThrow(/dimension mismatch/i);
  });

  it("uses Gemini's query-side embedder when Gemini is the embedding provider", async () => {
    const geminiEmbed = {
      documents: vi.fn(async (texts: string[]) => texts.map(() => new Array(768).fill(0))),
      query: vi.fn(async () => new Array(768).fill(0)),
    };
    const fetchMock = vi.fn();
    const provider = createAIProvider(config({ embedProvider: "gemini", embedModel: "gemini-embedding-001", embedDim: 768 }), {
      fetch: fetchMock,
      geminiEmbed,
      log: silent,
    });
    await provider.embedQuery("hello");
    await provider.generateEmbedding(["a", "b"]);
    expect(geminiEmbed.query).toHaveBeenCalledTimes(1);
    expect(geminiEmbed.documents).toHaveBeenCalledWith(["a", "b"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("status", () => {
  it("reports what the box holds alongside what the app expects", async () => {
    const provider = createAIProvider(config(), {
      fetch: async () => jsonResponse({ models: [{ name: "qwen2.5:3b" }] }),
      log: silent,
    });
    const status = await provider.status();
    expect(status.chatProvider).toBe("ollama");
    expect(status.embedProvider).toBe("gemini");
    expect(status.ollama?.ok).toBe(true);
    expect(status.ollama?.models).toContain("qwen2.5:3b");
    expect(status.geminiConfigured).toBe(true);
  });

  it("does not probe the box when nothing is configured to use it", async () => {
    const fetchMock = vi.fn();
    const provider = createAIProvider(config({ chatProvider: "gemini", embedProvider: "gemini" }), {
      fetch: fetchMock,
      log: silent,
    });
    expect((await provider.status()).ollama).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
