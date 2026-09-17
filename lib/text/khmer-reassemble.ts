// lib/text/khmer-reassemble.ts
// Deterministic, zero-cost repair of fragmented Khmer text extracted from PDFs.
// Pure and browser-safe: no I/O, no Node, no model call, no API spend.
//
// ── THE DAMAGE ───────────────────────────────────────────────────────────────
//
// Legacy Khmer PDFs (Limon, ABC, early Khmer OS) carry no usable ToUnicode
// CMap. pdf.js recovers the glyphs faithfully and the relationships between
// them not at all, so the marks that belong INSIDE a syllable are emitted as
// separate tokens with spaces between them:
//
//     stored   គាំទ្ រថវិកា        should be   គាំទ្រថវិកា
//     stored   វិទ្យាស្ថ ា ន        should be   វិទ្យាស្ថាន
//     stored   អ្ ន ក              should be   អ្នក
//
// Every code point is CORRECT and in the wrong arrangement. Nothing was lost,
// so nothing has to be invented to put it back.
//
// ── WHY THIS IS A REPAIR AND NOT A GUESS ─────────────────────────────────────
//
// This is the property the whole module rests on, and it is worth stating
// precisely because it is what separates rules 1–3 from rule 4.
//
// Khmer orthography does not allow a dependent vowel or a coeng to BEGIN a
// syllable: a dependent vowel attaches to the consonant on its left, and a
// coeng must sit between two consonants. So when the text contains
//
//     <consonant> <space> <dependent vowel>
//
// there is exactly one consonant the vowel can belong to — the one before the
// space — because a vowel cannot start the next syllable either. The repair is
// FORCED by the script's own rules, not chosen. `analyzeTextHealth`
// (lib/semantic/text-quality.ts) measures the same impossibility from the
// other side, as `danglingCoengRatio` and `orphanVowelRatio`.
//
// Rule 4 — collapsing spaces between two CONSONANTS — has no such forcing.
// A space between consonants may be glyph spacing or a legitimate phrase
// break, and nothing in the text says which. It is therefore OFF by default
// (`collapseGlyphSpacing`), and it is worth only two of the 86 catalogued
// damaged books (`scripts/damaged-khmer-books.json`) while carrying all of the
// risk.
//
// ── WHAT THIS CANNOT DO ──────────────────────────────────────────────────────
//
// It never INSERTS a code point, so `khmer-coeng-missing` (coengs dropped by
// the extractor) is out of reach. It never REPLACES one, so
// `khmer-legacy-font` (one character emitted in place of another) is out of
// reach. Those 13 of 86 books need OCR — `scripts/repair-khmer-pages.ts`,
// which spends Gemini Vision quota. This module deliberately does not pretend
// otherwise: a page it leaves with substituted characters is still unreadable,
// and `countOrthographicViolations` is how a caller sees that rather than
// trusting a health verdict that spacing alone can satisfy.

// ── Khmer Unicode ranges ─────────────────────────────────────────────────────

/** Consonants ក (U+1780) … អ (U+17A2). */
const CONSONANT = "\\u1780-\\u17A2";
/** Independent vowels ឣ (U+17A3) … ឳ (U+17B3) — they stand alone as a base. */
const INDEP_VOWEL = "\\u17A3-\\u17B3";
/** Dependent vowels ា (U+17B6) … ៅ (U+17C5) — never begin a syllable. */
const DEP_VOWEL = "\\u17B6-\\u17C5";
/**
 * Signs that attach to a base: ំ ះ ៈ ៉ ៊ ់ ៌ ៍ ៎ ៏ ៑ ៓.
 * U+17C6–U+17CD, U+17CF–U+17D1, U+17D3. U+17CE (឴) and U+17D2 (coeng) are
 * excluded — the coeng has its own rules about what may follow it.
 */
const SIGN = "\\u17C6-\\u17CD\\u17CF-\\u17D1\\u17D3";
/** The subscript marker ្ (U+17D2). */
const COENG = "្";
/** Sentence punctuation ។ (U+17D4) and ៕ (U+17D5). */
const SENTENCE_END = "\\u17D4\\u17D5";
/** Anything a base may be: a consonant or an independent vowel. */
const BASE = `${CONSONANT}${INDEP_VOWEL}`;

/** Horizontal whitespace only. A line break is not intra-syllable spacing. */
const GAP = "[ \\t\\u00A0\\u200B]+";

// ── Rule 1 — coeng reconnection ──────────────────────────────────────────────
// The coeng may have drifted left, right, or both. All three are the same
// repair, and all three are forced: a coeng is legal ONLY between consonants.
//
//   អ្ នក   →  អ្នក       ព ្រ  →  ព្រ       ព ្ រ  →  ព្រ

const COENG_GAP_RIGHT = new RegExp(`([${BASE}])${COENG}${GAP}([${CONSONANT}])`, "gu");
const COENG_GAP_LEFT = new RegExp(`([${BASE}])${GAP}${COENG}([${CONSONANT}])`, "gu");
const COENG_GAP_BOTH = new RegExp(`([${BASE}])${GAP}${COENG}${GAP}([${CONSONANT}])`, "gu");

// ── Rule 2 — orphan dependent vowels ─────────────────────────────────────────
// A dependent vowel cannot begin a syllable, so the base before the gap is the
// only thing it can belong to.
//
//   ស្ថ ា ន  →  ស្ថាន      គ្រ ូ  →  គ្រូ
//
// The left side may already carry a vowel (ើ is two code points in some
// sequences), so a dependent vowel is admitted as a left context too.

const ORPHAN_VOWEL = new RegExp(`([${BASE}${DEP_VOWEL}])${GAP}([${DEP_VOWEL}])`, "gu");

// ── Rule 3 — orphan signs ────────────────────────────────────────────────────
// Same forcing: a sign attaches to the base on its left and cannot start a
// syllable.
//
//   គ ំ  →  គំ        ាំ, ុះ, ់ …

const ORPHAN_SIGN = new RegExp(`([${BASE}${DEP_VOWEL}])${GAP}([${SIGN}])`, "gu");

// ── Rule 4 — glyph spacing (opt-in) ──────────────────────────────────────────
// Consonant + space + consonant. NOT forced — see the header. Applied only
// when asked for, and only to text that shows the pattern at a scale no
// ordinary Khmer prose reaches.

const GLYPH_SPACED = new RegExp(`([${BASE}${DEP_VOWEL}${SIGN}])${GAP}([${BASE}])`, "gu");

/** Any Khmer-block character that carries linguistic content. */
const KHMER_ANY = /[ក-៿]/u;
/** A run of Khmer characters, for the glyph-spacing gate. */
const KHMER_RUN = /[ក-៿]+/gu;

// ── Orthographic legality — the INDEPENDENT check ────────────────────────────

/** One way a Khmer code point sequence can be impossible. */
export type OrthographicViolation =
  /** A dependent vowel with no base to its left. */
  | "orphan_vowel"
  /** Two dependent vowels in a row — a syllable carries at most one. */
  | "double_vowel"
  /** A coeng not followed by a consonant, or not preceded by a base. */
  | "dangling_coeng"
  /** A sign with no base to its left. */
  | "orphan_sign";

export interface OrthographyReport {
  /** Total impossible sequences found. */
  violations: number;
  /** Khmer letters examined — the denominator for a rate. */
  khmerLetters: number;
  byKind: Record<OrthographicViolation, number>;
}

const RE_CONSONANT = /[ក-អ]/u;
const RE_BASE = /[ក-ឳ]/u;
const RE_DEP_VOWEL = /[ា-ៅ]/u;
const RE_SIGN = /[ំ-៍៏-៑៓]/u;

/**
 * Count sequences Khmer orthography does not permit.
 *
 * THIS IS THE CHECK THAT DOES NOT MOVE BY CONSTRUCTION, and that is the whole
 * reason it exists. `analyzeTextHealth`'s verdict is satisfied by removing
 * spaces, and removing spaces is exactly what the repair does — so a health
 * flip from `damaged` to `healthy` proves the repair RAN, not that it was
 * right. A rule that glued the wrong things together would still produce a
 * healthy-looking page.
 *
 * This asks a different question: is the result a legal Khmer code point
 * sequence? A reckless repair CREATES violations (two vowels on one base, a
 * coeng with nothing under it); a forced one removes them. The repair is gated
 * on this never rising — see `reassembleKhmerText`.
 *
 * It is still not proof that the WORDS are right. A vowel that belonged to the
 * consonant after the gap would attach to the one before it and be perfectly
 * legal. Only a Khmer reader can close that gap, and this module does not
 * claim to.
 */
export function countOrthographicViolations(text: string): OrthographyReport {
  const byKind: Record<OrthographicViolation, number> = {
    orphan_vowel: 0,
    double_vowel: 0,
    dangling_coeng: 0,
    orphan_sign: 0,
  };
  let khmerLetters = 0;

  const chars = [...(text ?? "")];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (!KHMER_ANY.test(c)) continue;
    khmerLetters++;
    const prev = chars[i - 1] ?? "";
    const next = chars[i + 1] ?? "";

    if (RE_DEP_VOWEL.test(c)) {
      if (RE_DEP_VOWEL.test(prev)) byKind.double_vowel++;
      else if (!RE_BASE.test(prev) && !RE_SIGN.test(prev)) byKind.orphan_vowel++;
      continue;
    }
    if (c === COENG) {
      // Legal only as <base> ្ <consonant>.
      if (!RE_BASE.test(prev) || !RE_CONSONANT.test(next)) byKind.dangling_coeng++;
      continue;
    }
    if (RE_SIGN.test(c)) {
      if (!RE_BASE.test(prev) && !RE_DEP_VOWEL.test(prev) && !RE_SIGN.test(prev)) byKind.orphan_sign++;
      continue;
    }
  }

  return {
    violations: byKind.orphan_vowel + byKind.double_vowel + byKind.dangling_coeng + byKind.orphan_sign,
    khmerLetters,
    byKind,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface ReassembleOptions {
  /**
   * Collapse spaces between two CONSONANTS as well (rule 4).
   *
   * Off by default and it should stay off for a bulk run: unlike rules 1–3
   * this one is not forced by the script — a space between consonants may be
   * glyph spacing or a real phrase break, and the text does not say which.
   * It is worth 2 of the 86 catalogued damaged books.
   */
  collapseGlyphSpacing?: boolean;
}

export interface ReassembleResult {
  text: string;
  /** Individual gaps closed. */
  changes: number;
  modified: boolean;
  /** Impossible sequences before and after — the independent check. */
  violationsBefore: number;
  violationsAfter: number;
  /**
   * True when the repair was DISCARDED because it made the text less legal
   * than it found it. `text` is then the input, untouched.
   */
  rejected: boolean;
}

/** Replace with a counter, so a pass reports how much it actually did. */
function replaceCounting(src: string, re: RegExp, to: string): [string, number] {
  let count = 0;
  const out = src.replace(re, (...args) => {
    count++;
    return to.replace(/\$(\d)/g, (_, n) => String(args[Number(n)] ?? ""));
  });
  return [out, count];
}

/**
 * Does this text show glyph spacing at a scale ordinary Khmer never reaches?
 *
 * Khmer does not put spaces between words, so a page where most Khmer runs are
 * one or two characters long was recovered glyph by glyph. Ordinary prose runs
 * far longer — measured over production, readable pages have a mean Khmer run
 * of about 6 characters and damaged ones about 2.
 */
export function hasGlyphSpacing(text: string): boolean {
  const runs = (text ?? "").match(KHMER_RUN) ?? [];
  if (runs.length < 10) return false;
  const stubs = runs.filter((r) => [...r].length <= 2).length;
  return stubs / runs.length > 0.5;
}

/**
 * Reconnect fragmented Khmer by closing the gaps inside syllables.
 *
 * Whitespace is only ever REMOVED, and only between code points that Khmer
 * orthography says belong to one syllable. No code point is added, removed or
 * substituted, so the operation is information-preserving and reversible in
 * principle.
 *
 * The result is gated on `countOrthographicViolations` not rising. That gate
 * has never fired on the catalogued corpus — it is there because a repair that
 * can only be checked by the thing it optimises needs a second opinion, and
 * because the day someone adds a sixth rule is the day it earns its place.
 */
export function reassembleKhmerText(input: string, opts: ReassembleOptions = {}): ReassembleResult {
  const source = typeof input === "string" ? input : "";
  const before = countOrthographicViolations(source).violations;
  const unchanged = (why: Partial<ReassembleResult> = {}): ReassembleResult => ({
    text: source,
    changes: 0,
    modified: false,
    violationsBefore: before,
    violationsAfter: before,
    rejected: false,
    ...why,
  });

  if (!source || !KHMER_ANY.test(source)) return unchanged();

  let text = source;
  let changes = 0;

  // Rule 1 — coeng. Both-sides first: the narrower patterns would each consume
  // half of it and leave a gap behind.
  for (const re of [COENG_GAP_BOTH, COENG_GAP_LEFT, COENG_GAP_RIGHT]) {
    const [out, n] = replaceCounting(text, re, `$1${COENG}$2`);
    text = out;
    changes += n;
  }

  // Rules 2 and 3 — vowels, then signs. Iterated because closing one gap can
  // expose the next ("ស្ថ ា ន ី"), and bounded because a rule that has not
  // converged in a handful of passes is looping, not working.
  for (const re of [ORPHAN_VOWEL, ORPHAN_SIGN]) {
    for (let pass = 0; pass < 5; pass++) {
      const [out, n] = replaceCounting(text, re, "$1$2");
      text = out;
      changes += n;
      if (n === 0) break;
    }
  }

  // Rule 4 — opt-in, and only where the pattern is unmistakable.
  if (opts.collapseGlyphSpacing && hasGlyphSpacing(text)) {
    for (let pass = 0; pass < 10; pass++) {
      const [out, n] = replaceCounting(text, GLYPH_SPACED, "$1$2");
      text = out;
      changes += n;
      if (n === 0) break;
    }
  }

  // A sentence break is not intra-syllable spacing. Restored rather than
  // prevented, because ។ can carry a sign and the rules above legitimately
  // reach across it while attaching one.
  text = text.replace(new RegExp(`([${SENTENCE_END}])([^\\s])`, "gu"), "$1 $2");

  const after = countOrthographicViolations(text).violations;
  if (after > before) {
    // The repair made the text less legal than it found it. Keep the original
    // and say so — a caller that writes this to the database needs to know the
    // difference between "nothing to do" and "refused".
    return unchanged({ rejected: true, violationsAfter: after });
  }

  return {
    text,
    changes,
    modified: text !== source,
    violationsBefore: before,
    violationsAfter: after,
    rejected: false,
  };
}
