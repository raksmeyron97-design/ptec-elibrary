// How "related" one resource is to another — one rule for every detail page.
//
// Signals, strongest first (docs/search-ranking.md, "Related resources"):
//   same subject > same author > shared keywords > same language > same type.
// Popularity is a TIE-BREAK only: a resource is never related because it is
// popular. Semantic similarity is deliberately absent — it would cost an
// embedding call per page view, and the five signals above are facts the
// database already holds.
//
// Author identity is exact normalized equality (`personNameKey`), the same
// rule the upload gate uses; "J. Smith" and "John Smith" are not the same
// person here either.
//
// Pure: no DB, no server-only imports.

import { personNameKey } from "@/lib/books/duplicate-detection/normalize";
import { normalizeSearchText } from "@/lib/search/normalize";

export type RelatedReason = "subject" | "author" | "keywords" | "language" | "type";

export type RelatedSeed = {
  id: string;
  type: string;
  subject?: string | null;
  /** Raw author names; normalized here. */
  authors?: readonly string[];
  keywords?: readonly string[];
  language?: string | null;
};

export type RelatedCandidate<T = unknown> = RelatedSeed & {
  /** Tie-break only. */
  popularity?: number;
  item: T;
};

export type RelatedScore = { score: number; reasons: RelatedReason[] };

export const RELATED_WEIGHTS = {
  subject: 40,
  author: 35,
  keyword: 8,
  keywordsMax: 24,
  language: 5,
  type: 3,
} as const;

function authorKeys(names: readonly string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const name of names ?? []) {
    const key = personNameKey(name);
    if (key) out.add(key);
  }
  return out;
}

function keywordKeys(words: readonly string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const w of words ?? []) {
    const key = normalizeSearchText(w);
    if (key) out.add(key);
  }
  return out;
}

export function scoreRelated(seed: RelatedSeed, candidate: RelatedSeed): RelatedScore {
  const reasons: RelatedReason[] = [];
  let score = 0;

  const seedSubject = normalizeSearchText(seed.subject);
  if (seedSubject && seedSubject === normalizeSearchText(candidate.subject)) {
    score += RELATED_WEIGHTS.subject;
    reasons.push("subject");
  }

  const seedAuthors = authorKeys(seed.authors);
  if (seedAuthors.size) {
    const shared = [...authorKeys(candidate.authors)].some((k) => seedAuthors.has(k));
    if (shared) {
      score += RELATED_WEIGHTS.author;
      reasons.push("author");
    }
  }

  const seedKeywords = keywordKeys(seed.keywords);
  if (seedKeywords.size) {
    const overlap = [...keywordKeys(candidate.keywords)].filter((k) => seedKeywords.has(k)).length;
    if (overlap > 0) {
      score += Math.min(overlap * RELATED_WEIGHTS.keyword, RELATED_WEIGHTS.keywordsMax);
      reasons.push("keywords");
    }
  }

  const seedLanguage = normalizeSearchText(seed.language);
  if (seedLanguage && seedLanguage === normalizeSearchText(candidate.language)) {
    score += RELATED_WEIGHTS.language;
    reasons.push("language");
  }

  if (seed.type === candidate.type) {
    score += RELATED_WEIGHTS.type;
    reasons.push("type");
  }

  return { score, reasons };
}

export type RankedRelated<T> = { item: T; score: number; reasons: RelatedReason[] };

/**
 * The `limit` most related candidates: score desc, then popularity desc, then
 * id asc — a total order, so the same inputs always render the same rail.
 * Candidates that share nothing with the seed but the type/language are
 * kept only when nothing stronger is available; the seed itself is dropped.
 */
export function rankRelated<T>(seed: RelatedSeed, candidates: readonly RelatedCandidate<T>[], limit = 6): RankedRelated<T>[] {
  const seen = new Set<string>([seed.id]);
  const scored: (RankedRelated<T> & { id: string; popularity: number })[] = [];
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const { score, reasons } = scoreRelated(seed, c);
    scored.push({ item: c.item, score, reasons, id: c.id, popularity: c.popularity ?? 0 });
  }
  scored.sort((a, b) => b.score - a.score || b.popularity - a.popularity || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const strong = scored.filter((s) => s.reasons.some((r) => r === "subject" || r === "author" || r === "keywords"));
  const pool = strong.length ? strong : scored;
  return pool.slice(0, limit).map(({ item, score, reasons }) => ({ item, score, reasons }));
}
