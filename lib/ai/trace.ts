// lib/ai/trace.ts
// The explainable record of ONE assistant request: what the question was read
// as, which intent and strategy answered it, every passage that was selected
// and why, what reached the prompt, and how the citations were judged. Pure.
//
// WHY. Every stage of the pipeline already made a decision; none of them wrote
// it down anywhere a person debugging a bad answer could read it. The
// benchmark's failure attribution (lib/ai/answer-failure.ts) had to infer the
// chain from counts. This is the chain itself, in one object, built after the
// answer from data the router already holds — it adds no query and no model
// call.
//
// WHERE IT GOES. Onto `AssistantResult.trace`, for the benchmark and for
// server-side debugging behind `AI_TRACE=1`. It is NEVER part of the HTTP
// response and NEVER written to `app_events`: it carries titles, record ids
// and the question's topic, and lib/ai/telemetry.ts's contract is counts and
// enums only. If production volume ever warrants persisting traces, sample
// them and strip the question first.

import type { RetrievedEvidence } from "./evidence";
import type { IntentResult } from "./intent";
import type { Plan, RetrievalOutcome } from "./plan";
import type { AIResponse, AITelemetry } from "./response";

export interface TraceEvidence {
  recordType: string;
  recordId: string;
  title: string;
  page: number;
  pageEnd?: number;
  matchType: string;
  /** Fused + boosted rank score, comparable only within this request. */
  score: number;
  signals?: RetrievedEvidence["signals"];
  /** Which side of a comparison, when the request was one. */
  label?: string;
}

export interface AITrace {
  question: {
    language: string;
    frame: string;
    topic: string;
    titleCandidates: string[];
    isbnCandidates: string[];
    compareTargets: string[];
    exactEntityRequired: boolean;
    requiresEvidence: boolean;
  };
  routing: {
    intent: string;
    confidence: number;
    mode: string;
    deterministic: boolean;
    scoped: boolean;
  };
  retrieval: {
    /** Human-readable name of the path that ran. */
    strategy: string;
    candidateCount: number;
    semanticAvailable: boolean | null;
    entity: RetrievalOutcome["entity"] | null;
    hub: RetrievalOutcome["hub"] | null;
    dbQueries: number;
    retrievalMs: number;
    embeddingMs: number;
    cacheHit: boolean;
    fallback: string | null;
  };
  evidence: TraceEvidence[];
  context: {
    passages: number;
    works: number;
    facts: number;
    /** Estimated input tokens for the whole prompt (0 on a template path). */
    inputTokens: number;
  };
  policy: {
    locale: string;
    verbosity: string;
    hasEvidence: boolean;
    injectionNoticed: boolean;
  };
  citations: {
    grounded: number;
    hallucinated: number;
    quoted: number;
    attached: number;
    /** The citation strings grounding removed, verbatim — what the model wrote that no passage supports. */
    removed: string[];
  };
  outcome: {
    answerClass: "template" | "generated" | "refusal";
    answerChars: number;
    provider: string | null;
    model: string | null;
    latencyMs: number;
  };
}

function strategyOf(intent: IntentResult, plan: Plan): string {
  const mode = plan.mode ?? "lookup";
  if (intent.smalltalk) return "template:greeting";
  if (plan.retrieval.entity?.via === "isbn") return "catalogue:isbn";
  if (plan.retrieval.entity) return `catalogue:title-resolved(${plan.retrieval.entity.band})`;
  if (plan.retrieval.hub) return `hub:${plan.retrieval.hub.kind}`;
  if (intent.intent === "document_compare") {
    return plan.retrieval.evidence?.some((e) => e.conceptLabel) ? "evidence:concept-comparison" : "evidence:document-comparison";
  }
  if (mode === "lookup" || mode === "citation") return `${mode}:${intent.intent}`;
  return `evidence:${mode}`;
}

/** Deterministic refusal markers, so the outcome class is decided the same way everywhere. */
const REFUSAL = /couldn’t find|couldn't find|could not find|រកមិនឃើញ|មិនគ្រប់គ្រាន់|not enough indexed text/i;

export function buildTrace(
  plan: Plan,
  response: AIResponse,
  telemetry: AITelemetry,
  extra: { inputTokens: number; grounded: number; hallucinated: number; quoted: number; removed?: string[] },
): AITrace {
  const { intent, retrieval } = plan;
  const parsed = intent.parsed;
  const evidence: TraceEvidence[] = (retrieval.evidence ?? []).map((e) => ({
    recordType: e.recordType,
    recordId: e.recordId,
    title: e.title,
    page: e.page,
    pageEnd: e.pageEnd,
    matchType: e.matchType,
    score: e.score,
    signals: e.signals,
    label: e.documentLabel ?? e.conceptLabel,
  }));
  const answer = response.answer ?? "";
  return {
    question: {
      language: parsed?.language ?? intent.locale,
      frame: parsed?.frame ?? "none",
      topic: intent.query,
      titleCandidates: parsed?.titleCandidates ?? [],
      isbnCandidates: parsed?.isbnCandidates ?? [],
      compareTargets: parsed?.compareTargets ?? intent.compareTargets ?? [],
      exactEntityRequired: parsed?.exactEntityRequired ?? false,
      requiresEvidence: parsed?.requiresEvidence ?? false,
    },
    routing: {
      intent: intent.intent,
      confidence: intent.confidence,
      mode: plan.mode ?? "lookup",
      deterministic: telemetry.deterministic,
      scoped: plan.mode === "scoped",
    },
    retrieval: {
      strategy: strategyOf(intent, plan),
      candidateCount: retrieval.candidateCount ?? 0,
      semanticAvailable: retrieval.semanticAvailable ?? null,
      entity: retrieval.entity ?? null,
      hub: retrieval.hub ?? null,
      dbQueries: retrieval.dbQueries,
      retrievalMs: retrieval.retrievalMs,
      embeddingMs: retrieval.embeddingMs,
      cacheHit: retrieval.cacheHit,
      fallback: retrieval.fallback ?? null,
    },
    evidence,
    context: {
      passages: retrieval.passages.length,
      works: retrieval.works.length,
      facts: plan.facts.length,
      inputTokens: extra.inputTokens,
    },
    policy: {
      locale: intent.locale,
      verbosity: intent.verbosity,
      hasEvidence: retrieval.passages.length > 0,
      injectionNoticed: plan.injection,
    },
    citations: {
      grounded: extra.grounded,
      hallucinated: extra.hallucinated,
      quoted: extra.quoted,
      attached: response.sources?.length ?? 0,
      removed: extra.removed ?? [],
    },
    outcome: {
      answerClass: REFUSAL.test(answer) ? "refusal" : telemetry.deterministic ? "template" : "generated",
      answerChars: answer.length,
      provider: telemetry.provider ?? null,
      model: telemetry.model ?? null,
      latencyMs: telemetry.latencyMs,
    },
  };
}
