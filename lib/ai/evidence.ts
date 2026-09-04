// lib/ai/evidence.ts
// What counts as EVIDENCE for a research answer, and how a candidate pool is
// reduced to the few passages a model may see. Pure — no DB, no server-only —
// so the fusion and diversity rules are unit-testable and the retrieval
// benchmark measures the real functions.
//
// Three rules live here, and each exists because of a specific failure:
//
//  1. LEXICAL AND SEMANTIC ARE BOTH EVIDENCE. Before this module the AI path
//     was vector-only (`match_book_chunks`), so a question quoting a phrase
//     that appears verbatim on a page could still miss it when the chunk's
//     embedding sat below the similarity floor — while /api/search/native
//     found it instantly with an ilike. The two legs are fused, not chosen
//     between.
//  2. SCOPE IS A RETRIEVAL INPUT, NOT A FILTER. "Ask this book" must retrieve
//     inside one record; retrieving the corpus and filtering afterwards is
//     both wasteful and, for a private/unpublished record, a leak waiting to
//     happen (§17, §35).
//  3. DIVERSITY IS DIRECTIONAL. An unscoped research question wants three
//     resources, not three pages of one book; a scoped question wants the
//     opposite. The old `matchChunks` hard-coded one-passage-per-work, which
//     gave diversity by accident and made depth impossible.

import type { RetrievedPassage } from "./citations";

/** Which pool a piece of evidence came from. */
export type EvidenceMatchType = "pdf_exact" | "semantic";

export type EvidenceRecordType = "book" | "research" | "publication";

/**
 * One retrieved passage with its provenance. Extends `RetrievedPassage` so
 * every existing consumer (`buildSources`, `toCompactPassage`) keeps working
 * unchanged; the added fields are what make grounding and "save this source"
 * able to name the record rather than infer it from a title string.
 */
export interface RetrievedEvidence extends RetrievedPassage {
  recordType: EvidenceRecordType;
  recordId: string;
  matchType: EvidenceMatchType;
  /** Fused rank score. Comparable only within one retrieval. */
  score: number;
  /** Present for multi-document retrieval: which side of the comparison. */
  documentLabel?: string;
}

/** How a question should be answered — decided before anything expensive runs. */
export type RetrievalMode =
  | "lookup"
  | "pdf_exact"
  | "semantic"
  | "hybrid"
  | "scoped"
  | "multi_document"
  | "summary"
  | "citation";

export interface EvidenceLimits {
  /** Rows to ask each retrieval leg for. */
  candidates: number;
  /** Passages that may reach the model. */
  evidence: number;
  /** Passages one record may contribute. */
  perResource: number;
  /** Token ceiling for the evidence block in this mode. */
  budgetTokens: number;
}

/**
 * The token bill of every mode, in one table (§10).
 *
 * `lookup` and `citation` are answered from structured data, so they retrieve
 * no passages and spend no evidence tokens at all. `scoped` and `summary` buy
 * depth inside one document; `multi_document` buys breadth across two. Nothing
 * here approaches the model's context window — the ceiling is what a grounded
 * answer needs, not what the provider would accept.
 */
export const EVIDENCE_LIMITS: Record<RetrievalMode, EvidenceLimits> = {
  lookup: { candidates: 0, evidence: 0, perResource: 0, budgetTokens: 0 },
  citation: { candidates: 0, evidence: 0, perResource: 0, budgetTokens: 0 },
  pdf_exact: { candidates: 12, evidence: 3, perResource: 1, budgetTokens: 900 },
  semantic: { candidates: 12, evidence: 3, perResource: 1, budgetTokens: 900 },
  hybrid: { candidates: 12, evidence: 3, perResource: 1, budgetTokens: 900 },
  scoped: { candidates: 16, evidence: 4, perResource: 4, budgetTokens: 1_200 },
  summary: { candidates: 20, evidence: 5, perResource: 5, budgetTokens: 1_400 },
  multi_document: { candidates: 10, evidence: 6, perResource: 3, budgetTokens: 1_800 },
};

/** Hard ceiling for the whole prompt in a mode, evidence included. */
export function contextCeilingFor(mode: RetrievalMode, base: number): number {
  const evidence = EVIDENCE_LIMITS[mode].budgetTokens;
  return Math.max(base, evidence + 1_100);
}

export function evidenceKey(e: { recordType: string; recordId: string; page: number }): string {
  return `${e.recordType}:${e.recordId}:${e.page}`;
}

function recordKey(e: { recordType: string; recordId: string }): string {
  return `${e.recordType}:${e.recordId}`;
}

/** Reciprocal-rank fusion constant. 60 is the value the RRF paper uses. */
export const RRF_K = 60;

/**
 * Fuse ranked lists into one, by reciprocal rank.
 *
 * RRF rather than score normalisation on purpose: a trigram hit and a cosine
 * similarity are not on the same scale and never will be, so only their
 * ORDER is comparable. A page found by both legs outranks a page found by
 * one, which is exactly the signal we want — the model gets the passage the
 * reader's words and the question's meaning agree on.
 *
 * Identity is (record, page): the same page arriving from both legs is one
 * piece of evidence, and it keeps the lexical text (a verbatim window around
 * the match reads better than a chunk boundary).
 */
export function fuseEvidence(
  lists: readonly (readonly RetrievedEvidence[])[],
  k = RRF_K,
): RetrievedEvidence[] {
  const merged = new Map<string, RetrievedEvidence>();
  const scores = new Map<string, number>();

  for (const list of lists) {
    list.forEach((item, index) => {
      const key = evidenceKey(item);
      scores.set(key, (scores.get(key) ?? 0) + 1 / (k + index + 1));
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...item });
        return;
      }
      // Keep the verbatim window when one leg found the query literally.
      if (existing.matchType !== "pdf_exact" && item.matchType === "pdf_exact") {
        merged.set(key, { ...item });
      }
    });
  }

  return [...merged.entries()]
    .map(([key, item]) => ({ ...item, score: scores.get(key) ?? 0 }))
    .sort((a, b) => b.score - a.score || a.page - b.page || evidenceKey(a).localeCompare(evidenceKey(b)));
}

/** One entry per (record, page), keeping the highest-scoring. Input order wins ties. */
export function dedupePages(evidence: readonly RetrievedEvidence[]): RetrievedEvidence[] {
  const seen = new Set<string>();
  const out: RetrievedEvidence[] = [];
  for (const e of evidence) {
    const key = evidenceKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export interface DiversifyOptions {
  limit: number;
  /** Passages one record may contribute before others get a turn. */
  perResource: number;
}

/**
 * Reduce a ranked pool to `limit` passages, spreading across records first.
 *
 * Two passes: the first admits at most `perResource` per record, so a
 * research question is answered from as many sources as the pool supports;
 * the second fills any remaining slots from what is left, so a question that
 * only ONE book can answer still gets a full, deep answer rather than a thin
 * one. Setting `perResource >= limit` (the scoped modes) makes the first pass
 * a no-op and keeps every passage from the single record in question.
 */
export function diversify(
  evidence: readonly RetrievedEvidence[],
  { limit, perResource }: DiversifyOptions,
): RetrievedEvidence[] {
  if (limit <= 0) return [];
  const ranked = dedupePages(evidence);
  const perRecord = new Map<string, number>();
  const chosen: RetrievedEvidence[] = [];
  const taken = new Set<string>();

  for (const e of ranked) {
    if (chosen.length >= limit) break;
    const key = recordKey(e);
    const used = perRecord.get(key) ?? 0;
    if (used >= perResource) continue;
    perRecord.set(key, used + 1);
    taken.add(evidenceKey(e));
    chosen.push(e);
  }

  for (const e of ranked) {
    if (chosen.length >= limit) break;
    if (taken.has(evidenceKey(e))) continue;
    chosen.push(e);
  }

  return chosen;
}

/**
 * Evidence for a comparison, balanced per document.
 *
 * Each side gets its own slice of the budget, so a book the retrieval liked
 * more cannot crowd the other out of the prompt — an answer that compares two
 * documents while quoting only one is worse than saying the evidence is
 * missing. Documents are returned in the order the question named them.
 */
export function balanceByDocument(
  groups: readonly { label: string; evidence: readonly RetrievedEvidence[] }[],
  limits: EvidenceLimits,
): RetrievedEvidence[] {
  const perDocument = Math.max(1, Math.floor(limits.evidence / Math.max(1, groups.length)));
  return groups.flatMap((g) =>
    diversify(g.evidence, { limit: perDocument, perResource: limits.perResource }).map((e) => ({
      ...e,
      documentLabel: g.label,
    })),
  );
}

/**
 * Pages spread across a document, for a summary.
 *
 * A summary retrieved as "top-k by similarity to the word summarize" returns
 * whichever pages happen to sound abstract — usually the preface, five times.
 * Ranked evidence leads (it is what the reader asked about), then the pool is
 * sampled at even intervals so the middle and end of the document are
 * represented. Nothing is invented: every page returned was retrieved.
 */
export function spreadPages(
  evidence: readonly RetrievedEvidence[],
  limit: number,
): RetrievedEvidence[] {
  const ranked = dedupePages(evidence);
  if (ranked.length <= limit) return [...ranked];

  const chosen: RetrievedEvidence[] = ranked.slice(0, Math.min(2, limit));
  const taken = new Set(chosen.map(evidenceKey));
  const rest = ranked.filter((e) => !taken.has(evidenceKey(e))).sort((a, b) => a.page - b.page);
  const slots = limit - chosen.length;
  if (slots > 0 && rest.length > 0) {
    const step = rest.length / slots;
    for (let i = 0; i < slots; i++) {
      const pick = rest[Math.min(rest.length - 1, Math.floor(i * step))];
      if (pick && !taken.has(evidenceKey(pick))) {
        taken.add(evidenceKey(pick));
        chosen.push(pick);
      }
    }
  }
  return chosen.sort((a, b) => b.score - a.score || a.page - b.page);
}

/** How many distinct records this evidence set draws on. */
export function sourceCount(evidence: readonly RetrievedEvidence[]): number {
  return new Set(evidence.map(recordKey)).size;
}
