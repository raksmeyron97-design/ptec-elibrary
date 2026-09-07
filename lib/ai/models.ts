// lib/ai/models.ts
// The ONE place model identifiers and tier-selection rules live.
//
// Before this module the generation model was written out in three route files
// and the embedding model in four (audit §3), which is how /api/ask ended up
// querying a gemini-embedding-001 column with text-embedding-004 vectors.

import { resolveProviderConfig } from "./provider-config";
import type { AIIntent, ModelTier, Verbosity } from "./response";

/**
 * GEMINI chat/generation models, cheapest first. Override per deploy if
 * needed. With AI_PROVIDER=ollama the local model (OLLAMA_CHAT_MODEL) answers
 * first and these name the model Gemini uses when the box cannot — see
 * lib/ai/provider.ts.
 */
export const MODEL_IDS: Record<Exclude<ModelTier, "none">, string> = {
  fast: process.env.AI_MODEL_FAST ?? "gemini-3.5-flash",
  reasoning: process.env.AI_MODEL_REASONING ?? "gemini-3.5-flash",
};

/**
 * Embedding model. Single source of truth for BOTH sides of every vector
 * search — query and document. `books.embedding`, `research_reports.embedding`,
 * `catalog_books.embedding`, `publications.embedding` and `book_chunks.embedding`
 * are all filled by scripts/embed-library.ts and lib/chunk-embed.ts with this
 * model at this dimensionality, L2-normalized, and the columns are declared at
 * exactly EMBEDDING_DIM. Changing any of these three values requires a
 * migration to the new dimension AND a full re-embed of every table.
 *
 * Resolved from AI_EMBED_PROVIDER (lib/ai/provider-config.ts): `gemini` is
 * gemini-embedding-001 at 768 — what every column holds today; `ollama` is
 * OLLAMA_EMBED_MODEL (bge-m3) at OLLAMA_EMBED_DIM (1024), which needs the
 * staged migration in docs/LOCAL_AI_OLLAMA_SETUP.md §5 applied first.
 */
// Read once at module load: these three values are the shape of every vector
// column, and a value that could change between two calls in one request is
// exactly the drift this module exists to prevent. `?? {}` because this file
// is re-exported from lib/ai/index.ts, where a future client importer would
// otherwise crash on a `process` the browser does not have.
const EMBEDDING = resolveProviderConfig(process.env ?? {});
export const EMBEDDING_PROVIDER = EMBEDDING.embedProvider;
export const EMBEDDING_MODEL = EMBEDDING.embedModel;
export const EMBEDDING_DIM = EMBEDDING.embedDim;

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

    case "document_compare":
      // Two documents' evidence has to be held against each other — the one
      // shape where a bigger model measurably changes the answer.
      return "reasoning";

    case "resource_summary":
      // Condensing passages from ONE document is not synthesis across sources.
      // Only an explicitly deep request buys the larger model.
      return input.verbosity === "detailed" ? "reasoning" : "fast";

    case "citation":
      // Formatted from catalogue metadata by lib/citations. A model here would
      // cost tokens to produce a worse, unverifiable reference.
      return "none";

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
