/* lib/semantic/topics.ts
 *
 * Which of a record's stated topics the document actually discusses, and
 * where.
 *
 * ── Why the corpus does not name the topics ──────────────────────────────────
 *
 * Every published book in this library already carries a librarian-curated
 * `tags` array — 672 normalized terms across the collection, 84 of them on
 * three or more books. Asking a model to name topics from 77,000 chunks would
 * invent what the library has already stated, and inventing metadata is the
 * one thing this feature must never do.
 *
 * So the division of labour is: the CATALOGUE says what a book is about, and
 * the CORPUS proves it and locates it. A tag becomes a public claim only when
 * body pages of that document actually discuss it, and the claim it becomes is
 * a page reference — "sampling, discussed on pages 111–135" — which is a fact
 * about the document, checkable by anyone holding it.
 *
 * ── What is deliberately not here ────────────────────────────────────────────
 *
 * No excerpt extraction. A page reference carries most of the reader value and
 * exposes none of the text, so it needs no rights decision; excerpts need one
 * the library has not written (docs/SEO-SEMANTIC-CHUNKS-AUDIT.md §7).
 *
 * No topic invention, no synonym expansion, no translation. "Sampling" and
 * "ការធ្វើគំរូ" are not asserted to be the same concept by this module,
 * because nothing in the data says they are.
 *
 * Pure and browser-safe: no DB, no server-only imports, no model calls.
 */

import { hasKhmer, normalizeSearchText } from "@/lib/search/normalize";
import type { ClassifiedPage } from "@/lib/semantic/passages";

// ── Label admissibility ──────────────────────────────────────────────────────

export type LabelRejection =
  /** Nothing left after normalization, or a single character. */
  | "too-short"
  /** A number, a grade, a volume, an edition — a locator, not a subject. */
  | "locator"
  /** A ministry, a university, a council, a funder — an actor, not a subject. */
  | "organization"
  /** A project or programme code (STEPSAM3, RCI Fund). */
  | "project-code"
  /** A document format (handbook, glossary, teacher's guide). */
  | "document-type"
  /** The record's own title or author restated as a tag. */
  | "self-reference";

/** Shortest label that can be matched without matching everything. */
const MIN_LABEL_CHARS = 3;

/**
 * Patterns are matched against the NORMALIZED label, so they see case-folded,
 * punctuation-collapsed text. Each list names a category of string that is a
 * useful catalogue facet and a false topic claim: a book does not "cover" the
 * Ministry of Education because the Ministry published it.
 */
const LOCATOR_PATTERNS: RegExp[] = [
  /^\d+$/,
  /^(?:grade|year|level|volume|vol|part|edition|ed|chapter|unit)\s*\d+$/,
  /^\d+\s*(?:st|nd|rd|th)?\s*(?:grade|year|edition|volume|part)$/,
  /^ថ្នាក់ទី/, // "Grade …"
  /^ភាគ\s*\d/, // "Volume …"
  /^បោះពុម្ពលើកទី/, // "…th edition"
];

const ORGANIZATION_PATTERNS: RegExp[] = [
  /\b(?:ministry|department of education|university|institute|college|council|foundation|fund|agency|unicef|unesco|usaid|world bank)\b/,
  /^ptec$/,
  // Academic publishers. A research-methods textbook mentions its own
  // imprint in running footers and citation lines on dozens of pages, so the
  // evidence gate passes it easily and the resulting claim — "this book
  // covers SAGE" — is simply false. Both of these reached a dry run over the
  // real collection before the rule existed.
  /^(?:sage|springer|routledge|wiley|pearson|elsevier|mcgraw[- ]?hill|palgrave|corwin|jossey[- ]?bass|taylor (?:and|&) francis|oxford university press|cambridge university press)$/,
  /ក្រសួង/, // ministry
  /សាកលវិទ្យាល័យ/, // university
  /វិទ្យាស្ថាន/, // institute
  /ក្រុមប្រឹក្សា/, // council
];

const PROJECT_CODE_PATTERNS: RegExp[] = [
  /^[a-z]{2,}\d+$/, // stepsam3
  /^[a-z]{2,6}\s+(?:fund|project|programme|program|phase)\b/, // rci fund
  /^(?:project|programme|program)\b/,
];

const DOCUMENT_TYPE_PATTERNS: RegExp[] = [
  /^(?:handbook|textbook|manual|guide|guidebook|syllabus|curriculum guide|teacher.?s guide|workbook|glossary|dictionary|report|proceedings)$/,
  /^សៀវភៅ(?:ណែនាំ|សិក្សា|គ្រូ)/, // "guide book", "teacher's book"
  /^សទ្ទានុក្រម/, // glossary
  /^កម្មវិធីសិក្សា/, // curriculum
];

function matchesAny(patterns: readonly RegExp[], value: string): boolean {
  return patterns.some((re) => re.test(value));
}

export type LabelVerdict = { admissible: true } | { admissible: false; reason: LabelRejection };

/**
 * Whether a catalogue tag may be presented as a topic the document covers.
 *
 * Refusal is about the KIND of thing the label names, never about how popular
 * it is: a topic on one book is still a topic. Everything refused here stays a
 * perfectly good facet elsewhere in the catalogue — this module governs one
 * specific claim ("this document discusses X"), and those strings would make
 * it false.
 */
export function admitLabel(
  raw: string,
  context: { title?: string | null; authors?: readonly string[] } = {},
): LabelVerdict {
  const label = normalizeSearchText(raw);
  if (label.length < MIN_LABEL_CHARS) return { admissible: false, reason: "too-short" };

  if (matchesAny(LOCATOR_PATTERNS, label)) return { admissible: false, reason: "locator" };
  if (matchesAny(ORGANIZATION_PATTERNS, label)) return { admissible: false, reason: "organization" };
  if (matchesAny(PROJECT_CODE_PATTERNS, label)) return { admissible: false, reason: "project-code" };
  if (matchesAny(DOCUMENT_TYPE_PATTERNS, label)) return { admissible: false, reason: "document-type" };

  const title = normalizeSearchText(context.title ?? "");
  if (title && (label === title || (title.includes(label) && label.length > title.length * 0.6))) {
    return { admissible: false, reason: "self-reference" };
  }
  for (const author of context.authors ?? []) {
    if (normalizeSearchText(author) === label) return { admissible: false, reason: "self-reference" };
  }

  return { admissible: true };
}

// ── Evidence ─────────────────────────────────────────────────────────────────

export type TopicEvidence = {
  /** The tag as the librarian wrote it — never a normalized or rewritten form. */
  label: string;
  /** Comparison key; two tags with the same key are the same topic. */
  key: string;
  /** Body pages, ascending, on which the label appears. */
  pages: number[];
  /** Total occurrences across those pages. */
  mentions: number;
  /** Body pages examined — the denominator for `spread`. */
  bodyPages: number;
};

/**
 * Occurrences of `label` in one normalized body string.
 *
 * Latin matching is anchored at token boundaries so "sampling" does not match
 * inside "oversampling" and "case study" matches only as a phrase. Khmer has
 * no word boundaries, so a Khmer label is matched as a substring — the same
 * concession `lib/search/normalize.ts` makes, for the same reason. It is
 * looser, and the text gate means it is currently unreachable in production
 * (every Khmer-script book in the collection fails text health), but it is
 * here so the module stays correct the day that is fixed.
 */
function countOccurrences(normalizedBody: string, normalizedLabel: string): number {
  if (!normalizedLabel) return 0;

  if (hasKhmer(normalizedLabel)) {
    let count = 0;
    let from = 0;
    for (;;) {
      const at = normalizedBody.indexOf(normalizedLabel, from);
      if (at === -1) break;
      count++;
      from = at + normalizedLabel.length;
    }
    return count;
  }

  let count = 0;
  let from = 0;
  for (;;) {
    const at = normalizedBody.indexOf(normalizedLabel, from);
    if (at === -1) break;
    const before = at === 0 ? " " : normalizedBody[at - 1];
    const afterAt = at + normalizedLabel.length;
    const after = afterAt >= normalizedBody.length ? " " : normalizedBody[afterAt];
    // normalizeSearchText collapses every separator to a single space, so a
    // token boundary is exactly "space or edge".
    if (before === " " && after === " ") count++;
    from = afterAt;
  }
  return count;
}

/**
 * Where a document discusses each admissible label.
 *
 * Only `body` pages count. Contents pages list every topic in the book and
 * front matter names them on the cover, so admitting either would let a
 * document "discuss" everything it mentions — the exact soft-signal the
 * feature exists to avoid.
 */
export function collectEvidence(
  labels: readonly string[],
  pages: readonly ClassifiedPage[],
  context: { title?: string | null; authors?: readonly string[] } = {},
): TopicEvidence[] {
  const bodyPages = pages.filter((p) => p.kind === "body");
  if (bodyPages.length === 0) return [];

  const normalizedPages = bodyPages.map((p) => ({
    pageNo: p.pageNo,
    text: normalizeSearchText(p.body),
  }));

  const byKey = new Map<string, TopicEvidence>();

  for (const raw of labels) {
    if (!admitLabel(raw, context).admissible) continue;
    const key = normalizeSearchText(raw);
    if (byKey.has(key)) continue; // first spelling of a duplicated tag wins

    const evidence: TopicEvidence = {
      label: raw.trim(),
      key,
      pages: [],
      mentions: 0,
      bodyPages: bodyPages.length,
    };
    for (const page of normalizedPages) {
      const n = countOccurrences(page.text, key);
      if (n > 0) {
        evidence.pages.push(page.pageNo);
        evidence.mentions += n;
      }
    }
    byKey.set(key, evidence);
  }

  return [...byKey.values()];
}

// ── Scoring and the evidence gate ────────────────────────────────────────────

export type ScoredTopic = TopicEvidence & {
  /** 0–1. Comparable within a document; not a ranking signal across documents. */
  score: number;
  /** Whether the evidence is strong enough to state publicly. */
  supported: boolean;
};

export const EVIDENCE_RULES = {
  /** A topic must appear on at least this many body pages… */
  minPages: 3,
  /** …unless the document is short, where this share of it will do. */
  shortDocumentPages: 40,
  minPagesShortDocument: 2,
  /** A single passing mention on each of three pages is not coverage. */
  minMentions: 4,
  /** Pages listed on the detail page; the rest are summarized as a count. */
  maxPagesShown: 8,
} as const;

/**
 * Score a topic's evidence within its document.
 *
 * Three signals, all facts about the text: how many pages carry it, how often,
 * and how far through the document it reaches. Reach matters because a term
 * that appears on three adjacent pages is a passing treatment while one spread
 * across a book is a theme, and a reader choosing between two books cares
 * about that difference.
 *
 * The number is for ORDERING topics inside one book. It is deliberately not
 * comparable between books — a 1,600-page reference work and a 20-page
 * guideline cannot be put on one scale by counting pages — and nothing in the
 * codebase should ever rank documents by it.
 */
export function scoreTopic(evidence: TopicEvidence): ScoredTopic {
  const { pages, mentions, bodyPages } = evidence;

  const minPages =
    bodyPages <= EVIDENCE_RULES.shortDocumentPages
      ? EVIDENCE_RULES.minPagesShortDocument
      : EVIDENCE_RULES.minPages;

  const supported = pages.length >= minPages && mentions >= EVIDENCE_RULES.minMentions;

  // Saturating, so a 600-page book cannot crowd out every other signal.
  const breadth = Math.min(1, pages.length / Math.max(8, bodyPages * 0.05));
  const depth = Math.min(1, mentions / Math.max(12, pages.length * 3));
  const reach =
    pages.length > 1 ? Math.min(1, (pages[pages.length - 1] - pages[0]) / Math.max(1, bodyPages)) : 0;

  const score = supported ? Number((breadth * 0.5 + depth * 0.3 + reach * 0.2).toFixed(4)) : 0;

  return { ...evidence, score, supported };
}

/**
 * The topics a document may publicly claim to cover, best-evidenced first.
 *
 * Ties break on the label so the order is stable across runs — an unstable
 * order would churn the precomputed row and, through it, the page cache, for
 * no change in meaning.
 */
export function supportedTopics(evidence: readonly TopicEvidence[]): ScoredTopic[] {
  return evidence
    .map(scoreTopic)
    .filter((t) => t.supported)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}
