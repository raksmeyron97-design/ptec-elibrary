// lib/ai/spellcheck.ts
// Correcting a reader's typo against the vocabulary the CORPUS actually uses.
// Pure — no I/O, no model call, no database. The vocabulary is precomputed
// (lib/ai/corpus-vocabulary.json, built by scripts/build-corpus-vocabulary.ts)
// so a correction costs a map lookup and a bounded scan, never a query.
//
// THE CASE THIS EXISTS FOR
// ────────────────────────
// `What is validty?` is the one question AI Brain 2.0 left failing, and the
// reason is structural rather than incidental. The lexical leg requires every
// term of a short topic to appear on a page (`requiredTerms`), and no page in
// the collection contains "validty"; the semantic leg embeds the misspelling,
// whose vector sits below the 0.70 chunk floor. So both legs return nothing
// and the assistant refuses — correctly, under its own rules, to a reader who
// asked a question the library can answer from forty different books.
//
// The library's existing typo tolerance is `search_library_fuzzy`, a trigram
// RPC over TITLES. It cannot help here: "validity" is not a title, it is a
// word printed on 2,000 pages.
//
// WHY NOT ASK THE MODEL
// ─────────────────────
// A model would correct this and much else, and it would cost a generation
// call on EVERY query, put a non-deterministic step in front of a pipeline
// whose whole design is deterministic-until-proven-otherwise, and make the
// correction unexplainable to the operator reading a trace. §11 of the brief
// forbids it and it would be the wrong engineering anyway.
//
// WHAT A CORRECTION IS ALLOWED TO DO
// ──────────────────────────────────
// Never to replace the reader's question. `original` is always preserved and
// always retrieved for; a correction only ever ADDS a term to look for, and
// only at HIGH confidence does it also change the text that gets embedded.
// That asymmetry is deliberate: a wrong lexical term costs one extra `ilike`
// that matches nothing, while a wrong embedding silently retrieves a different
// subject and looks exactly like a right one.
//
// KHMER IS NOT ENGLISH, AND THE DIFFERENCE IS NOT COSMETIC
// ────────────────────────────────────────────────────────
// Khmer is written without spaces, so there is no such thing as "the Khmer
// word that was misspelt" without a segmenter this repository does not have
// and should not grow. A whitespace run of Khmer is a phrase, not a word, and
// edit distance over phrases corrects nothing reliably. So the Khmer
// vocabulary is drawn ONLY from entity strings — titles, author names,
// subjects — which are discrete by construction, and the engine never
// proposes a Latin candidate for a Khmer token or the reverse. A Khmer term
// with no entity match is left exactly as the reader wrote it. This is a
// stated limit, not an oversight: see docs/AI-BRAIN-2-1-EVALUATION-AUDIT.md.

/** One term the corpus uses, with how widely it is used. */
export interface VocabularyEntry {
  term: string;
  /** Distinct records the term appears in. The weight — a term in 40 books is vocabulary. */
  records: number;
  /** Which script it belongs to; a candidate never crosses this line. */
  script: "latin" | "khmer";
  /** Where it came from, for the diagnostic reason string. */
  source: "page_text" | "entity";
}

export interface Vocabulary {
  generatedAt: string;
  /** Records scanned, so a stale vocabulary is visible rather than assumed. */
  corpusRecords: number;
  entries: readonly VocabularyEntry[];
}

export type CorrectionConfidence = "high" | "medium" | "low";

export interface TermCorrection {
  original: string;
  candidate: string;
  distance: number;
  confidence: number;
  band: CorrectionConfidence;
  /** One sentence a person can argue with. */
  reason: string;
  /**
   * Other words the corpus uses that are exactly as close, when the
   * misspelling is genuinely ambiguous: "practicl" is one edit from both
   * `practical` (94 records) and `practice` (101), and letting a 7% frequency
   * difference silently pick one is a guess dressed as a decision. These are
   * looked for TOO — one extra `ilike` each — and never embedded.
   */
  alternatives: string[];
}

export interface QueryCorrection {
  /** Exactly as the reader typed it. Never discarded. */
  originalQuery: string;
  /** The query with HIGH-confidence corrections applied — what gets embedded. */
  correctedQuery: string;
  /** Every correction proposed, whatever its band. */
  corrections: readonly TermCorrection[];
  /**
   * Extra terms the lexical leg should ALSO look for. High and medium bands
   * both contribute; low contributes nothing.
   */
  alternativeTerms: readonly string[];
  /** The strongest confidence proposed, for the trace. 0 when nothing was. */
  confidence: number;
}

/**
 * A term shorter than this is never corrected, in either direction.
 *
 * Six, and the sixth character was bought with a false correction: at five
 * the engine turned "aortic VALVE replacement" into "aortic VALUE replacement"
 * — `valve` is a perfectly good English word this collection happens not to
 * use, `value` is one edit away and used everywhere, and the correction was
 * high-confidence. That is the shape of the only real danger here: a
 * corpus vocabulary is not a dictionary, and it cannot tell "a word you
 * mistyped" from "a word this library has never needed". One edit in a
 * five-letter word is too often a different word for the guess to be worth
 * making; by six letters the odds have turned.
 */
const MIN_TERM_LENGTH = 6;
/** Above this length a token is an artefact, not a word someone mistyped. */
const MAX_TERM_LENGTH = 28;
/**
 * A PAGE-TEXT term the corpus uses in fewer records than this is not
 * vocabulary to correct to — below three books it is as likely an OCR artefact
 * as a word. It does NOT apply to entity terms: a book title is a curated
 * string that exists once by definition, and refusing to correct toward it
 * because it is rare would discard the whole reason the catalogue is in the
 * vocabulary.
 */
export const MIN_CANDIDATE_RECORDS = 3;

/** Confidence at or above which the correction also changes what is embedded. */
export const HIGH_CONFIDENCE = 0.86;
/** Below this nothing is proposed at all and the query travels untouched. */
export const MEDIUM_CONFIDENCE = 0.72;
/** How many equally-close readings of one misspelling are worth looking for. */
export const MAX_AMBIGUOUS_ALTERNATIVES = 2;

const KHMER_CHAR = /[ក-៿]/u;
const LATIN_WORD = /^[a-z][a-z'-]*$/;

export function scriptOf(term: string): "latin" | "khmer" | "other" {
  if (KHMER_CHAR.test(term)) return "khmer";
  if (LATIN_WORD.test(term.toLowerCase())) return "latin";
  return "other";
}

/**
 * Damerau–Levenshtein distance, bounded.
 *
 * Transposition is included because it is the commonest typing error and the
 * one plain Levenshtein charges double for: "Essentails" → "Essentials" is one
 * transposition and two substitutions, and the v2 fixture's typo question is
 * exactly that. Returns `max + 1` as soon as the distance cannot come in under
 * the bound, so a scan over thousands of terms stays cheap.
 */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  // Three rows: i−2, i−1 and i. The i−2 row is what makes transposition a
  // single edit rather than two substitutions.
  let twoBack: number[] = [];
  let oneBack: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  let row: number[] = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    row[0] = i;
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(row[j - 1] + 1, oneBack[j] + 1, oneBack[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, twoBack[j - 2] + 1);
      }
      row[j] = v;
      if (v < best) best = v;
    }
    // Every remaining cell is at least `best`, so the answer cannot come in
    // under the bound: stop rather than finish the matrix.
    if (best > max) return max + 1;
    twoBack = oneBack;
    oneBack = row;
    row = new Array<number>(b.length + 1);
  }
  return oneBack[b.length] > max ? max + 1 : oneBack[b.length];
}

/**
 * How confident we are that `candidate` is what the reader meant by `term`.
 *
 * WHETHER to correct, not WHICH candidate to correct to — those are different
 * questions and conflating them picked the wrong word. Three signals, each of
 * which a person can check:
 *   similarity   1 − distance ÷ length. The base, and never enough alone.
 *   first letter typists rarely mistype the first character, and a candidate
 *                that changes it is usually a different word.
 *   length       a candidate a lot longer or shorter is a different word.
 *
 * Corpus frequency is deliberately NOT here. It belongs to the ranking (see
 * `correctTerm`), because how often the collection uses a word says nothing
 * about how likely a particular misspelling was to be produced.
 */
export function correctionConfidence(term: string, entry: VocabularyEntry, distance: number): number {
  const len = Math.max(term.length, entry.term.length);
  const similarity = 1 - distance / len;
  const firstLetter = term[0] === entry.term[0] ? 0.06 : -0.14;
  const lengthPenalty = -Math.min(0.12, Math.abs(term.length - entry.term.length) * 0.04);
  return Math.max(0, Math.min(1, similarity + firstLetter + lengthPenalty));
}

export function bandOf(confidence: number): CorrectionConfidence {
  if (confidence >= HIGH_CONFIDENCE) return "high";
  if (confidence >= MEDIUM_CONFIDENCE) return "medium";
  return "low";
}

/**
 * A 26-bit mask of which a–z letters a term contains.
 *
 * The cheap prefilter: two words within `d` edits cannot differ by more than
 * `d` distinct letters, so a mask comparison rejects almost every candidate
 * before the quadratic distance runs. Measured, this is what takes a query
 * carrying one unknown word from 19 ms to well under 1 ms. Zero for anything
 * that is not a–z, which disables the filter for Khmer — whose buckets are a
 * few hundred entries, not a few thousand.
 */
function letterMask(term: string): number {
  let mask = 0;
  for (let i = 0; i < term.length; i++) {
    const c = term.charCodeAt(i) - 97;
    if (c < 0 || c > 25) return 0;
    mask |= 1 << c;
  }
  return mask;
}

function popcount(n: number): number {
  let x = n - ((n >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

interface IndexedEntry extends VocabularyEntry {
  mask: number;
}

/** A vocabulary prepared for lookup: an exact-match set plus a per-length index. */
export interface PreparedVocabulary {
  known: ReadonlySet<string>;
  byLength: ReadonlyMap<number, readonly IndexedEntry[]>;
  corpusRecords: number;
  size: number;
}

export function prepareVocabulary(vocab: Vocabulary): PreparedVocabulary {
  const known = new Set<string>();
  const byLength = new Map<number, IndexedEntry[]>();
  for (const e of vocab.entries) {
    known.add(e.term);
    const indexed: IndexedEntry = { ...e, mask: letterMask(e.term) };
    const bucket = byLength.get(e.term.length);
    if (bucket) bucket.push(indexed);
    else byLength.set(e.term.length, [indexed]);
  }
  return { known, byLength, corpusRecords: vocab.corpusRecords, size: known.size };
}

/**
 * The best correction for ONE term, or null.
 *
 * Only lengths within the distance bound are scanned, which is what keeps this
 * a few thousand comparisons rather than a scan of the whole vocabulary.
 */
export function correctTerm(term: string, vocab: PreparedVocabulary): TermCorrection | null {
  const lower = term.toLowerCase();
  const script = scriptOf(lower);
  if (script === "other") return null;
  if (lower.length < MIN_TERM_LENGTH || lower.length > MAX_TERM_LENGTH) return null;
  // A term the corpus already uses is not a typo, whatever it looks like.
  if (vocab.known.has(lower)) return null;

  // One edit, unless the word is long enough that two is still the same word.
  //
  // The threshold is 9 and it came from a false correction: at 7 the engine
  // offered `cardiac` → `cardiff` (a city, in 3 records) at medium confidence,
  // on a question about heart surgery that the collection cannot answer and
  // must refuse. Two edits in a seven-letter word is a different word, and a
  // typo layer that manufactures evidence for an unanswerable question is
  // worse than no typo layer. Nearly every real single typo is one edit
  // anyway — Damerau counts a transposition as one.
  const maxDistance = lower.length >= 9 ? 2 : 1;

  const mask = letterMask(lower);
  let best: { entry: VocabularyEntry; distance: number } | null = null;
  const nearest: VocabularyEntry[] = [];
  let nearestDistance = maxDistance + 1;
  for (let len = lower.length - maxDistance; len <= lower.length + maxDistance; len++) {
    for (const entry of vocab.byLength.get(len) ?? []) {
      if (entry.script !== script) continue;
      if (entry.source === "page_text" && entry.records < MIN_CANDIDATE_RECORDS) continue;
      // Letters the two words do not share, before the quadratic distance.
      if (mask && entry.mask && popcount(mask ^ entry.mask) > maxDistance * 2) continue;
      const distance = editDistance(lower, entry.term, maxDistance);
      if (distance > maxDistance) continue;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest.length = 0;
      }
      if (distance === nearestDistance) nearest.push(entry);
      // RANKING, and its order is the whole reason this is separate from
      // confidence. Nearest first; then the word the collection actually uses.
      //
      // Measured: "validty" is one edit from both `validly` (3 records) and
      // `validity` (72 of 249). Scoring them together let a 0.04 length
      // penalty outweigh the frequency difference and the assistant answered
      // a question about VALIDITY from pages containing "validly". How often
      // a collection uses a word is the strongest available prior for which
      // word a reader meant; it is a poor one for whether they mistyped at
      // all, which is why it appears here and not in the confidence.
      if (
        best &&
        !(
          distance < best.distance ||
          (distance === best.distance && entry.records > best.entry.records) ||
          (distance === best.distance &&
            entry.records === best.entry.records &&
            Math.abs(entry.term.length - lower.length) < Math.abs(best.entry.term.length - lower.length))
        )
      ) {
        continue;
      }
      best = { entry, distance };
    }
  }
  if (!best) return null;

  const confidence = correctionConfidence(lower, best.entry, best.distance);
  return {
    original: term,
    candidate: best.entry.term,
    distance: best.distance,
    confidence: Number(confidence.toFixed(3)),
    band: bandOf(confidence),
    reason:
      `edit distance ${best.distance} from a term the corpus uses in ${best.entry.records} record(s)` +
      ` (${best.entry.source === "entity" ? "catalogue entity" : "page text"})`,
    // Every other word exactly as close, most-used first, minus the winner.
    // Bounded: an ambiguity with four readings is not an ambiguity worth
    // spending four clauses on.
    alternatives: nearest
      .filter((e) => e.term !== best!.entry.term)
      .sort((a, b) => b.records - a.records)
      .slice(0, MAX_AMBIGUOUS_ALTERNATIVES)
      .map((e) => e.term),
  };
}

/**
 * Tokens a correction may be attempted on. Khmer runs enter whole; see the
 * header.
 *
 * `\p{M}` is kept for the reason CLAUDE.md gives for the duplicate detector:
 * Khmer's vowel signs and the coeng are combining marks, and a split that
 * drops them leaves a consonant skeleton that matches nothing.
 */
export function correctableTokens(query: string): string[] {
  return query
    .split(/[^\p{L}\p{N}\p{M}'-]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= MIN_TERM_LENGTH && scriptOf(t.toLowerCase()) !== "other");
}

/**
 * Correct a whole query.
 *
 * Returns the reader's text untouched alongside the corrected form, and the
 * extra terms the lexical leg should also look for. Applying nothing is a
 * perfectly ordinary outcome and the commonest one.
 */
export function correctQuery(query: string, vocab: PreparedVocabulary): QueryCorrection {
  const corrections: TermCorrection[] = [];
  for (const token of correctableTokens(query)) {
    const c = correctTerm(token, vocab);
    if (c) corrections.push(c);
  }
  const applied = corrections.filter((c) => c.band !== "low");
  let correctedQuery = query;
  for (const c of corrections) {
    // Only HIGH confidence changes the text that will be embedded.
    if (c.band !== "high") continue;
    correctedQuery = correctedQuery.replace(
      new RegExp(`(^|[^\\p{L}])${c.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu"),
      (_m, a: string, b: string) => `${a}${c.candidate}${b}`,
    );
  }
  return {
    originalQuery: query,
    correctedQuery,
    corrections,
    alternativeTerms: [...new Set(applied.flatMap((c) => [c.candidate, ...c.alternatives]))],
    confidence: corrections.reduce((m, c) => Math.max(m, c.confidence), 0),
  };
}

/**
 * Every reading of the question worth LOOKING FOR, the reader's own first.
 *
 * One per applied correction plus one per tied alternative, capped — so an
 * ambiguous single word ("practicl") is searched as both `practical` and
 * `practice`, while a sentence with three corrections does not fan out into
 * eight queries. Only the FIRST corrected reading is ever embedded; these are
 * for the lexical leg, where an extra clause that matches nothing is free.
 */
export const MAX_READINGS = 3;

export function queryReadings(correction: QueryCorrection): string[] {
  const applied = correction.corrections.filter((c) => c.band !== "low");
  if (applied.length === 0) return [correction.originalQuery];
  const readings = [correction.correctedQuery];
  // Substitute one alternative at a time into the corrected reading: the
  // combinations beyond that are guesses about guesses.
  for (const c of applied) {
    for (const alt of c.alternatives) {
      if (readings.length >= MAX_READINGS) break;
      const swapped = correction.correctedQuery.replace(
        new RegExp(`(^|[^\\p{L}])${c.candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu"),
        (_m, a: string, b: string) => `${a}${alt}${b}`,
      );
      if (!readings.includes(swapped)) readings.push(swapped);
    }
  }
  return readings;
}
