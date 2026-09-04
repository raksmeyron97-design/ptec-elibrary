// lib/ai/router.ts
// The canonical AI request path. Server-only.
//
//   messages → validate → classify → retrieve → (template | model) → grounded response
//
// Two rules govern the whole file:
//
//   1. The model is the LAST resort, not the first step. Every intent that can
//      be answered from the database plus a template is answered that way, and
//      the tier resolver is what decides — not a hand-written branch per route.
//   2. Retrieved text is DATA. It travels in a user-role message inside a
//      labelled fence, never in the system prompt, so an instruction hidden in
//      a scanned PDF page cannot inherit system authority (audit §6).

import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, streamText } from "ai";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { buildSources, usedSources } from "./citations";
import { compressConversation } from "./conversation";
import {
  detectPromptInjection,
  enforceGrounding,
  type InboundMessage,
} from "./guardrails";
import { classifyIntent, type ClassifyContext, type IntentResult } from "./intent";
import {
  getBookDetail,
  getLibraryFact,
  getLibraryOverview,
  getRelatedBooks,
  searchAuthors,
  searchPassages,
  searchSubjects,
  searchWorks,
} from "./retrieval";
import {
  EMPTY_RETRIEVAL,
  TYPES_FOR,
  buildGeneration,
  deterministicAnswer,
  type Plan,
  type RetrievalOutcome,
} from "./plan";
import {
  AIRequestError,
  citationsResponse,
  resultsResponse,
  textResponse,
  type AIResponse,
  type AITelemetry,
} from "./response";
import * as T from "./templates";
import { MAX_PASSAGES, MAX_PASSAGES_DETAILED, estimateTokens } from "./token-budget";

export interface AssistantInput {
  messages: InboundMessage[];
  /** Slug + type of the page the reader is on, when the UI sends it. */
  context?: ClassifyContext;
  /** Forced reply language. Omit to detect from the question. */
  locale?: "en" | "km";
  /** Remaining daily quota, echoed back to the widget. */
  remaining?: number | null;
}

export interface AssistantResult {
  response: AIResponse;
  telemetry: AITelemetry;
}

// ── Stage 1: deterministic resolution ─────────────────────────────────────────
/** Fetch exactly what this intent needs — nothing speculative (§18). */
async function retrieveFor(
  intent: IntentResult,
): Promise<{ retrieval: RetrievalOutcome; facts: string[] }> {
  if (intent.smalltalk) return { retrieval: EMPTY_RETRIEVAL, facts: [] };

  switch (intent.intent) {
    case "unsupported":
    case "general_knowledge":
      return { retrieval: EMPTY_RETRIEVAL, facts: [] };

    case "faq": {
      const fact = await getLibraryFact(intent.topic!, intent.locale);
      intent.factLink = fact.link;
      return {
        retrieval: { ...EMPTY_RETRIEVAL, dbQueries: fact.dbQueries, cacheHit: fact.cacheHit },
        facts: fact.text ? [fact.text] : [],
      };
    }

    case "general_library_question":
      return { retrieval: EMPTY_RETRIEVAL, facts: await getLibraryOverview(intent.locale) };

    case "book_search":
    case "thesis_search":
    case "post_search":
      return {
        retrieval: await searchWorks(intent.query, { types: TYPES_FOR[intent.intent] ?? ["book"] }),
        facts: [],
      };

    case "book_detail":
      return { retrieval: intent.slug ? await getBookDetail(intent.slug) : EMPTY_RETRIEVAL, facts: [] };

    case "related_books":
      return { retrieval: intent.slug ? await getRelatedBooks(intent.slug) : EMPTY_RETRIEVAL, facts: [] };

    case "author_search": {
      const retrieval = await searchAuthors(intent.query);
      return { retrieval, facts: [] };
    }

    case "subject_search": {
      const retrieval = await searchSubjects(intent.query);
      return { retrieval, facts: retrieval.facts };
    }

    case "pdf_question":
      return {
        retrieval: await searchPassages(
          intent.query,
          intent.verbosity === "detailed" ? MAX_PASSAGES_DETAILED : MAX_PASSAGES,
        ),
        facts: [],
      };
  }
}

async function plan(input: AssistantInput): Promise<Plan> {
  const compressed = compressConversation(input.messages);
  const intent = classifyIntent(compressed.current, input.context ?? {});
  if (input.locale) intent.locale = input.locale;

  const { retrieval, facts } = await retrieveFor(intent);
  return {
    intent,
    retrieval,
    facts,
    compressed,
    injection: detectPromptInjection(compressed.current),
    answer: deterministicAnswer(intent, retrieval, facts),
  };
}

// ── Stage 2: model generation (only when stage 1 could not answer) ────────────
function googleModel(id: string) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new AIRequestError("unavailable", "GEMINI_API_KEY is not configured.");
  return createGoogleGenerativeAI({ apiKey })(id);
}

// ── Public entry points ───────────────────────────────────────────────────────

/**
 * Non-streaming assistant run. Returns the typed response plus the telemetry
 * the caller should record.
 */
export async function runAssistant(
  input: AssistantInput,
  prepared?: { plan: Plan; started: number },
): Promise<AssistantResult> {
  const started = prepared?.started ?? Date.now();
  const p = prepared?.plan ?? (await plan(input));
  const { intent, retrieval } = p;

  const sources = buildSources(retrieval.passages);
  const baseTelemetry = (): AITelemetry => ({
    intent: intent.intent,
    modelTier: "none",
    model: null,
    locale: intent.locale,
    verbosity: intent.verbosity,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    latencyMs: Date.now() - started,
    retrievalMs: retrieval.retrievalMs,
    embeddingMs: retrieval.embeddingMs,
    cacheHit: retrieval.cacheHit,
    dbQueries: retrieval.dbQueries,
    resultCount: retrieval.results.length,
    deterministic: true,
    fallback: retrieval.fallback,
  });

  // ── Zero-LLM path ───────────────────────────────────────────────────────────
  if (p.answer !== undefined) {
    const metadata = {
      modelTier: "none" as const,
      locale: intent.locale,
      remaining: input.remaining ?? null,
      cacheHit: retrieval.cacheHit,
      deterministic: true,
    };
    const response = retrieval.results.length
      ? resultsResponse(p.answer, retrieval.results, intent.intent, metadata)
      : textResponse(p.answer, intent.intent, metadata);
    return { response, telemetry: { ...baseTelemetry(), fallback: retrieval.fallback ?? "no_llm" } };
  }

  // ── Model path ──────────────────────────────────────────────────────────────
  const org = await getOrgIdentity();
  const gen = buildGeneration(p, org);
  const inputTokens =
    estimateTokens(gen.system) +
    gen.messages.reduce((s, m) => s + estimateTokens(typeof m.content === "string" ? m.content : ""), 0);

  try {
    const result = await generateText({
      model: googleModel(gen.model),
      system: gen.system,
      messages: gen.messages,
      maxOutputTokens: gen.maxOutputTokens,
      providerOptions: { google: { thinkingConfig: { thinkingBudget: gen.thinkingBudget } } },
    });

    const grounded = enforceGrounding(result.text ?? "", sources);
    const answer = grounded.answer.trim() || T.noEvidence(intent.locale);
    const cited = usedSources(answer, sources);

    const usage = result.usage;
    const telemetry: AITelemetry = {
      ...baseTelemetry(),
      modelTier: gen.thinkingBudget > 0 ? "reasoning" : "fast",
      model: gen.model,
      inputTokens: usage?.inputTokens ?? inputTokens,
      outputTokens: usage?.outputTokens ?? estimateTokens(answer),
      totalTokens:
        usage?.totalTokens ?? (usage?.inputTokens ?? inputTokens) + (usage?.outputTokens ?? estimateTokens(answer)),
      latencyMs: Date.now() - started,
      deterministic: false,
    };

    const metadata = {
      modelTier: telemetry.modelTier,
      locale: intent.locale,
      remaining: input.remaining ?? null,
      cacheHit: retrieval.cacheHit,
      deterministic: false,
    };

    const response = cited.length
      ? citationsResponse(answer, cited, retrieval.results, intent.intent, metadata)
      : retrieval.results.length
        ? resultsResponse(answer, retrieval.results, intent.intent, metadata)
        : textResponse(answer, intent.intent, metadata);

    return { response, telemetry };
  } catch (err) {
    // §26: the model failing must not take the library search down with it.
    console.error("[ai/router] generation failed:", err instanceof Error ? err.message : err);
    if (retrieval.results.length === 0) throw new AIRequestError("unavailable");

    const answer = `${T.degraded(intent.locale)} ${T.foundResults(retrieval.results, intent.query, intent.locale)}`;
    return {
      response: resultsResponse(answer, retrieval.results, intent.intent, {
        modelTier: "none",
        locale: intent.locale,
        remaining: input.remaining ?? null,
        deterministic: true,
      }),
      telemetry: { ...baseTelemetry(), fallback: "error", latencyMs: Date.now() - started },
    };
  }
}

/**
 * Streaming variant for the chat surface. Deterministic answers are short
 * enough that streaming them adds latency rather than removing it, so this
 * reports `streamed: false` and hands back the finished response — the caller
 * decides how to deliver it (§20).
 */
export type StreamPlan =
  | { streamed: false; result: AssistantResult }
  | {
      streamed: true;
      stream: ReturnType<typeof streamText>;
      telemetry: AITelemetry;
      /** Sources the answer is allowed to cite, for post-stream grounding. */
      sources: ReturnType<typeof buildSources>;
      results: AIResponse["results"];
    };

export async function streamAssistant(input: AssistantInput): Promise<StreamPlan> {
  const started = Date.now();
  const p = await plan(input);
  const { intent, retrieval } = p;

  // A deterministic answer is a sentence or two — streaming it would add a
  // round-trip to save nothing (§20). Hand it back finished.
  if (p.answer !== undefined) {
    return { streamed: false, result: await runAssistant(input, { plan: p, started }) };
  }

  const org = await getOrgIdentity();
  const gen = buildGeneration(p, org);
  const sources = buildSources(retrieval.passages);
  const inputTokens =
    estimateTokens(gen.system) +
    gen.messages.reduce((s, m) => s + estimateTokens(typeof m.content === "string" ? m.content : ""), 0);

  const stream = streamText({
    model: googleModel(gen.model),
    system: gen.system,
    messages: gen.messages,
    maxOutputTokens: gen.maxOutputTokens,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: gen.thinkingBudget } } },
  });

  return {
    streamed: true,
    stream,
    sources,
    results: retrieval.results,
    telemetry: {
      intent: intent.intent,
      modelTier: gen.thinkingBudget > 0 ? "reasoning" : "fast",
      model: gen.model,
      locale: intent.locale,
      verbosity: intent.verbosity,
      inputTokens,
      outputTokens: 0,
      totalTokens: inputTokens,
      latencyMs: Date.now() - started,
      retrievalMs: retrieval.retrievalMs,
      embeddingMs: retrieval.embeddingMs,
      cacheHit: retrieval.cacheHit,
      dbQueries: retrieval.dbQueries,
      resultCount: retrieval.results.length,
      deterministic: false,
      fallback: retrieval.fallback,
    },
  };
}
