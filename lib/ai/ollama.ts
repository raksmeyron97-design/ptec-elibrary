// lib/ai/ollama.ts
// The Ollama backend: an HTTP client for the OpenAI-compatible surface
// (`/v1/chat/completions`, `/v1/embeddings`) plus an AI-SDK `LanguageModelV3`
// adapter over it, so the router's `generateText`/`streamText` calls need no
// second code path for the local box.
//
// No SDK dependency on purpose. `@ai-sdk/openai-compatible` is not installed,
// and the two endpoints this needs are small enough that a typed client is
// less code than an audit-gate exception. `fetch` is injectable so the unit
// tests can drive every branch — connection refused, timeout, a 5xx, a
// malformed body, a stream that dies mid-answer — without a server.
//
// Node/server only (it is imported by scripts, so it must not import
// `server-only`); never import it from a client component.

import type { LanguageModel } from "ai";

// ── AI-SDK types, derived rather than imported ────────────────────────────────
// `@ai-sdk/provider` is a transitive dependency; deriving the shapes from the
// `LanguageModel` union `ai` exports keeps this file on the SDK version the
// app actually pins, with no extra package to keep in step.
export type LanguageModelV3 = Extract<Exclude<LanguageModel, string>, { specificationVersion: "v3" }>;
export type LanguageModelCallOptions = Parameters<LanguageModelV3["doGenerate"]>[0];
export type LanguageModelGenerateResult = Awaited<ReturnType<LanguageModelV3["doGenerate"]>>;
export type LanguageModelStreamResult = Awaited<ReturnType<LanguageModelV3["doStream"]>>;
export type LanguageModelStreamPart =
  LanguageModelStreamResult["stream"] extends ReadableStream<infer P> ? P : never;
type Usage = LanguageModelGenerateResult["usage"];
type FinishReason = LanguageModelGenerateResult["finishReason"];
type Warning = LanguageModelGenerateResult["warnings"][number];

// ── Errors ────────────────────────────────────────────────────────────────────
export type OllamaErrorKind =
  /** TCP-level: nothing is listening, DNS failed, the container is down. */
  | "unreachable"
  /** The box answered nothing within the budget — down, or overloaded. */
  | "timeout"
  /** A non-2xx status. `status` carries it. */
  | "http"
  /** A 2xx whose body was not what the API promises. */
  | "bad_response";

export class OllamaError extends Error {
  readonly kind: OllamaErrorKind;
  readonly status?: number;
  constructor(kind: OllamaErrorKind, message: string, status?: number) {
    super(message);
    this.name = "OllamaError";
    this.kind = kind;
    this.status = status;
  }
}

// ── Client ────────────────────────────────────────────────────────────────────
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface OllamaClientOptions {
  /** OpenAI-compatible base, ending in `/v1`. */
  baseUrl: string;
  /** Native API root (the base without `/v1`), for `/api/tags`. */
  rootUrl: string;
  /** Whole-call budget (non-streamed) / time-to-first-byte (streamed). */
  timeoutMs: number;
  fetch?: FetchLike;
}

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaChatParams {
  model: string;
  messages: OllamaChatMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  seed?: number;
  signal?: AbortSignal;
}

export interface OllamaUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface OllamaChatResult {
  text: string;
  finishReason: string | undefined;
  usage: OllamaUsage;
  id?: string;
  model?: string;
}

/** One parsed `data:` frame of a streamed completion. */
export interface OllamaStreamChunk {
  delta: string;
  finishReason: string | undefined;
  usage?: OllamaUsage;
  id?: string;
  model?: string;
}

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

function mapUsage(u: OpenAiUsage | undefined): OllamaUsage {
  return {
    promptTokens: u?.prompt_tokens,
    completionTokens: u?.completion_tokens,
    totalTokens: u?.total_tokens,
  };
}

/**
 * Race a call against a timeout AND the caller's own signal. The timer is
 * cleared by the caller as soon as the awaited stage is over — for a stream
 * that is the response headers, not the last byte.
 */
function timeoutSignal(ms: number, outer?: AbortSignal): { signal: AbortSignal; clear: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  const onOuterAbort = () => controller.abort();
  outer?.addEventListener("abort", onOuterAbort, { once: true });
  if (outer?.aborted) controller.abort();
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuterAbort);
    },
    timedOut: () => timedOut,
  };
}

function classifyFetchError(err: unknown, timedOut: boolean, url: string): OllamaError {
  if (err instanceof OllamaError) return err;
  if (timedOut) return new OllamaError("timeout", `Ollama did not answer within the budget (${url}).`);
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
  return new OllamaError("unreachable", `Ollama is unreachable at ${url}: ${message}${cause}`);
}

async function postJson(
  opts: OllamaClientOptions,
  path: string,
  body: unknown,
  signal: AbortSignal,
  timedOut: () => boolean,
): Promise<Response> {
  const url = `${opts.baseUrl}${path}`;
  const doFetch = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw classifyFetchError(err, timedOut(), url);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OllamaError("http", `Ollama ${path} answered ${res.status}: ${detail.slice(0, 300)}`, res.status);
  }
  return res;
}

function chatBody(params: OllamaChatParams, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    stream,
  };
  if (params.maxTokens !== undefined) body.max_tokens = params.maxTokens;
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.topP !== undefined) body.top_p = params.topP;
  if (params.stop?.length) body.stop = params.stop;
  if (params.seed !== undefined) body.seed = params.seed;
  // Ollama honours this the way OpenAI does: the final frame carries usage.
  if (stream) body.stream_options = { include_usage: true };
  return body;
}

/** Non-streamed completion. Throws `OllamaError`; never returns partial text. */
export async function ollamaChat(opts: OllamaClientOptions, params: OllamaChatParams): Promise<OllamaChatResult> {
  const t = timeoutSignal(opts.timeoutMs, params.signal);
  try {
    const res = await postJson(opts, "/chat/completions", chatBody(params, false), t.signal, t.timedOut);
    let json: {
      id?: string;
      model?: string;
      choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
      usage?: OpenAiUsage;
    };
    try {
      json = await res.json();
    } catch (err) {
      throw classifyFetchError(err, t.timedOut(), opts.baseUrl);
    }
    const choice = json.choices?.[0];
    if (!choice || typeof choice.message?.content !== "string") {
      throw new OllamaError("bad_response", "Ollama returned no choices[0].message.content.");
    }
    return {
      text: choice.message.content,
      finishReason: choice.finish_reason ?? undefined,
      usage: mapUsage(json.usage),
      id: json.id,
      model: json.model,
    };
  } finally {
    t.clear();
  }
}

/**
 * Split a byte stream into SSE `data:` payloads. Handles frames that arrive
 * split across reads and the `[DONE]` sentinel. Exported for the tests.
 */
export async function* sseDataFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        if (data) yield data;
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) {
      const data = tail.slice(5).trim();
      if (data && data !== "[DONE]") yield data;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Streamed completion. Resolves once the response HEADERS are in — so a box
 * that is down, refusing, or too loaded to start rejects here, before any
 * caller has committed to the stream, and a fallback can still take over.
 * After that point the stream is the caller's: a mid-answer failure surfaces
 * as an `OllamaError` thrown from the iterator.
 */
export async function ollamaChatStream(
  opts: OllamaClientOptions,
  params: OllamaChatParams,
): Promise<{ response: Response; chunks: AsyncIterable<OllamaStreamChunk> }> {
  const t = timeoutSignal(opts.timeoutMs, params.signal);
  let res: Response;
  try {
    res = await postJson(opts, "/chat/completions", chatBody(params, true), t.signal, t.timedOut);
  } catch (err) {
    t.clear();
    throw err;
  }
  // Headers are in: the time-to-first-byte budget no longer applies. The
  // caller's own signal still does — it was chained into `t.signal`, which
  // the request keeps.
  t.clear();
  if (!res.body) throw new OllamaError("bad_response", "Ollama returned a streamed completion with no body.");
  const body = res.body;

  async function* chunks(): AsyncGenerator<OllamaStreamChunk> {
    try {
      for await (const data of sseDataFrames(body)) {
        let json: {
          id?: string;
          model?: string;
          choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
          usage?: OpenAiUsage;
        };
        try {
          json = JSON.parse(data);
        } catch {
          throw new OllamaError("bad_response", "Ollama sent a stream frame that is not JSON.");
        }
        const choice = json.choices?.[0];
        yield {
          delta: typeof choice?.delta?.content === "string" ? choice.delta.content : "",
          finishReason: choice?.finish_reason ?? undefined,
          usage: json.usage ? mapUsage(json.usage) : undefined,
          id: json.id,
          model: json.model,
        };
      }
    } catch (err) {
      throw classifyFetchError(err, false, opts.baseUrl);
    }
  }

  return { response: res, chunks: chunks() };
}

/** `/v1/embeddings` for a batch. Returns one vector per input, in order. */
export async function ollamaEmbed(
  opts: OllamaClientOptions,
  params: { model: string; input: string[]; signal?: AbortSignal },
): Promise<number[][]> {
  if (params.input.length === 0) return [];
  const t = timeoutSignal(opts.timeoutMs, params.signal);
  try {
    const res = await postJson(
      opts,
      "/embeddings",
      { model: params.model, input: params.input },
      t.signal,
      t.timedOut,
    );
    let json: { data?: Array<{ embedding?: unknown; index?: number }> };
    try {
      json = await res.json();
    } catch (err) {
      throw classifyFetchError(err, t.timedOut(), opts.baseUrl);
    }
    const rows = json.data ?? [];
    if (rows.length !== params.input.length) {
      throw new OllamaError(
        "bad_response",
        `Ollama returned ${rows.length} embeddings for ${params.input.length} inputs.`,
      );
    }
    // The API promises order; `index` is honoured when present anyway.
    const out: number[][] = new Array(rows.length);
    rows.forEach((row, i) => {
      const at = typeof row.index === "number" ? row.index : i;
      const vec = row.embedding;
      if (!Array.isArray(vec) || vec.length === 0 || !vec.every((x) => typeof x === "number")) {
        throw new OllamaError("bad_response", "Ollama returned an empty or non-numeric embedding.");
      }
      out[at] = vec as number[];
    });
    return out;
  } finally {
    t.clear();
  }
}

export interface OllamaHealth {
  ok: boolean;
  /** Model tags the daemon holds, e.g. `qwen2.5:3b`, `bge-m3:latest`. */
  models: string[];
  latencyMs: number;
  error?: string;
}

/** `GET /api/tags` — is the daemon up, and what does it hold? Never throws. */
export async function ollamaHealth(opts: OllamaClientOptions, timeoutMs = 5_000): Promise<OllamaHealth> {
  const started = Date.now();
  const url = `${opts.rootUrl}/api/tags`;
  const t = timeoutSignal(timeoutMs);
  try {
    const res = await (opts.fetch ?? fetch)(url, { method: "GET", signal: t.signal });
    if (!res.ok) return { ok: false, models: [], latencyMs: Date.now() - started, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
    const models = (json.models ?? [])
      .map((m) => m.name ?? m.model ?? "")
      .filter((n): n is string => n.length > 0);
    return { ok: true, models, latencyMs: Date.now() - started };
  } catch (err) {
    const e = classifyFetchError(err, t.timedOut(), url);
    return { ok: false, models: [], latencyMs: Date.now() - started, error: `${e.kind}: ${e.message}` };
  } finally {
    t.clear();
  }
}

/** `qwen2.5:3b` is held as `qwen2.5:3b`; `bge-m3` is held as `bge-m3:latest`. */
export function modelIsPresent(models: readonly string[], wanted: string): boolean {
  const want = wanted.includes(":") ? wanted : `${wanted}:latest`;
  return models.some((m) => m === want || m === wanted);
}

// ── AI-SDK adapter ────────────────────────────────────────────────────────────
/**
 * Flatten the SDK's multi-part prompt into OpenAI-shaped chat messages. Only
 * text travels: this application never sends files or tool calls to the
 * assistant model, and the local model has no vision anyway. Anything else
 * is dropped with a warning rather than silently, so a future caller that
 * does send one finds out in the SDK's `warnings` rather than in an answer
 * that ignored half its prompt.
 */
export function toOllamaMessages(prompt: LanguageModelCallOptions["prompt"]): {
  messages: OllamaChatMessage[];
  warnings: Warning[];
} {
  const messages: OllamaChatMessage[] = [];
  const warnings: Warning[] = [];
  for (const message of prompt) {
    switch (message.role) {
      case "system":
        messages.push({ role: "system", content: message.content });
        break;
      case "user":
      case "assistant": {
        const texts: string[] = [];
        for (const part of message.content) {
          if (part.type === "text") texts.push(part.text);
          else warnings.push({ type: "unsupported", feature: `${message.role} ${part.type} part` });
        }
        messages.push({ role: message.role, content: texts.join("") });
        break;
      }
      default:
        warnings.push({ type: "unsupported", feature: `${message.role} message` });
    }
  }
  return { messages, warnings };
}

function unifiedFinish(raw: string | undefined): FinishReason {
  const unified: FinishReason["unified"] =
    raw === "stop" ? "stop" : raw === "length" ? "length" : raw === "tool_calls" ? "tool-calls" : raw === "content_filter" ? "content-filter" : raw ? "other" : "stop";
  return { unified, raw };
}

function sdkUsage(u: OllamaUsage | undefined): Usage {
  return {
    inputTokens: { total: u?.promptTokens, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: u?.completionTokens, text: u?.completionTokens, reasoning: undefined },
    raw: u ? { prompt_tokens: u.promptTokens, completion_tokens: u.completionTokens, total_tokens: u.totalTokens } : undefined,
  } as Usage;
}

function chatParams(modelId: string, options: LanguageModelCallOptions): { params: OllamaChatParams; warnings: Warning[] } {
  const { messages, warnings } = toOllamaMessages(options.prompt);
  if (options.tools?.length) warnings.push({ type: "unsupported", feature: "tools" });
  if (options.responseFormat && options.responseFormat.type !== "text") {
    warnings.push({ type: "unsupported", feature: "responseFormat" });
  }
  return {
    params: {
      model: modelId,
      messages,
      maxTokens: options.maxOutputTokens,
      temperature: options.temperature,
      topP: options.topP,
      stop: options.stopSequences,
      seed: options.seed,
      signal: options.abortSignal,
    },
    warnings,
  };
}

/**
 * A `LanguageModelV3` over the OpenAI-compatible endpoints, so the existing
 * `generateText`/`streamText` calls in lib/ai/router.ts run against the local
 * box unchanged. `providerOptions.google` (thinking budgets) is ignored here —
 * the local model has no such knob — and Gemini keeps honouring it on the
 * fallback path.
 */
export function ollamaLanguageModel(opts: OllamaClientOptions, modelId: string): LanguageModelV3 {
  return {
    specificationVersion: "v3",
    provider: "ollama",
    modelId,
    supportedUrls: {},

    async doGenerate(options) {
      const { params, warnings } = chatParams(modelId, options);
      const result = await ollamaChat(opts, params);
      return {
        content: [{ type: "text", text: result.text }],
        finishReason: unifiedFinish(result.finishReason),
        usage: sdkUsage(result.usage),
        warnings,
        response: { id: result.id, modelId: result.model ?? modelId },
      };
    },

    async doStream(options) {
      const { params, warnings } = chatParams(modelId, options);
      const { chunks } = await ollamaChatStream(opts, params);

      const textId = "0";
      const stream = new ReadableStream<LanguageModelStreamPart>({
        async start(controller) {
          controller.enqueue({ type: "stream-start", warnings });
          let started = false;
          let finish: string | undefined;
          let usage: OllamaUsage | undefined;
          let announced = false;
          try {
            for await (const chunk of chunks) {
              if (!announced && (chunk.id || chunk.model)) {
                announced = true;
                controller.enqueue({ type: "response-metadata", id: chunk.id, modelId: chunk.model ?? modelId });
              }
              if (chunk.delta) {
                if (!started) {
                  started = true;
                  controller.enqueue({ type: "text-start", id: textId });
                }
                controller.enqueue({ type: "text-delta", id: textId, delta: chunk.delta });
              }
              if (chunk.finishReason) finish = chunk.finishReason;
              if (chunk.usage) usage = chunk.usage;
            }
            if (started) controller.enqueue({ type: "text-end", id: textId });
            controller.enqueue({ type: "finish", finishReason: unifiedFinish(finish), usage: sdkUsage(usage) });
          } catch (err) {
            // A stream that died mid-answer. The SDK surfaces the error part
            // to the caller; the text already delivered stays delivered.
            if (started) controller.enqueue({ type: "text-end", id: textId });
            controller.enqueue({ type: "error", error: err });
            controller.enqueue({ type: "finish", finishReason: { unified: "error", raw: undefined }, usage: sdkUsage(usage) });
          } finally {
            controller.close();
          }
        },
      });

      return { stream };
    },
  };
}
