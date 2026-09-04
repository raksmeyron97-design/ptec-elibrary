// lib/ai/response.ts
// The AI service's public contract. Pure types + constructors — no I/O, no
// server-only imports, so route handlers, the router, and tests all agree on
// one shape.
//
// The split that matters: `answer` is prose for a human to read; `results`
// and `sources` are STRUCTURED data for the UI to render as cards. The model
// is never asked to spell out card data in prose (see docs §14).

/** Every request is classified into exactly one of these before any model runs. */
export type AIIntent =
  | "faq"
  | "book_search"
  | "thesis_search"
  | "post_search"
  | "book_detail"
  | "related_books"
  | "author_search"
  | "subject_search"
  | "pdf_question"
  | "resource_summary"
  | "document_compare"
  | "citation"
  | "general_library_question"
  | "general_knowledge"
  | "unsupported";

/** Which model class (if any) the request is routed to. */
export type ModelTier = "none" | "fast" | "reasoning";

/** How long an answer the user actually asked for. */
export type Verbosity = "brief" | "normal" | "detailed";

export type AILocale = "en" | "km";

/** Resource families the assistant can surface. Mirrors the public routes. */
export type ResultKind = "book" | "research" | "post" | "catalog" | "publication" | "path";

/**
 * A card the UI renders. Deliberately narrow: these are the only fields
 * `AskWidget` reads. Adding a field here means adding it to every prompt's
 * token bill, so add it to the UI payload only (see `SearchResult.detail`).
 */
export interface SearchResult {
  slug: string;
  title: string;
  author: string;
  coverUrl: string | null;
  url: string;
  type: ResultKind;
}

/**
 * A grounded citation. Built from retrieval output only — never parsed out of
 * model prose (see lib/ai/citations.ts).
 */
export interface Source {
  title: string;
  author: string;
  /** 1-based PDF page. Absent for metadata-only sources. */
  page?: number;
  url: string;
  /** Short excerpt shown under the citation in the UI. */
  snippet?: string;
  /**
   * Which record this passage came from. Present whenever retrieval knew —
   * it is what lets the UI offer "save this source" and what a citation is
   * verified against, instead of a title string that two editions share.
   */
  recordType?: ResultKind;
  recordId?: string;
  /** APA in-text form for the cited page, e.g. "(Dawson, 2019, p. 42)". */
  citation?: string;
  /** Full APA reference for the work. */
  reference?: string;
}

export type AIMode = "text" | "search_results" | "citations";

/** Per-request measurements. Never contains message content. */
export interface AITelemetry {
  intent: AIIntent;
  modelTier: ModelTier;
  model: string | null;
  locale: AILocale;
  verbosity: Verbosity;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  retrievalMs: number;
  embeddingMs: number;
  cacheHit: boolean;
  dbQueries: number;
  resultCount: number;
  /** True when the answer came from a template rather than a model. */
  deterministic: boolean;
  /** Which retrieval strategy ran (lib/ai/evidence.ts). */
  retrievalMode?: string;
  /** True when retrieval was restricted to one record ("Ask this book"). */
  scoped?: boolean;
  /** Rows the retrieval legs produced before fusion and diversity. */
  candidateCount?: number;
  /** Passages that reached the model. */
  evidenceCount?: number;
  /** Distinct records the evidence drew on. */
  sourceCount?: number;
  /** Citations the answer made that retrieval supports. */
  groundedCitations?: number;
  /** Citations stripped because retrieval did not support them. */
  hallucinatedCitations?: number;
  /** Set when a primary path failed and a degraded path answered instead. */
  fallback?: "keyword" | "no_llm" | "no_embedding" | "cache" | "error";
}

export interface AIResponse {
  mode: AIMode;
  answer: string;
  sources?: Source[];
  results?: SearchResult[];
  intent: AIIntent;
  metadata?: {
    modelTier?: ModelTier;
    locale?: AILocale;
    /** Remaining daily quota; null for admins (unlimited). */
    remaining?: number | null;
    cacheHit?: boolean;
    deterministic?: boolean;
  };
}

export type AIErrorCode =
  | "auth"
  | "quota"
  | "cooldown"
  | "global_limit"
  | "db_error"
  | "unavailable"
  | "duplicate"
  | "bad_request";

export const ERROR_STATUS: Record<AIErrorCode, number> = {
  auth: 401,
  quota: 429,
  cooldown: 429,
  global_limit: 503,
  db_error: 503,
  unavailable: 503,
  duplicate: 400,
  bad_request: 400,
};

export class AIRequestError extends Error {
  constructor(
    readonly code: AIErrorCode,
    readonly detail?: string,
  ) {
    super(detail ?? code);
    this.name = "AIRequestError";
  }
  get status(): number {
    return ERROR_STATUS[this.code];
  }
  toResponse(extra?: Record<string, unknown>): Response {
    return Response.json({ error: this.code, ...(extra ?? {}) }, { status: this.status });
  }
}

export function textResponse(
  answer: string,
  intent: AIIntent,
  metadata?: AIResponse["metadata"],
): AIResponse {
  return { mode: "text", answer, intent, metadata };
}

export function resultsResponse(
  answer: string,
  results: SearchResult[],
  intent: AIIntent,
  metadata?: AIResponse["metadata"],
): AIResponse {
  return { mode: "search_results", answer, results, intent, metadata };
}

export function citationsResponse(
  answer: string,
  sources: Source[],
  results: SearchResult[],
  intent: AIIntent,
  metadata?: AIResponse["metadata"],
): AIResponse {
  return { mode: "citations", answer, sources, results, intent, metadata };
}
