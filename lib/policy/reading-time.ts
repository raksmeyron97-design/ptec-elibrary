// lib/policy/reading-time.ts
//
// Reading time for a long-form policy page, in both of this site's scripts.
//
// Pure and dependency-free so the number can be computed at render time on the
// server with no cost, and unit-tested offline.
//
// WHY THIS IS NOT A WORD COUNT
//
// Every reading-time snippet on the internet is `text.split(/\s+/).length / 200`.
// Khmer does not put spaces between words. Run that on this page's Khmer
// catalogue and a 2,400-character paragraph counts as ONE word, so the whole
// policy reports "1 min read" in Khmer and "12 min read" in English — the same
// document, and the Khmer reader is told the shorter number precisely because
// their language was not handled.
//
// So the two scripts are measured with the two units each one actually has:
// whitespace-delimited words for Latin, characters for Khmer. Mixed text (a
// Khmer policy quoting "Supabase") is measured as the sum of both, because
// each run is counted by its own rule and no character is counted twice.

/** Khmer block, U+1780–U+17FF, plus the Khmer symbols block U+19E0–U+19FF. */
const KHMER = /[ក-៿᧠-᧿]/g;

/**
 * Combining marks and invisible characters carry no reading effort — a
 * subscript consonant or a vowel sign is read as part of the syllable it hangs
 * off, not as another character. Counting them inflates Khmer by roughly a
 * quarter, which is the difference between "8 min" and "10 min".
 */
const KHMER_SILENT = /[឴឵្​ំ-៓]/g;

/** Latin words per minute. Deliberately conservative: a privacy policy is read
 *  more slowly than prose, and over-promising "3 min" on a 9-minute document
 *  is the failure mode that makes the badge worth removing. */
const LATIN_WPM = 200;

/**
 * Khmer characters per minute, counting only characters that carry a sound.
 * ≈160 words/min at the ~4.4 sounding characters per word this catalogue
 * averages. Held as characters/min rather than words/min because there is no
 * segmenter here to produce words — see the Khmer notes in CLAUDE.md.
 */
const KHMER_CPM = 700;

export type ReadingTime = {
  /** Whole minutes, never below 1. */
  minutes: number;
  /** What was actually counted, for tests and for the trace. */
  latinWords: number;
  khmerChars: number;
};

/**
 * Minutes to read `parts`, which may be any mix of strings, nested arrays and
 * absent values — the shape a message catalogue hands back, so a caller never
 * has to flatten or filter before asking.
 */
export function readingTime(parts: unknown): ReadingTime {
  const text = collect(parts).join(" ");

  // Khmer first: strip the silent marks, then count what is left of the script.
  const khmerChars = (text.replace(KHMER_SILENT, "").match(KHMER) ?? []).length;

  // Latin: remove every Khmer character before splitting, so a run of Khmer
  // with no spaces around it cannot land in the word count as one huge "word".
  const latinWords = text
    .replace(KHMER, " ")
    .replace(KHMER_SILENT, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

  const minutes = latinWords / LATIN_WPM + khmerChars / KHMER_CPM;

  return {
    minutes: Math.max(1, Math.round(minutes)),
    latinWords,
    khmerChars,
  };
}

/** Flatten anything the catalogue can hold into the strings inside it. */
function collect(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collect(v, out);
  else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collect(v, out);
  }
  return out;
}
