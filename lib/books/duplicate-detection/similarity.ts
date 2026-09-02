/**
 * Deterministic string similarity for title matching. No dependency, by
 * design: the alternative is a fuzzy-search package in the admin bundle for
 * one function, and a scoring rule that can change under a minor version bump
 * is not a scoring rule a librarian can be told about.
 *
 * Two measures, because this library is bilingual and they fail in opposite
 * places:
 *
 *   * token similarity handles English word order, subtitles and dropped
 *     stop words — "Research Methods, A Practical Guide" vs "A Practical
 *     Guide to Research Methods";
 *   * character (edit) distance handles Khmer, which has no spaces at all and
 *     would otherwise be a single token compared to a single token, i.e. an
 *     equality test wearing a percentage.
 *
 * Everything works on CODE POINTS (Array.from), never UTF-16 units: a Khmer
 * cluster is several code points and splitting one mid-way would compare
 * fragments.
 */

import { normalizeTitle, titleTokens } from "./normalize";

/** Titles longer than this are truncated before the O(n·m) pass. A 400-char
 *  edit-distance matrix is 160k cells per candidate; nothing is learned past
 *  the first couple of hundred characters of a title. */
const MAX_COMPARE_CHARS = 240;

/** Levenshtein distance over code points, with a cheap length-difference
 *  lower bound so wildly different lengths cost nothing. */
export function editDistance(a: string, b: string): number {
  const s = Array.from(a).slice(0, MAX_COMPARE_CHARS);
  const t = Array.from(b).slice(0, MAX_COMPARE_CHARS);
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  let prev = new Array<number>(t.length + 1);
  let curr = new Array<number>(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;

  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[t.length];
}

/** 0–1 similarity from edit distance, relative to the longer string. */
export function characterRatio(a: string, b: string): number {
  const s = Array.from(a).slice(0, MAX_COMPARE_CHARS);
  const t = Array.from(b).slice(0, MAX_COMPARE_CHARS);
  const longest = Math.max(s.length, t.length);
  if (longest === 0) return 0;
  return 1 - editDistance(a, b) / longest;
}

/**
 * 0–1 token overlap, weighted toward the SHORTER title.
 *
 * Plain Jaccard punishes a long subtitle: "Research Methods" against
 * "Research Methods: A Practical Guide for Undergraduates" scores 2/8 = 0.25,
 * which is wrong — every word of the shorter title is present in the longer.
 * Containment (overlap ÷ smaller set) says 1.0, which is too generous on its
 * own. The blend keeps a real subtitle pair high without letting a two-word
 * title match every long title that happens to open with those two words.
 */
export function tokenRatio(a: string, b: string): number {
  const left = new Set(titleTokens(a));
  const right = new Set(titleTokens(b));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  if (shared === 0) return 0;

  const union = left.size + right.size - shared;
  const jaccard = shared / union;
  const containment = shared / Math.min(left.size, right.size);
  return 0.6 * jaccard + 0.4 * containment;
}

/**
 * Title similarity as an integer 0–100.
 *
 * Exact normalized equality is 100 and nothing else reaches it, so a caller
 * can treat 100 as "the same string after normalization" rather than "very
 * close". Below that the score is the stronger of the two measures — they
 * cover different failure modes and neither is a sanity check on the other.
 */
export function titleSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 100;

  const score = Math.max(tokenRatio(left, right), characterRatio(left, right));
  // Never round up to 100 — that number means "identical after normalization".
  return Math.min(99, Math.round(score * 100));
}

/**
 * Is `shorter` a word-boundary prefix of `longer` after normalization?
 *
 * The truncated-title duplicate ("… A Practical Guide" entered once in full
 * and once cut short) is the most common real cataloguing duplicate here, and
 * it is invisible to every other signal. The word boundary matters: "a
 * practical guide" must not match "a practical guidebook".
 */
export function isTitlePrefix(shorter: string, longer: string): boolean {
  const a = normalizeTitle(shorter);
  const b = normalizeTitle(longer);
  if (!a || !b || a === b) return false;
  return b.startsWith(`${a} `);
}
