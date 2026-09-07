// lib/ai/provider.ts
// The ONE door to a model. Everything that generates text or embeds a string
// — the assistant router, the search summary, the query embedder, the chunk
// backfill — asks this module, and this module decides between the local
// Ollama box and Gemini. No other file may construct a provider client.
//
// Three rules:
//
//   1. TEXT falls back; EMBEDDINGS do not. A Gemini answer to a question
//      Ollama could not take is the same answer to the reader. A Gemini
//      vector compared against bge-m3 vectors is noise — and it would be
//      silent noise, because pgvector happily ranks any two vectors of the
//      same length. When the embedding backend fails, the caller's own
//      degrade path (keyword search, `fallback: "no_embedding"`) runs instead.
//   2. Failure is decided BEFORE the stream starts. The Ollama adapter
//      resolves `doStream` only once response headers are in, so "down",
//      "refusing" and "too loaded to begin" all reject in time for Gemini
//      to answer the same request. A stream that dies mid-answer cannot be
//      restarted on another provider without re-sending text the reader has
//      already seen; it is reported, counted against the breaker, and ends.
//   3. A down box costs ONE timeout per cooldown, not one per request
//      (lib/ai/circuit-breaker.ts).
//
// Node/server only. Deliberately free of `server-only` because
// scripts/embed-library.ts and scripts/test-local-ai.ts run it under tsx;
// never import it from a client component.

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, type ModelMessage } from "ai";
import { generateDocumentEmbeddings, generateQueryEmbedding } from "@/lib/gemini-embeddings";
import { CircuitBreaker, type CircuitBreakerState } from "./circuit-breaker";
import { MODEL_IDS } from "./models";
import {
  OllamaError,
  ollamaEmbed,
  ollamaHealth,
  ollamaLanguageModel,
  type FetchLike,
  type LanguageModelStreamPart,
  type LanguageModelV3,
  type OllamaClientOptions,
  type OllamaHealth,
} from "./ollama";
import {
  chatConfiguredFor,
  embeddingsConfiguredFor,
  geminiFallbackAvailable,
  resolveProviderConfig,
  type AIProviderConfig,
  type AIProviderName,
} from "./provider-config";
import { AIRequestError, type ModelTier } from "./response";

// ── Public types ──────────────────────────────────────────────────────────────
export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  /** Chooses the Gemini model on the cloud path; the local model is fixed. */
  tier?: Exclude<ModelTier, "none">;
  signal?: AbortSignal;
}

/**
 * What actually answered. Filled in as the call runs: it starts as the
 * primary's identity and is rewritten if the fallback took over, so a
 * caller that reads it AFTER awaiting the result sees the truth. Telemetry
 * records it — a rising `provider_fallback` rate is the signal that the box
 * is struggling, and it is invisible any other way.
 */
export interface ProviderTrace {
  provider: AIProviderName | "mock";
  modelId: string;
  /** The primary failed and the secondary answered. */
  fellBack: boolean;
  /** The breaker was open, so the primary was not even tried. */
  primarySkipped: boolean;
  /** Why the primary was abandoned, when it was. Never message content. */
  primaryError?: string;
}

export interface CompletionResult {
  text: string;
  trace: ProviderTrace;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

export interface ProviderStatus {
  chatProvider: AIProviderName;
  embedProvider: AIProviderName;
  chatModel: string;
  embedModel: string;
  embedDim: number;
  fallbackToGemini: boolean;
  geminiConfigured: boolean;
  /** Present only when Ollama is the chat or embedding provider. */
  ollama: (OllamaHealth & { baseUrl: string }) | null;
  breaker: CircuitBreakerState;
}

export interface AIProvider {
  readonly config: AIProviderConfig;
  /**
   * An AI-SDK model for `generateText`/`streamText`. On the Ollama path this
   * is the hybrid: local first, Gemini when allowed and needed.
   */
  languageModel(input?: { tier?: Exclude<ModelTier, "none">; geminiModelId?: string }): {
    model: LanguageModelV3;
    trace: ProviderTrace;
  };
  /** One-shot completion, text only. */
  chatCompletion(prompt: string, history?: Message[], options?: CompletionOptions): Promise<string>;
  /** Same call, with the provider trace and token usage for telemetry. */
  complete(prompt: string, history?: Message[], options?: CompletionOptions): Promise<CompletionResult>;
  /** Document-side embeddings, one vector per input, L2-normalised. */
  generateEmbedding(text: string | string[]): Promise<number[][]>;
  /** Query-side embedding in the SAME space as `generateEmbedding`. */
  embedQuery(text: string): Promise<number[]>;
  chatConfigured(): boolean;
  embeddingsConfigured(): boolean;
  status(): Promise<ProviderStatus>;
  breakerState(): CircuitBreakerState;
  /** Test/diagnostic hook: forget past failures. */
  resetBreaker(): void;
}

export interface AIProviderDeps {
  fetch?: FetchLike;
  now?: () => number;
  /** Gemini model factory; the tests inject a fake so no key is ever used. */
  geminiModel?: (modelId: string, apiKey: string) => LanguageModelV3;
  geminiEmbed?: {
    documents(texts: string[]): Promise<number[][]>;
    query(text: string): Promise<number[]>;
  };
  log?: (message: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function l2normalize(values: number[]): number[] {
  const mag = Math.sqrt(values.reduce((s, x) => s + x * x, 0)) || 1;
  return values.map((x) => x / mag);
}

function describeError(err: unknown): string {
  if (err instanceof OllamaError) return `${err.kind}${err.status ? ` ${err.status}` : ""}`;
  if (err instanceof Error) return err.name;
  return "unknown";
}

function defaultGeminiModel(modelId: string, apiKey: string): LanguageModelV3 {
  return createGoogleGenerativeAI({ apiKey })(modelId) as unknown as LanguageModelV3;
}

/**
 * Pass the primary's stream through, watching for the error part the
 * adapter emits when Ollama dies mid-answer, so the breaker learns about it
 * even though `doStream` itself had already succeeded.
 */
function observeStreamFailure(
  stream: ReadableStream<LanguageModelStreamPart>,
  onError: () => void,
): ReadableStream<LanguageModelStreamPart> {
  return stream.pipeThrough(
    new TransformStream<LanguageModelStreamPart, LanguageModelStreamPart>({
      transform(part, controller) {
        if (part.type === "error") onError();
        controller.enqueue(part);
      },
    }),
  );
}

/** Local first; Gemini when the local call fails and a fallback exists. */
function hybridModel(
  primary: LanguageModelV3,
  secondary: (() => LanguageModelV3) | null,
  breaker: CircuitBreaker,
  trace: ProviderTrace,
  log: (m: string) => void,
): LanguageModelV3 {
  // Named for what it does, not `use*` — the React hooks lint rule reads any
  // `useX()` call inside a plain function as a misplaced hook.
  const answerWithGemini = <T>(call: (m: LanguageModelV3) => PromiseLike<T>): PromiseLike<T> => {
    const model = secondary!();
    trace.fellBack = true;
    trace.provider = "gemini";
    trace.modelId = model.modelId;
    return call(model);
  };

  const run = async <T>(call: (m: LanguageModelV3) => PromiseLike<T>): Promise<T> => {
    if (!breaker.allows()) {
      trace.primarySkipped = true;
      if (secondary) {
        log(`[ai/provider] Ollama breaker open — answering with Gemini`);
        return answerWithGemini(call);
      }
      // Nothing else can answer: try the box anyway and let the outcome
      // update the breaker.
    }
    try {
      const result = await call(primary);
      breaker.recordSuccess();
      return result;
    } catch (err) {
      breaker.recordFailure();
      trace.primaryError = describeError(err);
      if (!secondary) throw err;
      log(`[ai/provider] Ollama failed (${trace.primaryError}) — falling back to Gemini`);
      return answerWithGemini(call);
    }
  };

  return {
    specificationVersion: "v3",
    provider: "ptec-hybrid",
    modelId: primary.modelId,
    supportedUrls: {},
    doGenerate: (options) => run((m) => m.doGenerate(options)),
    doStream: (options) =>
      run(async (m) => {
        const result = await m.doStream(options);
        if (m !== primary) return result;
        return { ...result, stream: observeStreamFailure(result.stream, () => breaker.recordFailure()) };
      }),
  };
}

// ── Factory ───────────────────────────────────────────────────────────────────
export function createAIProvider(
  configSource: AIProviderConfig | (() => AIProviderConfig),
  deps: AIProviderDeps = {},
): AIProvider {
  const cfgOf = typeof configSource === "function" ? configSource : () => configSource;
  const log = deps.log ?? ((m: string) => console.warn(m));
  const geminiModel = deps.geminiModel ?? defaultGeminiModel;
  const geminiEmbed = deps.geminiEmbed ?? {
    documents: generateDocumentEmbeddings,
    query: generateQueryEmbedding,
  };

  let breaker: CircuitBreaker | null = null;
  const breakerFor = (cfg: AIProviderConfig): CircuitBreaker =>
    (breaker ??= new CircuitBreaker({
      threshold: cfg.breakerFailures,
      cooldownMs: cfg.breakerCooldownMs,
      now: deps.now,
    }));

  const chatClient = (cfg: AIProviderConfig): OllamaClientOptions => ({
    baseUrl: cfg.ollamaBaseUrl,
    rootUrl: cfg.ollamaRootUrl,
    timeoutMs: cfg.ollamaTimeoutMs,
    fetch: deps.fetch,
  });
  const embedClient = (cfg: AIProviderConfig): OllamaClientOptions => ({
    ...chatClient(cfg),
    timeoutMs: cfg.ollamaEmbedTimeoutMs,
  });

  const requireGemini = (cfg: AIProviderConfig, purpose: string): string => {
    if (!cfg.geminiApiKey) {
      throw new AIRequestError("unavailable", `GEMINI_API_KEY is not configured (${purpose}).`);
    }
    return cfg.geminiApiKey;
  };

  const assertDim = (cfg: AIProviderConfig, vectors: number[][]): number[][] => {
    for (const v of vectors) {
      if (v.length !== cfg.embedDim) {
        throw new Error(
          `Embedding dimension mismatch: ${cfg.embedModel} returned ${v.length} values, the index holds ${cfg.embedDim}. ` +
            `AI_EMBED_PROVIDER/OLLAMA_EMBED_DIM disagree with the model — see docs/LOCAL_AI_OLLAMA_SETUP.md §5.`,
        );
      }
    }
    return vectors;
  };

  const provider: AIProvider = {
    get config() {
      return cfgOf();
    },

    languageModel(input = {}) {
      const cfg = cfgOf();
      const tier = input.tier ?? "fast";
      const geminiId = input.geminiModelId ?? MODEL_IDS[tier];

      if (cfg.chatProvider === "gemini") {
        const key = requireGemini(cfg, "AI_PROVIDER=gemini");
        return {
          model: geminiModel(geminiId, key),
          trace: { provider: "gemini", modelId: geminiId, fellBack: false, primarySkipped: false },
        };
      }

      const primary = ollamaLanguageModel(chatClient(cfg), cfg.ollamaChatModel);
      const secondary = geminiFallbackAvailable(cfg) ? () => geminiModel(geminiId, cfg.geminiApiKey!) : null;
      const trace: ProviderTrace = {
        provider: "ollama",
        modelId: cfg.ollamaChatModel,
        fellBack: false,
        primarySkipped: false,
      };
      return { model: hybridModel(primary, secondary, breakerFor(cfg), trace, log), trace };
    },

    async complete(prompt, history = [], options = {}) {
      const { model, trace } = provider.languageModel({ tier: options.tier });
      const messages: ModelMessage[] = [
        ...history.map((m): ModelMessage => ({ role: m.role, content: m.content })),
        { role: "user", content: prompt },
      ];
      const result = await generateText({
        model,
        system: options.system,
        messages,
        maxOutputTokens: options.maxOutputTokens,
        temperature: options.temperature,
        abortSignal: options.signal,
      });
      return {
        text: result.text ?? "",
        trace,
        usage: {
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
          totalTokens: result.usage?.totalTokens,
        },
      };
    },

    async chatCompletion(prompt, history, options) {
      return (await provider.complete(prompt, history, options)).text;
    },

    async generateEmbedding(text) {
      const cfg = cfgOf();
      const texts = Array.isArray(text) ? text : [text];
      if (texts.length === 0) return [];
      if (cfg.embedProvider === "ollama") {
        const vectors = await ollamaEmbed(embedClient(cfg), { model: cfg.ollamaEmbedModel, input: texts });
        return assertDim(cfg, vectors.map(l2normalize));
      }
      if (!cfg.geminiApiKey) throw new Error("GEMINI_API_KEY is not configured on the server (AI_EMBED_PROVIDER=gemini).");
      return assertDim(cfg, await geminiEmbed.documents(texts));
    },

    async embedQuery(text) {
      const cfg = cfgOf();
      if (cfg.embedProvider === "ollama") {
        // bge-m3 is symmetric: no instruction prefix, one space for both
        // sides. Gemini's RETRIEVAL_QUERY/RETRIEVAL_DOCUMENT split has no
        // local counterpart.
        const [vector] = await provider.generateEmbedding(text);
        return vector;
      }
      if (!cfg.geminiApiKey) throw new Error("GEMINI_API_KEY is not configured on the server (AI_EMBED_PROVIDER=gemini).");
      const [vector] = assertDim(cfg, [await geminiEmbed.query(text)]);
      return vector;
    },

    chatConfigured() {
      return chatConfiguredFor(cfgOf());
    },

    embeddingsConfigured() {
      return embeddingsConfiguredFor(cfgOf());
    },

    async status() {
      const cfg = cfgOf();
      const usesOllama = cfg.chatProvider === "ollama" || cfg.embedProvider === "ollama";
      const health = usesOllama ? await ollamaHealth(chatClient(cfg)) : null;
      return {
        chatProvider: cfg.chatProvider,
        embedProvider: cfg.embedProvider,
        chatModel: cfg.chatProvider === "ollama" ? cfg.ollamaChatModel : MODEL_IDS.fast,
        embedModel: cfg.embedModel,
        embedDim: cfg.embedDim,
        fallbackToGemini: cfg.fallbackToGemini,
        geminiConfigured: cfg.geminiApiKey !== null,
        ollama: health ? { ...health, baseUrl: cfg.ollamaBaseUrl } : null,
        breaker: breakerFor(cfg).state(),
      };
    },

    breakerState() {
      return breakerFor(cfgOf()).state();
    },

    resetBreaker() {
      breaker?.reset();
    },
  };

  return provider;
}

// ── Process-wide instance ─────────────────────────────────────────────────────
// Configuration is re-read from the environment on every call (it is a few
// string reads), so a test or a hot-reloaded dev server sees a changed
// variable immediately; the breaker persists, because a box that just failed
// three times is still down whatever the env says.
let singleton: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  return (singleton ??= createAIProvider(() => resolveProviderConfig(process.env)));
}

/** Tests only: drop the shared breaker state. */
export function resetAIProvider(): void {
  singleton = null;
}

// Convenience wrappers matching the shape most call sites want.
export function chatCompletion(prompt: string, history?: Message[], options?: CompletionOptions): Promise<string> {
  return getAIProvider().chatCompletion(prompt, history, options);
}

export function generateEmbedding(text: string | string[]): Promise<number[][]> {
  return getAIProvider().generateEmbedding(text);
}

export function embedQuery(text: string): Promise<number[]> {
  return getAIProvider().embedQuery(text);
}

/** Some backend can generate text with the current environment. */
export function chatConfigured(): boolean {
  return getAIProvider().chatConfigured();
}

/** The configured embedding backend has what it needs. */
export function embeddingsConfigured(): boolean {
  return getAIProvider().embeddingsConfigured();
}
