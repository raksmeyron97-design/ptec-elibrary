// lib/ai/telemetry.ts
// AI observability. Writes one `app_events` row per request with the fields an
// admin dashboard needs to answer "what is this costing us and is it working".
//
// Privacy: `detail` carries only counts, codes and enums — never the question,
// never an answer, never a title or slug. That constraint is inherited from
// logAppEvent's own contract and is the reason intent/model/tier are enums.

import "server-only";

import { logAppEvent } from "@/lib/analytics/events";
import { allCacheStats } from "./cache";
import type { AITelemetry } from "./response";

/** Route label recorded on every AI event. */
export type AIRoute = "/api/ai" | "/api/ask" | "/api/chat" | "/api/search";

/**
 * The data contract an admin AI-performance dashboard reads. Every field here
 * is derivable from the `app_events` rows this module writes:
 *
 *   avg tokens/request   avg(detail->>'total_tokens')            where kind='ai_request'
 *   avg latency          avg(latency_ms)
 *   cost/request         avg(total_tokens) x per-1M model price  grouped by detail->>'model'
 *   cache hit rate       count(detail->>'cache'='hit') / count(*)
 *   RAG success rate     count(intent='pdf_question' and result_count>0) / count(intent='pdf_question')
 *   fallback rate        count(detail ? 'fallback') / count(*)
 *   no-result rate       count(detail->>'result_count'='0') / count(*)
 *   zero-LLM rate        count(detail->>'tier'='none') / count(*)
 */
export interface AIPerformanceContract {
  avgTokensPerRequest: number;
  avgLatencyMs: number;
  costPerRequestUsd: number;
  cacheHitRate: number;
  ragSuccessRate: number;
  fallbackRate: number;
  noResultRate: number;
  zeroLlmRate: number;
}

export function recordAiRequest(
  route: AIRoute,
  status: "ok" | "error" | "quota" | "timeout" | "fallback",
  t: Partial<AITelemetry> & { intent: AITelemetry["intent"] },
): void {
  const detail: Record<string, string | number | boolean> = {
    intent: t.intent,
    tier: t.modelTier ?? "none",
    model: t.model ?? "none",
    locale: t.locale ?? "en",
    verbosity: t.verbosity ?? "normal",
    input_tokens: t.inputTokens ?? 0,
    output_tokens: t.outputTokens ?? 0,
    total_tokens: t.totalTokens ?? (t.inputTokens ?? 0) + (t.outputTokens ?? 0),
    retrieval_ms: Math.round(t.retrievalMs ?? 0),
    embedding_ms: Math.round(t.embeddingMs ?? 0),
    db_queries: t.dbQueries ?? 0,
    result_count: t.resultCount ?? 0,
    cache: t.cacheHit ? "hit" : "miss",
    deterministic: t.deterministic ?? false,
    // Retrieval shape and grounding outcome. Counts and enums only — never the
    // question, the passage or a title. `hallucinated_citations` rising is the
    // signal that grounding is doing more work than it should, and it was
    // previously invisible: the streamed path could only overload
    // `fallback: "error"` to hint at it.
    retrieval_mode: t.retrievalMode ?? "lookup",
    scoped: t.scoped ?? false,
    candidate_count: t.candidateCount ?? 0,
    evidence_count: t.evidenceCount ?? 0,
    source_count: t.sourceCount ?? 0,
    grounded_citations: t.groundedCitations ?? 0,
    hallucinated_citations: t.hallucinatedCitations ?? 0,
  };
  if (t.fallback) detail.fallback = t.fallback;

  logAppEvent({ kind: "ai_request", status, route, latencyMs: t.latencyMs, detail });
}

/** In-process cache counters, for a health/debug endpoint. */
export function cacheSnapshot(): Record<string, unknown> {
  return allCacheStats();
}
