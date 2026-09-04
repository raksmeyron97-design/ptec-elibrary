/**
 * What counts as a duplicate, and how strongly — the deterministic core.
 *
 * PRINCIPLE 1, ENFORCED HERE: no language model participates in this decision.
 * AI may DRAFT the metadata that arrives as `DuplicateQuery`, but every input
 * to the score below is a database fact or a pure function of one, so the
 * answer is reproducible, explainable, and testable offline.
 *
 * The output is a REASON CODE list, never a sentence. The upload form renders
 * them through next-intl in English or Khmer; putting English in here is how
 * half a feature ends up untranslatable.
 */

import {
  editionMarker,
  isMeaningfulAuthor,
  khmerDigitsToAscii,
  normalizeIsbn,
  normalizeTitle,
  personNameKey,
  titleWithoutEdition,
} from "./normalize";
import { characterRatio, isTitlePrefix, titleRemainders, titleSimilarity } from "./similarity";

/* ── Vocabulary ────────────────────────────────────────────────────────── */

export type DuplicateSignal =
  | "content_hash"
  | "isbn"
  | "exact_title"
  | "normalized_title"
  | "title_author"
  | "title_author_year"
  | "fuzzy_title"
  | "title_prefix";

export type DuplicateConfidence = "exact" | "high" | "medium" | "low";

/** Everything the UI may need to say about WHY, as translatable codes. */
export type DuplicateReason =
  | "sameFile"
  | "sameIsbn"
  | "sameTitle"
  | "similarTitle"
  | "titleContained"
  | "sameAuthor"
  | "sameYear"
  | "samePublisher"
  | "differentIsbn"
  | "differentEdition"
  | "differentYear";

/**
 * Score bands. §5 of the brief, as constants rather than numbers sprinkled
 * through a component — a business rule inside JSX is a business rule nobody
 * can find.
 */
export const DUPLICATE_THRESHOLDS = {
  /** 95–100: the same object. The save is refused. */
  blocking: 95,
  /** 80–94: almost certainly the same work. Override allowed, and recorded. */
  strong: 80,
  /** 60–79: worth a look before saving. Never blocks. */
  review: 60,
} as const;

/**
 * The ceiling for a match with no identifier evidence.
 *
 * A title, an author and a year — however well they agree — describe a WORK,
 * not a copy of a file. Two editions of one textbook agree on all three. Only
 * a shared content hash or a shared ISBN may reach the blocking band, so this
 * cap is what keeps "same title" from ever silently refusing a legitimate
 * second edition.
 */
const NON_IDENTIFIER_CEILING = 94;

export function confidenceForScore(score: number): DuplicateConfidence {
  if (score >= DUPLICATE_THRESHOLDS.blocking) return "exact";
  if (score >= DUPLICATE_THRESHOLDS.strong) return "high";
  if (score >= DUPLICATE_THRESHOLDS.review) return "medium";
  return "low";
}

/** A blocked save is one whose strongest match is an identifier match. */
export function isBlockingConfidence(confidence: DuplicateConfidence): boolean {
  return confidence === "exact";
}

/* ── Inputs ────────────────────────────────────────────────────────────── */

/** The record being created or edited. Every field optional but `title`. */
export type DuplicateQuery = {
  title: string;
  author?: string | null;
  isbn?: string | null;
  year?: number | null;
  publisher?: string | null;
  contentHash?: string | null;
  /** The book being edited, so a record never matches itself. */
  excludeBookId?: string | null;
};

/** A row the candidate query returned. Shaped to what the DB actually has. */
export type DuplicateCandidate = {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  isbn: string | null;
  year: number | null;
  publisher: string | null;
  contentHash: string | null;
  status: string | null;
  isPublished: boolean;
  coverUrl?: string | null;
};

export type DuplicateMatch = {
  bookId: string;
  slug: string;
  title: string;
  author: string | null;
  year: number | null;
  isbn: string | null;
  status: string | null;
  isPublished: boolean;
  coverUrl: string | null;
  /** 0–100. */
  score: number;
  confidence: DuplicateConfidence;
  signals: DuplicateSignal[];
  reasons: DuplicateReason[];
};

/* ── Scoring ───────────────────────────────────────────────────────────── */

/**
 * Title agreement, expressed as a base score plus the signal that produced it.
 * Split out because the edition/identifier adjustments below have to know
 * whether the titles were IDENTICAL or merely close.
 */
type TitleEvidence = {
  base: number;
  signal: DuplicateSignal | null;
  reason: DuplicateReason | null;
};

const NO_TITLE_EVIDENCE: TitleEvidence = { base: 0, signal: null, reason: null };

function titleEvidence(query: DuplicateQuery, candidate: DuplicateCandidate): TitleEvidence {
  const queryTitle = normalizeTitle(query.title);
  const candidateTitle = normalizeTitle(candidate.title);
  if (!queryTitle || !candidateTitle) return NO_TITLE_EVIDENCE;

  if (queryTitle === candidateTitle) {
    const identical = query.title.trim() === candidate.title.trim();
    return {
      base: 76,
      signal: identical ? "exact_title" : "normalized_title",
      reason: "sameTitle",
    };
  }

  // Two editions of one work, said plainly. The edition-awareness block in
  // scoreCandidate then demotes the pair out of the strong band — this only
  // establishes that they are the same TITLE, which is what the marker means.
  // Asserted here rather than left to string distance, which agreed only by
  // accident: "Mathematics, 2nd Edition" against "Mathematics, 3rd Edition" is
  // one character in twenty-three, but "Maths 2nd ed" against "Maths 3rd ed"
  // is one in twelve and would have fallen out of the band.
  const queryBase = titleWithoutEdition(query.title);
  const candidateBase = titleWithoutEdition(candidate.title);
  if (queryBase && queryBase === candidateBase) {
    return { base: 66, signal: "fuzzy_title", reason: "similarTitle" };
  }

  const similarity = titleSimilarity(queryTitle, candidateTitle);
  if (similarity >= 88) return { base: 66, signal: "fuzzy_title", reason: "similarTitle" };

  // The truncated-title duplicate: one record holds the full title, the other
  // was cut short. Similarity alone scores this low (a long subtitle is mostly
  // non-shared tokens), so it needs its own signal - and it stays weak on
  // purpose, because it is also exactly how a real series looks.
  if (isTitlePrefix(queryTitle, candidateTitle) || isTitlePrefix(candidateTitle, queryTitle)) {
    return { base: 58, signal: "title_prefix", reason: "titleContained" };
  }
  if (similarity >= 75) return { base: 52, signal: "fuzzy_title", reason: "similarTitle" };
  return NO_TITLE_EVIDENCE;
}

/**
 * Score one candidate against the record being saved.
 *
 * Returns null when nothing links them — the caller never has to filter noise,
 * and "no match" is one shape rather than a zero-scored object that some UI
 * eventually renders.
 */
export function scoreCandidate(
  query: DuplicateQuery,
  candidate: DuplicateCandidate,
): DuplicateMatch | null {
  if (query.excludeBookId && candidate.id === query.excludeBookId) return null;

  const signals: DuplicateSignal[] = [];
  const reasons: DuplicateReason[] = [];

  const match = (score: number): DuplicateMatch => ({
    bookId: candidate.id,
    slug: candidate.slug,
    title: candidate.title,
    author: candidate.author,
    year: candidate.year,
    isbn: candidate.isbn,
    status: candidate.status,
    isPublished: candidate.isPublished,
    coverUrl: candidate.coverUrl ?? null,
    score,
    confidence: confidenceForScore(score),
    signals,
    reasons,
  });

  // ── Identifier evidence: the only route to the blocking band ──────────
  if (query.contentHash && candidate.contentHash && query.contentHash === candidate.contentHash) {
    signals.push("content_hash");
    reasons.push("sameFile");
    return match(100);
  }

  const queryIsbn = normalizeIsbn(query.isbn);
  const candidateIsbn = normalizeIsbn(candidate.isbn);
  const sameIsbn = Boolean(queryIsbn && candidateIsbn && queryIsbn === candidateIsbn);
  if (sameIsbn) {
    signals.push("isbn");
    reasons.push("sameIsbn");
    if (normalizeTitle(query.title) === normalizeTitle(candidate.title)) {
      signals.push("normalized_title");
      reasons.push("sameTitle");
    }
    return match(97);
  }

  // ── Attribute evidence: a WORK looks the same; a COPY does not follow ──
  const title = titleEvidence(query, candidate);
  if (!title.signal || title.base === 0) return null;
  signals.push(title.signal);
  if (title.reason) reasons.push(title.reason);

  let score = title.base;

  const queryAuthor = isMeaningfulAuthor(query.author) ? personNameKey(query.author) : "";
  const candidateAuthor = isMeaningfulAuthor(candidate.author) ? personNameKey(candidate.author) : "";
  const sameAuthor = Boolean(queryAuthor && candidateAuthor && queryAuthor === candidateAuthor);
  if (sameAuthor) {
    score += 12;
    signals.push("title_author");
    reasons.push("sameAuthor");
  }

  const sameYear = Boolean(query.year && candidate.year && query.year === candidate.year);
  if (sameYear) {
    score += 6;
    reasons.push("sameYear");
    if (sameAuthor) signals.push("title_author_year");
  }

  const queryPublisher = normalizeTitle(query.publisher);
  const candidatePublisher = normalizeTitle(candidate.publisher);
  if (queryPublisher && candidatePublisher && queryPublisher === candidatePublisher) {
    score += 3;
    reasons.push("samePublisher");
  }

  // ── Series awareness: a grade/volume number is not a typo ─────────────
  //
  // This collection is largely school textbooks, and its most common
  // near-identical pair is consecutive volumes of one series:
  //   "សៀវភៅគណិតវិទ្យា ថ្នាក់ទី៧" / "…ថ្នាក់ទី៨", "Mathematics Grade 7" / "…8".
  // Character similarity puts those in the 90s, so without this rule every
  // textbook in a series warns against every other one, and a queue that
  // cries wolf on correct data is a queue librarians learn to click past.
  //
  // The test is narrow on purpose: the titles must be IDENTICAL once every
  // digit is removed, and their digit sequences must differ. A real duplicate
  // that differs by more than a number is unaffected.
  if (isSeriesVariant(query.title, candidate.title)) {
    return null;
  }

  // ── Boilerplate awareness: a shared frame is not shared identity ──────
  //
  // The sibling of the rule above, for the case where the thing that differs
  // is a WORD rather than a number. A curriculum series names every volume
  // "សៀវភៅណែនាំគ្រូបង្រៀន {SUBJECT} ថ្នាក់ទី{GRADE} (STEPSAM3)", so Chemistry
  // and Biology share 40+ characters and differ in three — which edit distance
  // reports as 94% alike, high enough to warn on every pair in the set. See
  // isDistinguishingVariant for why that is not a threshold problem.
  if (isDistinguishingVariant(query.title, candidate.title)) {
    return null;
  }

  // ── Edition awareness (§14): evidence AGAINST identity ────────────────
  //
  // Same title is not same book. Two facts say "different edition" loudly
  // enough to hold a match out of the strong band, and both are deterministic:
  // two DIFFERENT valid ISBNs cannot be one copy, and a declared edition
  // marker that disagrees is the cataloguer telling us so in the title.
  let ceiling = NON_IDENTIFIER_CEILING;

  if (queryIsbn && candidateIsbn && queryIsbn !== candidateIsbn) {
    reasons.push("differentIsbn");
    ceiling = Math.min(ceiling, DUPLICATE_THRESHOLDS.strong - 1);
  }

  const queryEdition = editionMarker(query.title);
  const candidateEdition = editionMarker(candidate.title);
  if (queryEdition !== candidateEdition) {
    reasons.push("differentEdition");
    ceiling = Math.min(ceiling, DUPLICATE_THRESHOLDS.strong - 1);
  }

  if (query.year && candidate.year && query.year !== candidate.year) {
    reasons.push("differentYear");
    // A year gap is weak evidence on its own (reprints share content), so it
    // subtracts rather than capping.
    score -= Math.abs(query.year - candidate.year) >= 2 ? 8 : 4;
  }

  score = Math.max(0, Math.min(ceiling, score));
  if (score < DUPLICATE_THRESHOLDS.review) return null;
  return match(score);
}


/**
 * How much of a title has to differ before the difference is a different book.
 *
 * Three code points, because two is a typo ("chemistry"/"chemestry" leaves
 * "i"/"e") or a function word ("to"/"of"), and both of those are ways ONE book
 * gets entered twice. Three or more mutually unrecognisable characters in the
 * same slot is a different word, which is a different book.
 */
const MIN_DISTINGUISHING_CHARS = 3;

/** Above this, the differing parts are a misspelling of each other, not two
 *  different words. Deliberately low: the two halves of a real typo pair are
 *  usually one edit apart, and anything looser starts eating real duplicates. */
const REMAINDER_SIMILARITY_CEILING = 0.5;

/**
 * Do these two titles agree only on boilerplate?
 *
 * WHY EDIT DISTANCE NEEDS THIS. `characterRatio` is a proportion of the whole
 * string, so the longer the shared frame, the less the meaningful part is
 * allowed to matter. A series of teacher's guides differing only in their
 * subject word scores in the low 90s on every pair — not because the threshold
 * is wrong, but because the measure is answering the wrong question. Lowering
 * the threshold would only trade these false positives for missed real ones;
 * looking at the part that differs answers the actual question.
 *
 * It fires only when BOTH titles put substantial, mutually unrecognisable
 * content in the same slot. A truncation, a dropped word or a misspelling
 * leaves one side of the remainder empty or one character long, and is
 * untouched — those are how a real duplicate looks.
 *
 * Identifier evidence never reaches here: a shared content hash or a shared
 * ISBN has already returned by this point, so nothing this rule does can let
 * the same file, or the same registered edition, into the catalogue twice.
 */
export function isDistinguishingVariant(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const rest = titleRemainders(a, b);
  if (!rest) return false;

  const longest = Math.max(Array.from(rest.left).length, Array.from(rest.right).length);
  if (longest < MIN_DISTINGUISHING_CHARS) return false;

  return characterRatio(rest.left, rest.right) < REMAINDER_SIMILARITY_CEILING;
}

/**
 * Do these two titles differ ONLY by their numbers?
 *
 * Khmer and ASCII digits both count, so "ថ្នាក់ទី៧" and "Grade 7" are handled
 * by one rule. Titles carrying no digits at all can never be series variants.
 */
export function isSeriesVariant(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = khmerDigitsToAscii(normalizeTitle(a));
  const right = khmerDigitsToAscii(normalizeTitle(b));
  if (!left || !right || left === right) return false;

  const digitsOf = (value: string) => value.match(/\d+/g)?.join(".") ?? "";
  const leftDigits = digitsOf(left);
  const rightDigits = digitsOf(right);
  if (!leftDigits && !rightDigits) return false;
  if (leftDigits === rightDigits) return false;

  const stripped = (value: string) => value.replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  return stripped(left) === stripped(right);
}

/* ── Aggregation ───────────────────────────────────────────────────────── */

export type DuplicateAssessment = {
  matches: DuplicateMatch[];
  /** The strongest match, or null when the record looks new. */
  top: DuplicateMatch | null;
  /** True when saving must be refused rather than warned about. */
  blocked: boolean;
  /** How many candidates were examined — surfaced so a truncated sweep is
   *  visible rather than silently looking like a clean result. */
  examined: number;
  /** True when the candidate query hit its cap and more rows may exist. */
  truncated: boolean;
};

const CONFIDENCE_RANK: Record<DuplicateConfidence, number> = {
  exact: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** Score every candidate and rank them; strongest first, then by title. */
export function assessDuplicates(
  query: DuplicateQuery,
  candidates: readonly DuplicateCandidate[],
  options: { truncated?: boolean } = {},
): DuplicateAssessment {
  const matches: DuplicateMatch[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const scored = scoreCandidate(query, candidate);
    if (scored) matches.push(scored);
  }

  matches.sort(
    (a, b) =>
      b.score - a.score ||
      CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] ||
      a.title.localeCompare(b.title),
  );

  const top = matches[0] ?? null;
  return {
    matches,
    top,
    blocked: Boolean(top && isBlockingConfidence(top.confidence)),
    examined: seen.size,
    truncated: Boolean(options.truncated),
  };
}
