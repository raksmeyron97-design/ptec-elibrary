// lib/ai/plan.ts
// The decision layer: what a request may answer without a model, and exactly
// what prompt a model gets when one is needed. PURE — no I/O, no `server-only`.
//
// Split out of router.ts on purpose. `deterministicAnswer` is the single most
// cost-relevant decision the system makes and `buildGeneration` is where the
// token bill is set, so scripts/ai-benchmark.ts and the unit tests measure
// THESE functions rather than a re-implementation that could drift from them.

import type { ModelMessage } from "ai";
import { buildContext, type CompactWork } from "./context";
import type { compressConversation } from "./conversation";
import { CONFIDENT, type IntentResult } from "./intent";
import { modelIdFor, resolveTier, thinkingBudgetFor } from "./models";
import { INJECTION_NOTICE, buildSystemPrompt, type PromptOrg } from "./prompts";
import * as T from "./templates";
import type { RetrievedPassage } from "./citations";
import {
  EVIDENCE_LIMITS,
  contextCeilingFor,
  type RetrievalMode,
  type RetrievedEvidence,
} from "./evidence";
import type { AIIntent, ResultKind, SearchResult } from "./response";
import {
  MAX_CONTEXT_TOKENS,
  MAX_EVIDENCE_TOKENS,
  MAX_OUTPUT_TOKENS,
  SEARCH_FORMAT_OUTPUT_TOKENS,
  estimateTokens,
} from "./token-budget";

/** Everything one retrieval step produced, plus what it cost. */
export interface RetrievalOutcome {
  /** Cards for the UI. */
  results: SearchResult[];
  /** The same items, reduced to what a model needs to talk about them. */
  works: CompactWork[];
  /** Page-level evidence, ranked. Empty unless the intent needed it. */
  passages: RetrievedPassage[];
  /**
   * The same passages with their provenance (record type + id, match type).
   * Set by `retrieveEvidence`; absent on the legacy paths that only ever had
   * a title and a page. Citations are built from THIS when it is present, so
   * a source can be saved and verified by identity rather than by title text.
   */
  evidence?: RetrievedEvidence[];
  /** Library facts already resolved to display strings. */
  facts: string[];
  /** The directory page a discovery intent resolved to (author or subject). */
  hub?: { kind: "author" | "subject"; name: string; url: string; count: number };
  /** A finished reference, built from catalogue metadata — never by a model. */
  citation?: { title: string; reference: string; url: string; page?: number };
  /** Documents a comparison found no evidence in, by title. */
  missingDocuments?: string[];
  dbQueries: number;
  embeddingMs: number;
  retrievalMs: number;
  cacheHit: boolean;
  /** Set when the primary strategy failed and a degraded one answered. */
  fallback?: "keyword" | "no_embedding" | "cache" | "no_llm" | "error";
}

/** Which collections each search intent draws from. */
export const TYPES_FOR: Partial<Record<AIIntent, ResultKind[]>> = {
  book_search: ["book"],
  thesis_search: ["research"],
  post_search: ["post"],
};

/**
 * How a question should be answered, decided before anything expensive runs.
 *
 * Pure and exported so the mode a request takes is a property of the QUESTION,
 * not of whichever branch of the router happened to run — the retrieval
 * benchmark drives this function directly.
 */
export function retrievalModeFor(intent: IntentResult): RetrievalMode {
  switch (intent.intent) {
    case "citation":
      return "citation";
    case "document_compare":
      return "multi_document";
    case "resource_summary":
      return "summary";
    case "pdf_question":
      // A question asked from a resource page is answered from THAT document.
      return intent.slug ? "scoped" : "hybrid";
    default:
      return "lookup";
  }
}

/** What the deterministic stage decided, before any model is considered. */
export interface Plan {
  intent: IntentResult;
  retrieval: RetrievalOutcome;
  /** The retrieval mode this request took — drives the evidence budget. */
  mode?: RetrievalMode;
  /** Compressed history — computed once and reused by the generation stage. */
  compressed: ReturnType<typeof compressConversation>;
  /** A complete answer, when no model is needed. */
  answer?: string;
  /** Facts to hand the model when one IS needed. */
  facts: string[];
  injection: boolean;
}

export const EMPTY_RETRIEVAL: RetrievalOutcome = {
  results: [], works: [], passages: [], facts: [],
  dbQueries: 0, embeddingMs: 0, retrievalMs: 0, cacheHit: false,
};

/**
 * Can this request be answered without a model?
 *
 * PURE, and exported, because it is the single most cost-relevant decision the
 * system makes: `scripts/ai-benchmark.ts` measures the real function rather
 * than a re-implementation of it, so the benchmark cannot drift from the
 * behaviour it reports on.
 *
 * Returns the finished answer, or undefined when a model is required.
 */
export function deterministicAnswer(
  intent: IntentResult,
  retrieval: RetrievalOutcome,
  facts: readonly string[],
): string | undefined {
  const locale = intent.locale;
  if (intent.smalltalk) return T.greeting(locale);

  switch (intent.intent) {
    case "unsupported":
      return T.academicDecline(locale);

    case "faq":
      // A confident topic match plus a real published fact is a complete
      // answer; anything less goes to the model with the facts attached.
      return intent.confidence >= 0.9 && facts[0] ? T.factAnswer(facts[0], intent.factLink, locale) : undefined;

    case "book_search":
    case "thesis_search":
    case "post_search":
      // Search is retrieval-first: when the catalogue answered, the CARDS are
      // the answer and a generated sentence adds cost, not information (§14).
      if (intent.confidence < CONFIDENT) return undefined;
      return retrieval.results.length
        ? T.foundResults(retrieval.results, intent.query, locale)
        : T.noResults(intent.query, locale);

    case "book_detail":
      return retrieval.results.length
        ? T.bookDetail(retrieval.results[0], retrieval.works[0]?.summary, locale)
        : undefined;

    case "related_books":
      return T.relatedLead(retrieval.results.length, locale);

    case "author_search":
      // A resolved person is a complete answer: the hub sentence plus cards.
      // No person matched → retrieval kept a work only when the question
      // named its title ("who wrote X"), so a lone card is that work's byline.
      if (retrieval.hub) return T.hubLead(retrieval.hub, retrieval.results.length, locale);
      return retrieval.results[0]
        ? T.writtenBy(retrieval.results[0], locale)
        : T.noAuthor(intent.query, locale);

    case "subject_search":
      if (retrieval.hub) return T.hubLead(retrieval.hub, retrieval.results.length, locale);
      if (facts[0]) return T.subjectOverview(facts[0], locale);
      return retrieval.results.length
        ? T.foundResults(retrieval.results, intent.query, locale)
        : T.noSubject(intent.query, locale);

    case "pdf_question":
      // No evidence means no grounded answer is possible. Say so rather than
      // letting the model improvise one (§23).
      return retrieval.passages.length === 0 ? T.noEvidence(locale) : undefined;

    case "citation":
      // Assembled by lib/citations from the record's own fields. A model here
      // would spend tokens to produce a reference nobody could verify.
      return retrieval.citation
        ? T.citationAnswer(
            retrieval.citation.title,
            retrieval.citation.reference,
            retrieval.citation.url,
            locale,
            retrieval.citation.page,
          )
        : T.noResults(intent.query, locale);

    case "resource_summary":
      // A summary of text we do not have is the most confident-sounding
      // fiction this system could produce. When the document has no indexed
      // pages the catalogue record is the honest answer, clearly labelled.
      if (retrieval.passages.length === 0) {
        return retrieval.results[0]
          ? T.summaryFromMetadata(retrieval.results[0], retrieval.works[0]?.summary, locale)
          : T.insufficientText(undefined, locale);
      }
      return undefined;

    case "document_compare":
      // Nothing from either document — comparing them would be invention.
      return retrieval.passages.length === 0 ? T.insufficientText(undefined, locale) : undefined;

    default:
      return undefined;
  }
}

export interface GenerationInput {
  system: string;
  messages: ModelMessage[];
  maxOutputTokens: number;
  model: string;
  thinkingBudget: number;
}

export function buildGeneration(p: Plan, org: PromptOrg): GenerationInput {
  const { intent, compressed } = p;

  const system = buildSystemPrompt({
    org,
    intent: intent.intent,
    locale: intent.locale,
    verbosity: intent.verbosity,
  });

  // The evidence budget is a property of the MODE, not a constant: a
  // comparison legitimately needs two documents' passages where a lookup needs
  // none. Both are bounded, and the ceiling rises only as far as the mode's
  // own evidence allowance (lib/ai/evidence.ts).
  const mode = p.mode ?? "hybrid";
  const evidenceBudget = EVIDENCE_LIMITS[mode].budgetTokens || MAX_EVIDENCE_TOKENS;
  const ceiling = contextCeilingFor(mode, MAX_CONTEXT_TOKENS);

  const ctx = buildContext({
    query: intent.query,
    works: p.retrieval.works,
    // Comparison passages are labelled by document so the model can tell the
    // two apart; without it "the second book says" has nothing behind it.
    passages: p.retrieval.passages.map((x) => ({
      title: (x as RetrievedEvidence).documentLabel ?? x.title,
      author: x.author,
      page: x.page,
      text: x.text,
    })),
    facts: p.facts,
    budget: Math.min(evidenceBudget, ceiling - estimateTokens(system) - compressed.overheadTokens - 120),
  });

  const messages: ModelMessage[] = [];
  if (compressed.summary) messages.push({ role: "user", content: compressed.summary });
  for (const h of compressed.history) {
    messages.push({ role: h.role === "model" ? "assistant" : "user", content: h.text });
  }
  // Evidence and question in one user turn, evidence first: the fence is what
  // marks everything above the question as untrusted reference material.
  const questionBlock = [
    ctx.block,
    p.injection ? INJECTION_NOTICE : "",
    `QUESTION: ${compressed.current}`,
  ].filter(Boolean).join("\n\n");
  messages.push({ role: "user", content: questionBlock });

  const tier = resolveTier({
    intent: intent.intent,
    verbosity: intent.verbosity,
    confidence: intent.confidence,
    evidenceCount: p.retrieval.passages.length,
    deterministic: false,
  });
  const model = modelIdFor(tier) ?? modelIdFor("fast")!;

  const isFormatting = intent.intent.endsWith("_search");
  return {
    system,
    messages,
    model,
    thinkingBudget: thinkingBudgetFor(tier),
    maxOutputTokens: isFormatting
      ? SEARCH_FORMAT_OUTPUT_TOKENS
      : MAX_OUTPUT_TOKENS[intent.verbosity],
  };
}
