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
 * A token is "the same word, misspelled" above this, and a different word
 * below it. One or two edits inside a word clear it; a different word does not
 * ("psycology"/"psychology" is 0.9, "ជីវវិទ្យា"/"គីមីវិទ្យា" is 0.7).
 */
const TOKEN_MATCH_FLOOR = 0.85;

/**
 * Token overlap that tolerates a misspelling inside a word.
 *
 * Same shape as `tokenRatio` — and identical to it whenever every token either
 * matches exactly or not at all — but an unmatched token may be paired with
 * its best remaining counterpart and credited a FRACTION of a match, equal to
 * their character similarity, when that similarity says the two are one word
 * typed twice. Greedy best-first, each token spent once, so a title cannot
 * score twice against the same word.
 *
 * This is what lets the token measure stand alone below: it now covers the
 * typo case that whole-string edit distance used to have to rescue.
 */
export function fuzzyTokenRatio(a: string, b: string): number {
  const left = [...new Set(titleTokens(a))];
  const right = [...new Set(titleTokens(b))];
  if (left.length === 0 || right.length === 0) return 0;

  const unmatchedLeft: string[] = [];
  const availableRight = new Set(right);
  let shared = 0;

  for (const token of left) {
    if (availableRight.delete(token)) shared += 1;
    else unmatchedLeft.push(token);
  }

  for (const token of unmatchedLeft) {
    let best: string | null = null;
    let bestRatio = TOKEN_MATCH_FLOOR;
    for (const candidate of availableRight) {
      const ratio = characterRatio(token, candidate);
      if (ratio >= bestRatio) {
        best = candidate;
        bestRatio = ratio;
      }
    }
    if (best === null) continue;
    availableRight.delete(best);
    shared += bestRatio;
  }

  if (shared === 0) return 0;

  const union = left.length + right.length - shared;
  const jaccard = shared / union;
  const containment = shared / Math.min(left.length, right.length);
  return 0.6 * jaccard + 0.4 * containment;
}

/**
 * Title similarity as an integer 0–100.
 *
 * Exact normalized equality is 100 and nothing else reaches it, so a caller
 * can treat 100 as "the same string after normalization" rather than "very
 * close".
 *
 * WHICH MEASURE, AND WHY IT IS NO LONGER `Math.max` OF BOTH. Whole-string edit
 * distance is a proportion of the WHOLE title, so the more boilerplate two
 * titles share, the less their meaningful part is allowed to matter. Fifteen
 * Khmer teacher's guides named
 * "សៀវភៅណែនាំគ្រូបង្រៀន {SUBJECT} ថ្នាក់ទី{GRADE} (STEPSAM3)" share 40+
 * characters of frame around a 3-character subject word, which reads as 94%
 * alike — and `Math.max` meant that number beat the token measure, which had
 * correctly said 66. Every pair in the set warned against every other.
 *
 * So the character measure is used only where it is the ONLY informed measure:
 * when a title tokenizes into a single token, which is the space-less Khmer
 * case it was introduced for. Once both titles have words to compare, the
 * token measure decides — and `fuzzyTokenRatio` above absorbs the typo case
 * that was the character measure's other job.
 */
export function titleSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 100;

  const tokens = fuzzyTokenRatio(left, right);
  const bothHaveWords = titleTokens(left).length > 1 && titleTokens(right).length > 1;
  const score = bothHaveWords ? tokens : Math.max(tokens, characterRatio(left, right));
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

/**
 * The part of two titles that actually differs: what is left after the shared
 * opening and the shared ending are removed.
 *
 * WHY THIS EXISTS. Edit distance is a proportion of the WHOLE string, so a
 * title made mostly of boilerplate scores as near-identical however different
 * its meaningful part is. Fifteen Khmer teacher's guides —
 * "សៀវភៅណែនាំគ្រូបង្រៀន {SUBJECT} ថ្នាក់ទី{GRADE} (STEPSAM3)" — share 40+
 * characters of frame around a 3-character subject word, so Chemistry and
 * Biology scored 94 against each other while the token measure, which was
 * right, said 66 and lost the `Math.max`. The remainder is what a cataloguer
 * actually reads to tell the two apart, so it is what the caller must judge.
 *
 * Returns null when either side's remainder is empty — one title then contains
 * the other, which is a truncation or a missing word, NOT a different book, and
 * is what `isTitlePrefix` is for. Code points throughout: a Khmer cluster is
 * several of them and a UTF-16 split would compare halves of a letter.
 */
export function titleRemainders(
  a: string | null | undefined,
  b: string | null | undefined,
): { left: string; right: string } | null {
  const left = Array.from(normalizeTitle(a));
  const right = Array.from(normalizeTitle(b));
  if (left.length === 0 || right.length === 0) return null;

  const shortest = Math.min(left.length, right.length);
  let prefix = 0;
  while (prefix < shortest && left[prefix] === right[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < shortest - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const leftRest = left.slice(prefix, left.length - suffix).join("");
  const rightRest = right.slice(prefix, right.length - suffix).join("");
  if (!leftRest || !rightRest) return null;
  return { left: leftRest, right: rightRest };
}
