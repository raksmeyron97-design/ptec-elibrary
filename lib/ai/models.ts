// lib/ai/models.ts
// The ONE place model identifiers and tier-selection rules live.
//
// Before this module the generation model was written out in three route files
// and the embedding model in four (audit §3), which is how /api/ask ended up
// querying a gemini-embedding-001 column with text-embedding-004 vectors.

import type { AIIntent, ModelTier, Verbosity } from "./response";

/** Chat/generation models, cheapest first. Override per deploy if needed. */
export const MODEL_IDS: Record<Exclude<ModelTier, "none">, string> = {
  fast: process.env.AI_MODEL_FAST ?? "gemini-3.5-flash",
  reasoning: process.env.AI_MODEL_REASONING ?? "gemini-3.5-flash",
};

/**
 * Embedding model. Single source of truth for BOTH sides of every vector
 * search — query and document. `books.embedding`, `research_reports.embedding`,
 * `catalog_books.embedding`, `publications.embedding` and `book_chunks.embedding`
 * are all vector(768) filled by scripts/embed-library.ts and lib/chunk-embed.ts
 * with this model at this dimensionality, L2-normalized. Changing any of these
 * three values requires a full re-embed of every table.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIM = 768;

export function modelIdFor(tier: ModelTier): string | null {
  return tier === "none" ? null : MODEL_IDS[tier];
}

export interface TierInput {
  intent: AIIntent;
  verbosity: Verbosity;
  confidence: number;
  /** How many results/passages retrieval produced. */
  evidenceCount: number;
  /** True when the deterministic path can answer without a model. */
  deterministic: boolean;
}

/**
 * Pick the cheapest tier that can produce a correct answer.
 *
 * The rule that saves the most: anything answerable from the database plus a
 * template gets `"none"`. A model that restates rows we already have is pure
 * cost. `"reasoning"` is reserved for questions that must synthesize across
 * several retrieved passages — that is the only case where a bigger model
 * measurably changes the answer.
 */
export function resolveTier(input: TierInput): ModelTier {
  if (input.deterministic) return "none";

  switch (input.intent) {
    case "faq":
      // Facts come from settings; a model is only needed when the phrasing was
      // ambiguous enough that we're unsure which fact was asked for.
      return input.confidence >= 0.9 ? "none" : "fast";

    case "pdf_question":
      // Synthesizing across multiple passages, or an explicitly deep question,
      // is where the larger model earns its cost.
      return input.verbosity === "detailed" || input.evidenceCount >= 3 ? "reasoning" : "fast";

    case "unsupported":
      return "none";

    default:
      return "fast";
  }
}

/** Gemini thinking budget. Zero for everything but genuine synthesis — thinking
 *  tokens are billed and would otherwise eat the output cap. */
export function thinkingBudgetFor(tier: ModelTier): number {
  return tier === "reasoning" ? 512 : 0;
}
