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

import { generateText, streamText, type LanguageModel } from "ai";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { buildSources } from "./citations";
import { compressConversation } from "./conversation";
import {
  detectPromptInjection,
  enforceGrounding,
  sourcesCited,
  type InboundMessage,
} from "./guardrails";
import { classifyIntent, type ClassifyContext, type IntentResult } from "./intent";
import {
  findRecordByTitle,
  getBookDetail,
  getLibraryFact,
  getLibraryOverview,
  getRelatedBooks,
  resolveRecord,
  retrieveComparison,
  retrieveConceptComparison,
  retrieveEvidence,
  searchAuthors,
  searchPassages,
  searchSubjects,
  searchWorks,
  type ResolvedRecord,
} from "./retrieval";
import { attachReferences, getCitationSource } from "./citation-source";
import { isMockProvider, mockModel } from "./mock-model";
import { getAIProvider, type ProviderTrace } from "./provider";
import { sourceCount, type EvidenceRecordType } from "./evidence";
import {
  EMPTY_RETRIEVAL,
  TYPES_FOR,
  buildGeneration,
  deterministicAnswer,
  retrievalModeFor,
  type GenerationInput,
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
  type ResultKind,
} from "./response";
import * as T from "./templates";
import { MAX_PASSAGES_DETAILED, estimateTokens } from "./token-budget";
import { buildTrace, type AITrace } from "./trace";

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
  /**
   * The explainable chain behind this answer (lib/ai/trace.ts). For the
   * benchmark and for `AI_TRACE=1` server debugging — never sent to the
   * client, never written to app_events.
   */
  trace: AITrace;
}

/** Print the trace to the server log when explicitly asked for. Debug only. */
function emitTrace(trace: AITrace): void {
  if (process.env.AI_TRACE !== "1") return;
  console.log("[ai/trace]", JSON.stringify(trace));
}

// ── Stage 1: deterministic resolution ─────────────────────────────────────────
/** Fetch exactly what this intent needs — nothing speculative (§18). */
async function retrieveFor(
  intent: IntentResult,
): Promise<{ retrieval: RetrievalOutcome; facts: string[] }> {
  if (intent.smalltalk) return { retrieval: EMPTY_RETRIEVAL, facts: [] };

  switch (intent.intent) {
    case "unsupported":
      return { retrieval: EMPTY_RETRIEVAL, facts: [] };

    case "general_knowledge":
      // ASK THE COLLECTION BEFORE DECLARING IT HAS NOTHING.
      // (The frame travels so a definition question ranks defining pages first.)
      //
      // This is the catch-all — a question that matched no keyword table — and
      // it used to retrieve nothing and then tell the model to say the answer
      // "is not from the library's collection". For a bare topical question,
      // which is the most natural way a student asks one, that was simply
      // false: measured with scripts/ai-answer-benchmark.ts against
      // production, all twelve "What is <topic>?" questions landed here and
      // were disclaimed as outside the catalogue, while every one of those
      // topics has pages in six or more books on the shelf.
      //
      // The evidence decides instead of the keyword table. When passages come
      // back the answer is grounded and cited like any other document question
      // (lib/ai/prompts.ts picks the rider from the evidence, not the label);
      // when none do, the reader gets exactly the general-knowledge answer with
      // the disclaimer they get today. `retrieveEvidence` already refuses to
      // invent evidence for a subject the library does not hold — that is the
      // no-evidence guarantee the retrieval benchmark measures at 100%.
      //
      // Cost: one embedding and two queries, on a path that was already paying
      // for a model call. It does not add a model call to anything.
      return { retrieval: await searchPassages(intent.query, undefined, intent.parsed?.frame), facts: [] };

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
        retrieval: await searchWorks(intent.query, {
          types: TYPES_FOR[intent.intent] ?? ["book"],
          // The work the question named, resolved exactly and first; an ISBN
          // is identity outright (lib/ai/entity.ts).
          entity: intent.parsed?.titleCandidates[0],
          isbn: intent.parsed?.isbnCandidates[0],
        }),
        facts: [],
      };

    case "book_detail":
      return { retrieval: intent.slug ? await getBookDetail(intent.slug) : EMPTY_RETRIEVAL, facts: [] };

    case "related_books":
      return { retrieval: intent.slug ? await getRelatedBooks(intent.slug) : EMPTY_RETRIEVAL, facts: [] };

    case "author_search": {
      // "Who wrote X" is about the work X: resolve the title first, and only
      // then ask the person directory.
      const retrieval = await searchAuthors(intent.query, {
        preferTitle: intent.parsed?.frame === "author_lookup",
      });
      return { retrieval, facts: [] };
    }

    case "subject_search": {
      const retrieval = await searchSubjects(intent.query);
      return { retrieval, facts: retrieval.facts };
    }

    case "citation": {
      // The record the reader is on, or the work their words name. Either
      // way the reference is assembled from catalogue fields, never written.
      const record = await resolveIntentRecord(intent);
      if (!record) return { retrieval: EMPTY_RETRIEVAL, facts: [] };
      const source = await getCitationSource(record.recordType, record.recordId);
      if (!source) return { retrieval: EMPTY_RETRIEVAL, facts: [] };
      return {
        retrieval: {
          ...EMPTY_RETRIEVAL,
          dbQueries: 2,
          results: [
            {
              slug: record.slug,
              title: record.title,
              author: record.author,
              coverUrl: null,
              url: record.url,
              type: RESULT_KIND[record.recordType],
            },
          ],
          citation: {
            title: source.title,
            reference: source.reference,
            url: source.url,
            page: intent.page,
          },
        },
        facts: [],
      };
    }

    case "resource_summary": {
      const record = await resolveIntentRecord(intent);
      if (!record) return { retrieval: EMPTY_RETRIEVAL, facts: [] };
      const retrieval = await retrieveEvidence({
        query: intent.query || record.title,
        mode: "summary",
        scope: { recordType: record.recordType, recordId: record.recordId },
      });
      // The record's own card and abstract travel with the evidence: when the
      // document turns out to have no indexed text, the deterministic answer
      // falls back to them rather than to silence.
      const detail = await getBookDetailFor(record);
      return {
        retrieval: {
          ...retrieval,
          results: retrieval.results.length ? retrieval.results : detail.results,
          works: detail.works.length ? detail.works : retrieval.works,
        },
        facts: [],
      };
    }

    case "document_compare": {
      const targets = intent.compareTargets ?? [];
      const resolved = (await Promise.all(targets.map((t) => findRecordByTitle(t)))).filter(
        (r): r is NonNullable<typeof r> => r !== null,
      );
      if (resolved.length < 2) {
        // Not two WORKS. When the two sides are concepts ("the difference
        // between validity and reliability") each is retrieved on its own and
        // the answer compares the evidence; when a named work simply could
        // not be found, falling back to a corpus search would answer a
        // different question, so the answer says what happened.
        const sides = intent.parsed?.compareTargets ?? [];
        if (sides.length === 2 && resolved.length === 0) {
          const retrieval = await retrieveConceptComparison(sides);
          return { retrieval, facts: retrieval.passages.length ? [T.conceptCompareLead(sides, intent.locale)] : [] };
        }
        return { retrieval: EMPTY_RETRIEVAL, facts: [] };
      }
      const retrieval = await retrieveComparison(intent.query, resolved);
      const covered = new Set(retrieval.evidence.map((e) => e.recordId));
      const missing = resolved.filter((r) => !covered.has(r.recordId));
      return {
        retrieval: {
          ...retrieval,
          missingDocuments: missing.map((r) => r.title),
        },
        // A document with no passages is stated as a fact the model must
        // repeat, not left for it to infer agreement from.
        facts: missing.map((r) => T.compareMissing(r.title, intent.locale)),
      };
    }

    case "pdf_question": {
      // Asked from a resource page, the question is about THAT document.
      // Before this, the slug was used to classify the intent and then
      // thrown away, so "what does this book say about X" searched the whole
      // library and could return at most one page of the book in hand.
      // A question that NAMES its source ("According to X, what is Y") is
      // scoped to X the same way once X resolves; if it does not, the
      // collection is searched and the answer says nothing about X.
      const scopeTitle = intent.parsed?.scopeTitle;
      const record = intent.slug
        ? await resolveIntentRecord(intent)
        : scopeTitle
          ? await findRecordByTitle(scopeTitle)
          : null;
      if (record) {
        return {
          retrieval: await retrieveEvidence({
            query: intent.query,
            mode: "scoped",
            scope: { recordType: record.recordType, recordId: record.recordId },
            frame: intent.parsed?.frame,
          }),
          facts: [],
        };
      }
      return {
        // Depth is the MODE's to decide (EVIDENCE_LIMITS.hybrid); an explicitly
        // deep question buys a little more on top of it.
        retrieval: await searchPassages(
          intent.query,
          intent.verbosity === "detailed" ? MAX_PASSAGES_DETAILED : undefined,
          intent.parsed?.frame,
        ),
        facts: [],
      };
    }
  }
}

const RESULT_KIND: Record<EvidenceRecordType, ResultKind> = {
  book: "book",
  research: "research",
  publication: "publication",
};

/**
 * The record a request is about: the page the reader is on when the UI sent
 * one, otherwise the work their words name. Returns null rather than guessing
 * — a scoped answer about the wrong document is worse than no answer.
 */
async function resolveIntentRecord(intent: IntentResult): Promise<ResolvedRecord | null> {
  if (intent.slug) {
    const bySlug = await resolveRecord(intent.slugType ?? "book", intent.slug);
    if (bySlug) return bySlug;
  }
  return intent.query ? findRecordByTitle(intent.query) : null;
}

/** The record's catalogue card, for a summary that has no indexed text. */
async function getBookDetailFor(record: ResolvedRecord): Promise<RetrievalOutcome> {
  if (record.recordType === "book") return getBookDetail(record.slug);
  return {
    ...EMPTY_RETRIEVAL,
    results: [
      {
        slug: record.slug,
        title: record.title,
        author: record.author,
        coverUrl: null,
        url: record.url,
        type: RESULT_KIND[record.recordType],
      },
    ],
  };
}

async function plan(input: AssistantInput): Promise<Plan> {
  const compressed = compressConversation(input.messages);
  const intent = classifyIntent(compressed.current, input.context ?? {});
  if (input.locale) intent.locale = input.locale;

  const { retrieval, facts } = await retrieveFor(intent);
  return {
    intent,
    retrieval,
    mode: retrievalModeFor(intent),
    facts,
    compressed,
    injection: detectPromptInjection(compressed.current),
    answer: deterministicAnswer(intent, retrieval, facts),
  };
}

// ── Stage 2: model generation (only when stage 1 could not answer) ────────────
/**
 * The model for this generation, and a trace of who actually answered.
 * lib/ai/provider.ts decides between the local Ollama box and Gemini and
 * owns the fallback; this file never names a provider.
 */
function assistantModel(gen: GenerationInput): { model: LanguageModel; trace: ProviderTrace } {
  // The e2e seam. Gated on an env flag that production never sets, so the
  // assistant's surfaces are testable in CI (which has no key) without any
  // test reaching a billed provider. See lib/ai/mock-model.ts.
  if (isMockProvider()) {
    return { model: mockModel(), trace: { provider: "mock", modelId: "mock", fellBack: false, primarySkipped: false } };
  }
  return getAIProvider().languageModel({
    tier: gen.thinkingBudget > 0 ? "reasoning" : "fast",
    geminiModelId: gen.model,
  });
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
    retrievalMode: p.mode ?? "lookup",
    scoped: p.mode === "scoped",
    candidateCount: retrieval.candidateCount ?? 0,
    evidenceCount: retrieval.passages.length,
    sourceCount: sourceCount(retrieval.evidence ?? []),
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
    // A deterministic answer can still carry evidence — a scoped question the
    // template declined to answer, or a citation intent. When it does, the
    // sources travel with it so the reader can open the page it came from.
    const deterministicSources = sources.length ? await attachReferences(sources) : sources;
    const response = deterministicSources.length
      ? citationsResponse(p.answer, deterministicSources, retrieval.results, intent.intent, metadata)
      : retrieval.results.length
        ? resultsResponse(p.answer, retrieval.results, intent.intent, metadata)
        : textResponse(p.answer, intent.intent, metadata);
    const telemetry: AITelemetry = { ...baseTelemetry(), fallback: retrieval.fallback ?? "no_llm" };
    const trace = buildTrace(p, response, telemetry, { inputTokens: 0, grounded: 0, hallucinated: 0, quoted: 0 });
    emitTrace(trace);
    return { response, telemetry, trace };
  }

  // ── Model path ──────────────────────────────────────────────────────────────
  const org = await getOrgIdentity();
  const gen = buildGeneration(p, org);
  const inputTokens =
    estimateTokens(gen.system) +
    gen.messages.reduce((s, m) => s + estimateTokens(typeof m.content === "string" ? m.content : ""), 0);

  const { model, trace } = assistantModel(gen);
  try {
    const result = await generateText({
      model,
      system: gen.system,
      messages: gen.messages,
      maxOutputTokens: gen.maxOutputTokens,
      providerOptions: { google: { thinkingConfig: { thinkingBudget: gen.thinkingBudget } } },
    });

    const grounded = enforceGrounding(result.text ?? "", sources, retrieval.passages.map((x) => x.text));
    const answer = grounded.answer.trim() || T.noEvidence(intent.locale);
    // The sources to attach are the ones grounding VERIFIED, not the ones a
    // second scan of the prose happens to recognise.
    const cited = sourcesCited(grounded.grounded, sources);

    const usage = result.usage;
    const telemetry: AITelemetry = {
      ...baseTelemetry(),
      modelTier: gen.thinkingBudget > 0 ? "reasoning" : "fast",
      model: trace.modelId,
      provider: trace.provider,
      providerFallback: trace.fellBack,
      inputTokens: usage?.inputTokens ?? inputTokens,
      outputTokens: usage?.outputTokens ?? estimateTokens(answer),
      totalTokens:
        usage?.totalTokens ?? (usage?.inputTokens ?? inputTokens) + (usage?.outputTokens ?? estimateTokens(answer)),
      latencyMs: Date.now() - started,
      deterministic: false,
      groundedCitations: grounded.grounded.length,
      hallucinatedCitations: grounded.hallucinated.length,
      quotedCitations: grounded.quoted.length,
    };

    const metadata = {
      modelTier: telemetry.modelTier,
      locale: intent.locale,
      remaining: input.remaining ?? null,
      cacheHit: retrieval.cacheHit,
      deterministic: false,
    };

    // References are fetched only for the sources that survived grounding —
    // a hallucinated citation never triggers a lookup.
    const withReferences = cited.length ? await attachReferences(cited) : cited;

    const response = withReferences.length
      ? citationsResponse(answer, withReferences, retrieval.results, intent.intent, metadata)
      : retrieval.results.length
        ? resultsResponse(answer, retrieval.results, intent.intent, metadata)
        : textResponse(answer, intent.intent, metadata);

    const chain = buildTrace(p, response, telemetry, {
      inputTokens,
      grounded: grounded.grounded.length,
      hallucinated: grounded.hallucinated.length,
      quoted: grounded.quoted.length,
      removed: [...grounded.hallucinated, ...grounded.quoted].map((c) => c.raw),
    });
    emitTrace(chain);
    return { response, telemetry, trace: chain };
  } catch (err) {
    // §26: the model failing must not take the library search down with it.
    console.error("[ai/router] generation failed:", err instanceof Error ? err.message : err);
    if (retrieval.results.length === 0) throw new AIRequestError("unavailable");

    const answer = `${T.degraded(intent.locale)} ${T.foundResults(retrieval.results, intent.query, intent.locale)}`;
    const response = resultsResponse(answer, retrieval.results, intent.intent, {
      modelTier: "none",
      locale: intent.locale,
      remaining: input.remaining ?? null,
      deterministic: true,
    });
    const telemetry: AITelemetry = {
      ...baseTelemetry(),
      fallback: "error",
      provider: trace.provider,
      providerFallback: trace.fellBack,
      latencyMs: Date.now() - started,
    };
    return {
      response,
      telemetry,
      trace: buildTrace(p, response, telemetry, { inputTokens, grounded: 0, hallucinated: 0, quoted: 0 }),
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
      /**
       * Who is answering. Read it AFTER the stream has finished: the local
       * provider may have handed the request to Gemini before the first byte,
       * and only then does the trace say so.
       */
      trace: ProviderTrace;
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

  const { model, trace } = assistantModel(gen);
  const stream = streamText({
    model,
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
    trace,
    telemetry: {
      intent: intent.intent,
      modelTier: gen.thinkingBudget > 0 ? "reasoning" : "fast",
      model: trace.modelId,
      provider: trace.provider,
      providerFallback: trace.fellBack,
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
      retrievalMode: p.mode ?? "lookup",
      scoped: p.mode === "scoped",
      candidateCount: retrieval.candidateCount ?? 0,
      evidenceCount: retrieval.passages.length,
      sourceCount: sourceCount(retrieval.evidence ?? []),
    },
  };
}
