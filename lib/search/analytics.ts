// Privacy-conscious helpers for search-query analytics (roadmap Task 3).
// Pure/deterministic — unit-tested in analytics.test.ts. Server code decides
// *whether* to log; these helpers decide *what* gets stored:
//
//   - isLikelyBot()          — obvious crawlers/monitors never enter the log
//   - anonymousSessionHash() — HMAC of ip+ua with a server secret, rotated
//                              daily. Lets the dashboard group "one visitor's
//                              queries in one day" without storing any raw
//                              IP or durable identifier; yesterday's hashes
//                              cannot be correlated with today's.
//   - normalizeSearchTerm()  — mirrors the DB's generated normalized_term
//                              (lower(trim(term))) plus NFKC folding; Khmer
//                              text passes through NFKC/toLowerCase unchanged.
//   - suggestCorrections()   — edit-distance candidates against the catalog
//                              vocabulary, for the zero-result dashboard's
//                              "possible misspelling" column.

import { createHmac } from "node:crypto";

const BOT_UA_RE =
  /bot|crawl|spider|slurp|curl|wget|python-|httpx|okhttp|scrapy|headless|phantom|selenium|puppeteer|playwright|monitor|pingdom|uptime|statuscake|betterstack|lighthouse|pagespeed|facebookexternalhit|whatsapp|telegrambot|preview/i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  if (ua.length < 12) return true; // real browsers send long UA strings
  return BOT_UA_RE.test(ua);
}

/**
 * Daily-rotating anonymous session identifier. Returns null when no secret
 * is configured — callers then log the query without session correlation
 * rather than storing anything reversible.
 */
export function anonymousSessionHash(
  ip: string,
  userAgent: string,
  secret: string | undefined,
  now: Date = new Date(),
): string | null {
  if (!secret) return null;
  const day = now.toISOString().slice(0, 10);
  return createHmac("sha256", secret).update(`${day}|${ip}|${userAgent}`).digest("hex").slice(0, 16);
}

export function normalizeSearchTerm(term: string): string {
  return term.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

const KHMER_RE = /[ក-៿]/;

export function hasKhmer(text: string): boolean {
  return KHMER_RE.test(text);
}

/** Classic Levenshtein distance with an early-exit cap. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = tmp;
      rowMin = Math.min(rowMin, prev[j]);
    }
    if (rowMin > cap) return cap + 1;
  }
  return prev[b.length];
}

export interface CorrectionSuggestion {
  suggestion: string;
  distance: number;
}

/**
 * Spelling-correction candidates for a zero-result term, drawn from the
 * library's own vocabulary (titles, authors, subjects). Khmer terms only
 * match Khmer vocabulary and vice versa — cross-script edit distance is
 * meaningless. Distance budget scales with term length so short words don't
 * "correct" into unrelated ones.
 */
export function suggestCorrections(
  term: string,
  vocabulary: string[],
  limit = 3,
): CorrectionSuggestion[] {
  const q = normalizeSearchTerm(term);
  if (q.length < 3) return [];
  const budget = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
  const khmer = hasKhmer(q);

  const seen = new Set<string>();
  const out: CorrectionSuggestion[] = [];
  for (const raw of vocabulary) {
    const candidate = normalizeSearchTerm(raw);
    if (!candidate || candidate === q || seen.has(candidate)) continue;
    if (hasKhmer(candidate) !== khmer) continue;
    const distance = editDistance(q, candidate, budget);
    if (distance <= budget) {
      seen.add(candidate);
      out.push({ suggestion: raw.trim(), distance });
    }
  }
  return out.sort((a, b) => a.distance - b.distance).slice(0, limit);
}

/**
 * Groups near-duplicate zero-result terms (case/whitespace already folded by
 * normalization; latin terms additionally fold single-typo variants into the
 * most frequent spelling). Returns representative → member terms.
 */
export function groupEquivalentTerms(
  terms: { term: string; count: number }[],
): Map<string, { terms: string[]; count: number }> {
  const sorted = [...terms].sort((a, b) => b.count - a.count);
  const groups = new Map<string, { terms: string[]; count: number }>();

  for (const { term, count } of sorted) {
    const norm = normalizeSearchTerm(term);
    let host: string | null = null;
    if (!hasKhmer(norm) && norm.length >= 5) {
      for (const key of groups.keys()) {
        if (!hasKhmer(key) && editDistance(norm, key, 1) <= 1) {
          host = key;
          break;
        }
      }
    }
    if (host) {
      const g = groups.get(host)!;
      g.terms.push(term);
      g.count += count;
    } else {
      groups.set(norm, { terms: [term], count });
    }
  }
  return groups;
}
