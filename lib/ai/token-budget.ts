// lib/ai/token-budget.ts
// Explicit token budgets + a script-aware estimator. Pure.
//
// Why estimate rather than count: Gemini's tokenizer is a network call, and
// budgeting has to happen BEFORE we decide what to send. The estimator is
// deliberately conservative (over-counts slightly) so a budget is never
// silently blown. Provider-reported usage still overrides the estimate in
// telemetry when the SDK gives it to us.

import type { Verbosity } from "./response";

// ── Budgets ───────────────────────────────────────────────────────────────────
/** What a normal request's whole input should land under. Soft target. */
export const INPUT_TARGET_TOKENS = 900;
/** Hard ceiling on everything we send (system + context + history + question). */
export const MAX_CONTEXT_TOKENS = 2_000;
/** Retrieved evidence only — the part we can trim by dropping passages. */
export const MAX_EVIDENCE_TOKENS = 900;
/** Conversation carry-over. §8's target is "< 500 input tokens" of overhead. */
export const MAX_HISTORY_TOKENS = 400;
/** One retrieved passage after compression. ~400 chars of Latin text. */
export const MAX_PASSAGE_TOKENS = 130;

/** Output caps by requested verbosity (§10). */
export const MAX_OUTPUT_TOKENS: Record<Verbosity, number> = {
  brief: 200,
  normal: 350,
  detailed: 700,
};

/** Formatting a result list is a mechanical job — it never needs 350 tokens. */
export const SEARCH_FORMAT_OUTPUT_TOKENS = 220;

/** Max passages fed to the model. Raised only for explicit deep questions. */
export const MAX_PASSAGES = 3;
export const MAX_PASSAGES_DETAILED = 5;

/** Max result cards returned to the UI (and named to the model). */
export const MAX_RESULTS = 5;

// ── Estimator ─────────────────────────────────────────────────────────────────
// Khmer is an abugida with no spaces; SentencePiece splits it far more finely
// than Latin script. Measured against gemini-embedding-001's reported counts,
// Khmer averages ~0.55 tokens/char against Latin's ~0.26. Using one ratio for
// both under-counted Khmer prompts by 2x, which is how a "500 token" Khmer
// context became 1,100.
const KHMER = /[ក-៿᧠-᧿]/;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  let khmer = 0;
  for (const ch of text) if (KHMER.test(ch)) khmer++;
  const other = text.length - khmer;
  return Math.ceil(khmer * 0.55 + other * 0.26) + 1;
}

export function estimateTokensAll(texts: readonly string[]): number {
  return texts.reduce((sum, t) => sum + estimateTokens(t), 0);
}

/**
 * Truncate to a token budget on a word/character boundary, appending an
 * ellipsis when anything was cut. Never returns more than `maxTokens`.
 */
export function clampToTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return "";
  if (estimateTokens(text) <= maxTokens) return text;

  // Binary search the character length that fits — cheaper and more accurate
  // than a fixed chars-per-token guess on mixed-script text.
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(text.slice(0, mid)) <= maxTokens - 1) lo = mid;
    else hi = mid - 1;
  }
  let cut = text.slice(0, lo);
  // Prefer a word boundary for Latin text; Khmer has none, so only do this
  // when a space exists reasonably close to the end.
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > cut.length * 0.7) cut = cut.slice(0, lastSpace);
  return `${cut.trimEnd()}…`;
}

/** Remaining room after the fixed parts of a prompt are accounted for. */
export function remainingBudget(used: number, ceiling = MAX_CONTEXT_TOKENS): number {
  return Math.max(0, ceiling - used);
}
