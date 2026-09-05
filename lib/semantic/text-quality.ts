/* lib/semantic/text-quality.ts
 *
 * Is this extracted text good enough to build anything on?
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 *
 * `resource_index_state` (0133) answers "did extraction run, and what
 * happened". It cannot answer "is what we extracted actually the text of the
 * document", and for this collection those are different questions with
 * different answers. Nineteen of the ninety-nine Khmer-dominant books in
 * production are recorded as `indexed` — correctly, extraction succeeded —
 * while holding text no reader would recognise:
 *
 *     stored:  យុ ទ ស ប េ ងៀ ន ទំ េនើ ប
 *     actual:  យុទ្ធសាស្ត្របង្រៀនទំនើប
 *
 * That is a PDF built with a legacy non-Unicode Khmer font: pdf.js recovers
 * glyph positions faithfully and the character encoding not at all. The result
 * is not low-quality text, it is wrong text, and publishing anything derived
 * from it — a topic, a page reference, a summary — would be publishing a
 * fabrication about a real document.
 *
 * ── Why orthography and not a language model ─────────────────────────────────
 *
 * Khmer has hard encoding rules, so damage is DECIDABLE rather than estimable:
 * a coeng (U+17D2) that is not followed by a consonant is not unusual text, it
 * is impossible text. Three independent damage modes were found in production
 * and each one violates a different rule, which is why one signal is not
 * enough:
 *
 *   1. dropped coeng   — គេហសេដ្ឋកិច្ចវិទ្យា: coeng density ~0, vowels missing
 *   2. detached coeng  — សត្តវិទ្យា: coeng present but spaced off one side
 *   3. legacy Latin    — រុក្ខវិទ្យា: Ǥ ų ǂ ƹ — Latin-Extended/IPA code points
 *                        emitted inside Khmer runs by a legacy font's cmap
 *
 * Mode 2 is why coeng density alone was rejected: that book scores a perfectly
 * healthy 0.074 and is unreadable.
 *
 * Pure and browser-safe on purpose — no DB, no server-only imports — so the
 * calibration script, the unit tests and the build pipeline all exercise the
 * same functions. Thresholds in CALIBRATION are measured, not guessed; see
 * `scripts/semantic-corpus-report.ts`.
 */

// ── Khmer code point ranges (Unicode 15, block U+1780–U+17FF) ────────────────

const KH_CONSONANT_LO = 0x1780; // ក
const KH_CONSONANT_HI = 0x17a2; // អ
const KH_INDEP_VOWEL_LO = 0x17a3;
const KH_INDEP_VOWEL_HI = 0x17b3;
const KH_DEP_VOWEL_LO = 0x17b6;
const KH_DEP_VOWEL_HI = 0x17c5;
const KH_SIGN_LO = 0x17c6;
const KH_SIGN_HI = 0x17dd;
const KH_DIGIT_LO = 0x17e0;
const KH_DIGIT_HI = 0x17e9;

/** U+17D2 KHMER SIGN COENG — the subscript marker. Always followed by a
 *  consonant in well-formed text; never by a space, a vowel or end-of-run. */
const COENG = 0x17d2;

const isKhmerConsonant = (cp: number) => cp >= KH_CONSONANT_LO && cp <= KH_CONSONANT_HI;
const isKhmerIndepVowel = (cp: number) => cp >= KH_INDEP_VOWEL_LO && cp <= KH_INDEP_VOWEL_HI;
const isKhmerDepVowel = (cp: number) => cp >= KH_DEP_VOWEL_LO && cp <= KH_DEP_VOWEL_HI;
const isKhmerSign = (cp: number) => cp >= KH_SIGN_LO && cp <= KH_SIGN_HI;
const isKhmerDigit = (cp: number) => cp >= KH_DIGIT_LO && cp <= KH_DIGIT_HI;

/** Any code point in the Khmer block that carries linguistic content. */
const isKhmerLetter = (cp: number) =>
  isKhmerConsonant(cp) || isKhmerIndepVowel(cp) || isKhmerDepVowel(cp) || isKhmerSign(cp);

/**
 * Code points a legacy Khmer font emits when its glyphs are mapped through
 * Latin-1 Supplement / Latin Extended-A/B / IPA rather than the Khmer block.
 *
 * ASCII is excluded — real Khmer documents quote English constantly, and this
 * collection's Khmer titles routinely carry a Latin subtitle. What no genuine
 * Khmer sentence contains is `Ǥ` (U+01E4) or `ƹ` (U+01B9) sitting between two
 * Khmer consonants.
 */
const isLegacyFontArtefact = (cp: number) =>
  (cp >= 0x00c0 && cp <= 0x024f) || // Latin-1 letters, Latin Extended-A/B
  (cp >= 0x0250 && cp <= 0x02af) || // IPA extensions
  (cp >= 0xe000 && cp <= 0xf8ff);   // Private Use Area

export type ScriptClass = "khmer" | "latin" | "mixed" | "unknown";

export type TextHealth = {
  script: ScriptClass;
  /** Characters examined. */
  length: number;
  /** Khmer letters ÷ length. */
  khmerRatio: number;
  /** Coeng marks ÷ Khmer consonants. Healthy Khmer prose runs ~0.04–0.12. */
  coengDensity: number;
  /** Coeng marks not attached on both sides ÷ coeng marks. Orthographically
   *  impossible, so anything above a rounding error is damage. */
  danglingCoengRatio: number;
  /** Dependent vowel signs with no consonant to attach to ÷ dependent vowels. */
  orphanVowelRatio: number;
  /** Legacy-font code points adjacent to Khmer ÷ Khmer letters. */
  legacyArtefactRatio: number;
  /** Spaces ÷ length, measured only inside Khmer runs. Khmer does not space
   *  between words, so a high value means glyph-level spacing was recovered
   *  instead of text. */
  khmerSpaceRatio: number;
  /** Letters (any script) ÷ length — separates prose from tables of numbers. */
  letterRatio: number;
  verdict: "healthy" | "damaged" | "unknown";
  /** Which rule condemned it. Empty when healthy. */
  reasons: TextDamageReason[];
};

export type TextDamageReason =
  | "khmer-coeng-missing"
  | "khmer-coeng-detached"
  | "khmer-vowels-orphaned"
  | "khmer-legacy-font"
  | "khmer-glyph-spacing";

/**
 * Measured thresholds. Every value was chosen from the distribution over the
 * production collection rather than from first principles — see the audit,
 * §4, and re-derive with `npx tsx scripts/semantic-corpus-report.ts --calibrate`
 * if the collection changes materially.
 */
export const CALIBRATION = {
  /** Below this share of Khmer letters, the Khmer rules do not apply. */
  khmerScriptFloor: 0.15,
  /** Below this share of Latin letters, the text is not Latin-dominant. */
  latinScriptFloor: 0.15,
  /** Healthy Khmer measured 0.043–0.118; every damaged book measured ≤ 0.011. */
  minCoengDensity: 0.02,
  /** A well-formed document has zero. Allow for a stray mark in a glossary. */
  maxDanglingCoengRatio: 0.05,
  /** Vowel signs with nothing to attach to. Same reasoning. */
  maxOrphanVowelRatio: 0.05,
  /** One artefact per hundred Khmer letters is already a broken cmap. */
  maxLegacyArtefactRatio: 0.01,
  /** Healthy Khmer pages measured 0.11–0.28; glyph-spaced pages 0.34–0.39. */
  maxKhmerSpaceRatio: 0.32,
  /** Text with fewer letters than this is a table, an index or page furniture. */
  minLetterRatio: 0.45,
  /** Nothing shorter is worth measuring — the ratios are noise. */
  minSampleLength: 200,
} as const;

/**
 * Script health of a body of extracted text.
 *
 * Give it a SAMPLE, not a whole book: a few thousand characters drawn from the
 * body of the document is enough for every ratio here to converge, and the
 * damage modes are properties of the font, so they are uniform across a file.
 */
export function analyzeTextHealth(raw: string): TextHealth {
  const text = raw ?? "";
  const length = text.length;

  let khmerLetters = 0;
  let khmerConsonants = 0;
  let coeng = 0;
  let danglingCoeng = 0;
  let depVowels = 0;
  let orphanVowels = 0;
  let legacyArtefacts = 0;
  let latinLetters = 0;
  let letters = 0;
  let khmerRunChars = 0;
  let khmerRunSpaces = 0;

  const cps = [...text].map((c) => c.codePointAt(0) ?? 0);

  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    const prev = i > 0 ? cps[i - 1] : 0;
    const next = i + 1 < cps.length ? cps[i + 1] : 0;

    if (isKhmerLetter(cp) || isKhmerDigit(cp)) {
      if (isKhmerLetter(cp)) khmerLetters++;
      if (isKhmerConsonant(cp)) khmerConsonants++;
      letters++;
      khmerRunChars++;

      if (cp === COENG) {
        coeng++;
        // Two rules with no exceptions: a coeng subscripts the consonant that
        // FOLLOWS it, and attaches to the cluster that PRECEDES it. Either
        // side separated by a space is impossible text, and both halves are
        // load-bearing — `សម ែែ ប់` (for សម្រាប់) breaks only the first,
        // `មនុស ្រ ស` (for មនុស្ស) only the second.
        if (!isKhmerConsonant(next) && !isKhmerIndepVowel(next)) danglingCoeng++;
        else if (!isKhmerLetter(prev)) danglingCoeng++;
      } else if (isKhmerDepVowel(cp)) {
        depVowels++;
        // A dependent vowel attaches to the consonant cluster before it. A
        // preceding space, punctuation or run boundary means the consonant
        // was dropped by the extractor.
        const attachable =
          isKhmerConsonant(prev) || isKhmerIndepVowel(prev) || isKhmerDepVowel(prev) || isKhmerSign(prev);
        if (!attachable) orphanVowels++;
      }
      continue;
    }

    if (isLegacyFontArtefact(cp)) {
      // Only counts as evidence when it sits inside Khmer text; a French name
      // in an English bibliography is not a broken font.
      if (isKhmerLetter(prev) || isKhmerLetter(next)) legacyArtefacts++;
      letters++;
      continue;
    }

    if (cp === 0x20) {
      // Attribute the space to a Khmer run only when Khmer is on both sides.
      if (isKhmerLetter(prev) && isKhmerLetter(next)) {
        khmerRunSpaces++;
        khmerRunChars++;
      }
      continue;
    }

    if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) {
      latinLetters++;
      letters++;
    }
  }

  const khmerRatio = length > 0 ? khmerLetters / length : 0;
  const latinRatio = length > 0 ? latinLetters / length : 0;

  const script: ScriptClass =
    khmerRatio >= CALIBRATION.khmerScriptFloor && latinRatio >= CALIBRATION.latinScriptFloor
      ? "mixed"
      : khmerRatio >= CALIBRATION.khmerScriptFloor
        ? "khmer"
        : latinRatio >= CALIBRATION.latinScriptFloor
          ? "latin"
          : "unknown";

  const health: Omit<TextHealth, "verdict" | "reasons"> = {
    script,
    length,
    khmerRatio,
    coengDensity: khmerConsonants > 0 ? coeng / khmerConsonants : 0,
    danglingCoengRatio: coeng > 0 ? danglingCoeng / coeng : 0,
    orphanVowelRatio: depVowels > 0 ? orphanVowels / depVowels : 0,
    legacyArtefactRatio: khmerLetters > 0 ? legacyArtefacts / khmerLetters : 0,
    khmerSpaceRatio: khmerRunChars > 0 ? khmerRunSpaces / khmerRunChars : 0,
    letterRatio: length > 0 ? letters / length : 0,
  };

  const reasons: TextDamageReason[] = [];

  // Too little to judge. "unknown" is a distinct answer from "damaged": one
  // says we cannot tell, the other says we can and it is broken. Only the
  // second is a finding about the document.
  if (length < CALIBRATION.minSampleLength) {
    return { ...health, verdict: "unknown", reasons };
  }

  // The Khmer rules apply only to Khmer text. Latin extraction fails in ways
  // this module does not claim to detect, and asserting otherwise would give
  // a false clean bill of health to the English half of the collection —
  // which is why `analyzeTextHealth` reports "healthy" for Latin only in the
  // weak sense of "no Khmer damage found".
  if (script === "khmer" || script === "mixed") {
    if (health.legacyArtefactRatio > CALIBRATION.maxLegacyArtefactRatio) reasons.push("khmer-legacy-font");
    if (health.coengDensity < CALIBRATION.minCoengDensity) reasons.push("khmer-coeng-missing");
    if (health.danglingCoengRatio > CALIBRATION.maxDanglingCoengRatio) reasons.push("khmer-coeng-detached");
    if (health.orphanVowelRatio > CALIBRATION.maxOrphanVowelRatio) reasons.push("khmer-vowels-orphaned");
    if (health.khmerSpaceRatio > CALIBRATION.maxKhmerSpaceRatio) reasons.push("khmer-glyph-spacing");
  }

  return { ...health, verdict: reasons.length > 0 ? "damaged" : "healthy", reasons };
}
