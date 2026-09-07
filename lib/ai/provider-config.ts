// lib/ai/provider-config.ts
// WHICH provider answers, resolved once from the environment. Pure on purpose:
// no fetch, no SDK, no `server-only`, so the unit tests and the CLI check
// (scripts/test-local-ai.ts) can construct any configuration without touching
// process.env.
//
// Two independent switches, and the split is the point:
//
//   AI_PROVIDER        — who GENERATES text (assistant answers, search
//                        summaries). Freely switchable per deploy; a failed
//                        local call can fall back to Gemini and the reader
//                        sees one answer either way.
//   AI_EMBED_PROVIDER  — who EMBEDS. NOT freely switchable: every vector in
//                        books.embedding / book_chunks.embedding was produced
//                        by ONE model at ONE dimensionality, and a query
//                        embedded by a different model is noise against them
//                        (that exact bug is why lib/ai/models.ts exists).
//                        Switching this means a migration to the new
//                        dimension plus a full re-embed — see
//                        docs/LOCAL_AI_OLLAMA_SETUP.md §5 — which is why it
//                        defaults to `gemini` even when AI_PROVIDER=ollama,
//                        and why embeddings NEVER fall back across providers.
//
// Unset AI_PROVIDER means `gemini`: production stays on the path it ran
// yesterday until an operator explicitly enables the local box (the same
// fail-safe shape as lib/admin/analytics-flags.ts).

export type AIProviderName = "ollama" | "gemini";

/** Gemini's embedding space — the one every vector column holds today. */
export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
export const GEMINI_EMBEDDING_DIM = 768;

/** bge-m3 emits 1024 dimensions; Ollama has no truncation option. */
export const OLLAMA_DEFAULT_EMBED_DIM = 1024;

export const OLLAMA_DEFAULTS = {
  baseUrl: "http://localhost:11434/v1",
  chatModel: "qwen2.5:3b",
  embedModel: "bge-m3",
  /** Whole-call budget for a non-streamed completion, and time-to-first-byte
   *  for a streamed one. A 3B model on CPU needs tens of seconds for a long
   *  answer; anything past a minute is a box that cannot serve readers. */
  timeoutMs: 60_000,
  embedTimeoutMs: 30_000,
  /** Consecutive failures before Ollama is skipped outright… */
  breakerFailures: 3,
  /** …and for how long. Long enough that a down box costs one timeout per
   *  minute instead of one per request; short enough that a restart is
   *  noticed without a redeploy. */
  breakerCooldownMs: 60_000,
} as const;

export interface AIProviderConfig {
  /** Who generates text. */
  chatProvider: AIProviderName;
  /** Who embeds — bound to the stored index, see the header. */
  embedProvider: AIProviderName;
  /** OpenAI-compatible root, e.g. `http://localhost:11434/v1`. */
  ollamaBaseUrl: string;
  /** Native API root (`/api/tags`, `/api/version`), derived from the above. */
  ollamaRootUrl: string;
  ollamaChatModel: string;
  ollamaEmbedModel: string;
  ollamaEmbedDim: number;
  ollamaTimeoutMs: number;
  ollamaEmbedTimeoutMs: number;
  breakerFailures: number;
  breakerCooldownMs: number;
  /** When the local provider fails, may Gemini answer instead? */
  fallbackToGemini: boolean;
  geminiApiKey: string | null;
  /** The resolved embedding space: model id + dimensionality. */
  embedModel: string;
  embedDim: number;
}

export type EnvSource = Record<string, string | undefined>;

function providerName(raw: string | undefined, fallback: AIProviderName): AIProviderName {
  const v = raw?.trim().toLowerCase();
  return v === "ollama" || v === "gemini" ? v : fallback;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function flag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return fallback;
}

/**
 * `http://host:11434/v1` → `http://host:11434`. The OpenAI-compatible surface
 * lives under `/v1`; health and model listing live on the native API beside
 * it. Tolerates a trailing slash and a base that was given without `/v1`.
 */
export function ollamaRootUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

/** Normalised OpenAI-compatible base: always ends in `/v1`, never in `/`. */
export function ollamaOpenAiBase(baseUrl: string): string {
  return `${ollamaRootUrl(baseUrl)}/v1`;
}

export function resolveProviderConfig(env: EnvSource): AIProviderConfig {
  const chatProvider = providerName(env.AI_PROVIDER, "gemini");
  const embedProvider = providerName(env.AI_EMBED_PROVIDER, "gemini");
  const ollamaBaseUrl = ollamaOpenAiBase(env.OLLAMA_BASE_URL?.trim() || OLLAMA_DEFAULTS.baseUrl);
  const ollamaEmbedModel = env.OLLAMA_EMBED_MODEL?.trim() || OLLAMA_DEFAULTS.embedModel;
  const ollamaEmbedDim = positiveInt(env.OLLAMA_EMBED_DIM, OLLAMA_DEFAULT_EMBED_DIM);
  const geminiApiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || null;

  return {
    chatProvider,
    embedProvider,
    ollamaBaseUrl,
    ollamaRootUrl: ollamaRootUrl(ollamaBaseUrl),
    ollamaChatModel: env.OLLAMA_CHAT_MODEL?.trim() || OLLAMA_DEFAULTS.chatModel,
    ollamaEmbedModel,
    ollamaEmbedDim,
    ollamaTimeoutMs: positiveInt(env.OLLAMA_TIMEOUT_MS, OLLAMA_DEFAULTS.timeoutMs),
    ollamaEmbedTimeoutMs: positiveInt(env.OLLAMA_EMBED_TIMEOUT_MS, OLLAMA_DEFAULTS.embedTimeoutMs),
    breakerFailures: positiveInt(env.OLLAMA_BREAKER_FAILURES, OLLAMA_DEFAULTS.breakerFailures),
    breakerCooldownMs: positiveInt(env.OLLAMA_BREAKER_COOLDOWN_MS, OLLAMA_DEFAULTS.breakerCooldownMs),
    fallbackToGemini: flag(env.LOCAL_AI_FALLBACK_TO_GEMINI, true),
    geminiApiKey,
    embedModel: embedProvider === "ollama" ? ollamaEmbedModel : GEMINI_EMBEDDING_MODEL,
    embedDim: embedProvider === "ollama" ? ollamaEmbedDim : GEMINI_EMBEDDING_DIM,
  };
}

/** True when SOME backend can generate text with this configuration. */
export function chatConfiguredFor(cfg: AIProviderConfig): boolean {
  return cfg.chatProvider === "ollama" || cfg.geminiApiKey !== null;
}

/** True when the configured embedding backend has what it needs. */
export function embeddingsConfiguredFor(cfg: AIProviderConfig): boolean {
  return cfg.embedProvider === "ollama" || cfg.geminiApiKey !== null;
}

/** Gemini is reachable as a fallback for TEXT only when allowed and keyed. */
export function geminiFallbackAvailable(cfg: AIProviderConfig): boolean {
  return cfg.chatProvider === "ollama" && cfg.fallbackToGemini && cfg.geminiApiKey !== null;
}
