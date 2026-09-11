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

import { hasKhmer, normalizeSearchText } from "@/lib/search/normalize";
import type { RetrievedPassage } from "./citations";

/**
 * Function words a question is made of. They are not evidence of anything:
 * searching page text for "what", "does" or "about" matches every page in the
 * library, which is the same as matching none of them.
 *
 * Deliberately small. This is not linguistics — it is the handful of words
 * that appear in the shape of a question ("what does the book say about X")
 * and would otherwise drown the two words that carry the topic.
 */
const QUESTION_WORDS = new Set([
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "does", "do", "did", "is", "are", "was", "were", "be", "been", "being",
  "the", "a", "an", "this", "that", "these", "those", "it", "its", "their",
  "and", "or", "but", "of", "in", "on", "at", "to", "for", "from", "with",
  "about", "into", "over", "under", "between", "book", "books", "document",
  "text", "page", "pages", "say", "says", "said", "tell", "tells", "me",
  "you", "your", "i", "my", "we", "us", "can", "could", "would", "should",
  "will", "shall", "may", "might", "must", "have", "has", "had", "there",
  "here", "any", "some", "all", "more", "most", "other", "such", "than",
  "then", "also", "just", "only", "very", "much", "many",
  // The verbs a question FRAME is built from. "Explain ethics as the
  // library's books describe it" yielded [describe, explain, library,
  // ethics] and required three of them on a page; a page about ethics that
  // did not also say "describe" and "explain" was dropped. The frame reader
  // (lib/ai/query.ts) now removes these before retrieval; listing them here
  // is the second lock, for phrasings it does not recognise.
  "explain", "explains", "explained", "describe", "describes", "described",
  "discuss", "discusses", "discussed", "handle", "handles", "handled",
  "cover", "covers", "covered", "define", "defines", "defined", "definition",
  "meaning", "mean", "means", "according", "please", "understood",
  "treated", "approached", "presented",
]);

/**
 * The words in a question that could plausibly appear in the text being
 * searched, longest first.
 *
 * Longest-first matters: a page containing "assessment" is better evidence
 * for "what does it say about formative assessment" than one containing
 * "formative", and when the candidate budget binds it is the specific term
 * that should survive. Khmer has no word boundaries, so a Khmer query is one
 * term — the phrase itself.
 */
export function queryTerms(query: string, max = 6): string[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const word of normalized.split(" ")) {
    if (seen.has(word)) continue;
    // A Khmer run has no internal word boundaries, so it enters whole. It is
    // kept alongside any Latin words in the SAME query: a mixed question
    // ("តើសៀវភៅនេះនិយាយអ្វីអំពី research methods") used to collapse to one
    // unsplittable blob, discarding the two English words that were the only
    // searchable thing in it.
    if (hasKhmer(word)) {
      if (word.length < 2) continue;
      seen.add(word);
      terms.push(word);
      continue;
    }
    if (word.length < 4 || QUESTION_WORDS.has(word)) continue;
    seen.add(word);
    terms.push(word);
  }
  return terms.sort((a, b) => b.length - a.length).slice(0, max);
}

/**
 * How much lexical agreement makes a page evidence rather than a coincidence.
 *
 * One term out of four is not an answer: "zebrafish cardiac regeneration
 * protocols" matched research-methods pages on the word "protocols" alone,
 * and a page cited for that reason is exactly the raw material a confident
 * wrong answer is written from.
 *
 * A FIXED floor of two cannot express that, because it says the same thing
 * about a two-word question and a six-word one. Measured with
 * scripts/ai-answer-benchmark.ts against production, over eight subjects
 * verified to appear on ZERO pages of the collection: at the fixed floor,
 * "cryptocurrency mining rigs" was answered from a page about readability
 * formulas and "submarine hull design" from a chapter-summary page — each
 * admitted on two ordinary words while the word that made the question that
 * question ("cryptocurrency", "submarine") appeared nowhere. A two-term
 * question was worse still: one incidental match was enough.
 *
 * So the floor is a MAJORITY of the question's terms, and a two-term question
 * needs both. That is the weakest rule that makes "shares one common word with
 * this page" stop counting as evidence, and the phrase bonus in
 * `lexicalScore` still lets a page carrying the whole phrase win outright.
 * The semantic leg is unaffected and continues to cover paraphrase.
 */
export function minLexicalScore(terms: readonly string[]): number {
  if (terms.length <= 1) return 1;
  if (terms.length === 2) return 2;
  return Math.ceil(terms.length * 0.6);
}

/**
 * The terms a page must ALL contain before it is even a lexical candidate.
 *
 * The majority floor above was still not enough, and the eight no-answer
 * subjects in scripts/ai-answer-benchmark.ts showed exactly how: "byzantine
 * fault tolerance" admitted a page containing "fault" and "tolerance" (2 of
 * 3 — a majority) while "byzantine" appeared nowhere in the library, and
 * "aortic valve replacement" admitted an operations-research page on heart
 * valve production. A three-word topic is ONE concept; a page missing a third
 * of it is not evidence for it. So a topic of up to three content terms
 * requires every one of them, and a longer question requires its three most
 * specific (longest) terms — the ones that make the question that question.
 * The phrase bonus in `lexicalScore` still lets a verbatim phrase win, and the
 * semantic leg still covers paraphrase.
 */
export function requiredTerms(terms: readonly string[]): string[] {
  return terms.slice(0, 3);
}

/**
 * Does this page DEFINE the term, rather than merely mention it? "Validity
 * is…", "triangulation refers to…", "a case study can be defined as…". A
 * weak, explainable signal used only for definition/explanation questions,
 * where the page that defines the concept is the page a reader wants first.
 */
export function definitionSignal(content: string, terms: readonly string[]): boolean {
  const text = normalizeSearchText(content);
  if (!text) return false;
  for (const term of terms) {
    if (hasKhmer(term) || term.length < 4) continue;
    const re = new RegExp(
      `\\b${term.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}s?\\b\\s+(?:is|are|was|refers to|means|can be defined|is defined|may be defined|describes|denotes|involves)\\b`,
      "u",
    );
    if (re.test(text)) return true;
  }
  return false;
}

/** The explainable parts of a passage's rank. Present on evidence the new legs produced. */
export interface EvidenceSignals {
  /** Lexical agreement: +10 whole phrase, +1 per term, +3 when the page defines the term. */
  lexical?: number;
  /** Cosine similarity of the chunk to the question, when the semantic leg found it. */
  semantic?: number;
  /** How many pages of this record matched the topic — the record's strength as a source. */
  density?: number;
  definition?: boolean;
  /** Reciprocal-rank fusion score. Comparable only within one retrieval. */
  rrf?: number;
}

/**
 * How well a page answers the query, from the terms it contains.
 *
 * A page carrying the whole phrase is the strongest lexical evidence there
 * is; after that, more distinct topic terms beats more repetitions of one.
 * Returns 0 when nothing matched, so the caller can drop the row rather than
 * cite a page whose only connection to the question is the word "the".
 */
export function lexicalScore(content: string, query: string, terms: readonly string[]): number {
  const text = normalizeSearchText(content);
  if (!text) return 0;
  const phrase = normalizeSearchText(query);
  let score = 0;
  if (phrase && text.includes(phrase)) score += 10;
  for (const term of terms) if (text.includes(term)) score += 1;
  return score;
}

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
  /** Why this passage ranks where it does — for the request trace, never the prompt. */
  signals?: EvidenceSignals;
  /** Last page of a merged run of adjacent pages; equals `page` when unmerged. */
  pageEnd?: number;
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
  // `hybrid` is the CROSS-COLLECTION research question — "what does the
  // literature say about validity" — and it was the thinnest allowance in this
  // table: three passages, one per record, 900 tokens, less than a single
  // document's own summary gets. That is backwards, and it was measurable.
  // Against production (98 labelled questions, scripts/retrieval-benchmark):
  // once the query stopped carrying its own question frame the candidate pool
  // for these questions roughly doubled (12 → 24 rows), top-1 accuracy rose
  // 20% → 30% — and Recall@5 FELL 55% → 45%, because a better pool was still
  // being squeezed through three slots with a one-per-record cap that evicted
  // correct pages. Six passages at two per record still guarantees at least
  // three distinct sources whenever the pool holds them, which is the property
  // `perResource: 1` was protecting, while letting a book that genuinely
  // answers the question contribute its second page.
  hybrid: { candidates: 18, evidence: 5, perResource: 2, budgetTokens: 1_400 },
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
      // Keep the verbatim window when one leg found the query literally, and
      // keep BOTH legs' signals so the trace can say why the page ranked.
      const signals = { ...existing.signals, ...item.signals };
      if (existing.matchType !== "pdf_exact" && item.matchType === "pdf_exact") {
        merged.set(key, { ...item, signals });
      } else {
        merged.set(key, { ...existing, signals });
      }
    });
  }

  return [...merged.entries()]
    .map(([key, item]) => {
      const score = scores.get(key) ?? 0;
      return { ...item, score, signals: { ...item.signals, rrf: score } };
    })
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
