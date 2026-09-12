// lib/ai/page-quality.ts
// Is this page EVIDENCE, or is it the book's furniture? Pure — no I/O.
//
// WHAT THIS IS FOR, and how it was found
// ──────────────────────────────────────
// The retrieval benchmark's `multi_document` category has scored Recall@5 55–60%
// and top-1 20% across three audits, and twice it was written off as a label
// artefact ("the misses were verified correct by inspection", "newer books
// legitimately outrank 215-era labels"). AI Brain 2.1 separated the two
// questions the number was confusing — did retrieval fail, or did the label —
// and the answer was neither of the ones on offer: of the 8 misses, **8 were
// the right document at the wrong page, 0 were the wrong document**, and the
// pages retrieved instead were these:
//
//   Research Methods in Education 8e p.10   "ix c o n t e n t s  11.13 Managing
//                                            the planning of research 194 …"
//   Social Research Methods 4e p.15         "Detailed contents xiv Sampling
//                                            error 188 Types of probability
//                                            sample 190 …"
//   Qualitative Inquiry 4e p.7              "Detailed Contents About the Authors
//                                            Acknowledgments …"
//   Research Methods in Education 8e p.2    the publisher's praise page
//
// A table of contents names EVERY topic in the book, so it matches more query
// terms than any real page and wins the lexical leg outright — while
// containing no claim a reader could be told, and no sentence an answer could
// cite. This is a ranking defect that has been invisible for three audits
// because the only instrument pointed at it was a page-level label that
// everyone had already agreed to distrust.
//
// THE TEST IS STRUCTURE, NEVER SUBJECT
// ────────────────────────────────────
// Nothing here looks at what a page is ABOUT — that would be a second,
// unreviewable relevance model competing with retrieval. It looks only at
// whether the text is PROSE: does it have sentences, and is it mostly
// locators? A contents page is a list of pointers; a chapter page is
// paragraphs. A statistics table inside a chapter has numbers AND sentences
// around them, which is why no single signal is allowed to decide.
//
// AND IT IS DELIBERATELY CONSERVATIVE. Two independent signals must agree
// before a page is called furniture, because the cost is asymmetric: dropping
// a contents page loses nothing, and dropping a real page makes a book
// unanswerable on its own subject. Everything it is unsure about stays.

/** Why a page was judged the way it was. */
export type PageKind =
  /** Paragraphs. The only kind that is evidence. */
  | "prose"
  /** Contents, detailed contents, list of tables/figures, acknowledgements. */
  | "front_matter"
  /** A back-of-book index or a page that is mostly locators. */
  | "index"
  /** Too little text to carry a claim. */
  | "sparse";

export interface PageQuality {
  kind: PageKind;
  substantive: boolean;
  /** One sentence naming the signals that decided it. */
  reason: string;
  /** Bare numbers as a share of tokens. Contents pages run 0.24–0.49. */
  numericRatio: number;
  /** Sentence terminators per 100 words. Prose runs 3–9; contents pages ~0. */
  sentenceDensity: number;
}

/**
 * Headings that only appear on a book's furniture.
 *
 * `c o n t e n t s` with spaces between the letters is not a typo: it is how
 * pdf.js extracts the letter-spaced running head that Routledge sets on every
 * contents page of Research Methods in Education, and it is the marker that
 * page carries instead of the word.
 */
const FURNITURE_MARKERS: readonly RegExp[] = [
  /\b(?:detailed\s+)?c\s?o\s?n\s?t\s?e\s?n\s?t\s?s\b/iu,
  /\blist\s+of\s+(?:tables|figures|illustrations|abbreviations|boxes|contributors)\b/iu,
  /\backnowledge?ments\b/iu,
  /\btable\s+of\s+contents\b/iu,
  /\b(?:author|subject|name)\s+index\b/iu,
  /\bមាតិកា\b/u,
];

/** Dot leaders — "Sampling error .......... 188" — are a contents page and nothing else. */
const DOT_LEADER = /\.{3,}\s*\d{1,4}/u;

/**
 * A sentence ends and another begins: ". A", "។ ", "? T". Khmer uses the khan.
 *
 * Both lookbehinds are load-bearing and both came from measurement:
 *
 *   (?<![0-9])   a contents page numbers its entries ("1. Introduction
 *                2. Design"), and counting those periods as sentences gave
 *                *Qualitative Inquiry* p.7 — "Detailed Contents About the
 *                Authors Acknowledgments …" — a density of 2.2 and let it
 *                through as evidence.
 *   (?<!\b\p{Lu}) a back-of-book index lists authors by initial ("Spradley,
 *                J. P., 190"; "(Neuman, McCormick), 182"), and every initial
 *                read as a sentence boundary. An initial is a single capital
 *                standing alone, which is never how an English sentence ends.
 */
const SENTENCE_END = /(?<![0-9])(?<!\b\p{Lu})[.!?](?=\s+["'“(\p{Lu}]|\s*$)|។/gu;

/** A token that is only digits (possibly roman-numeral-ish page locators too). */
const BARE_NUMBER = /^\d{1,4}(?:[–-]\d{1,4})?$/u;

const KHMER = /[ក-៿]/u;

/** Below this many words a page cannot carry a claim worth citing. */
const MIN_WORDS = 40;
/**
 * Above this share of bare numbers — AND with no sentences at all — a page is
 * a locator list, not prose.
 *
 * 0.10 rather than the 0.20 first tried, because a *list of figures* carries
 * fewer numbers than a contents page: *Research Methods in Education* p.20
 * ("xix 1.1 The functions of science 11 1.2 The hypothesis 13 …") runs 12%
 * across 468 words with zero sentence terminators, and was kept at 0.20. The
 * floor is only ever consulted together with `thinProse`, and 468 words of
 * text with not one terminator is already close to proof on its own.
 */
const NUMERIC_RATIO_FLOOR = 0.1;
/** Below this many sentence ends per 100 words there is no prose to cite. */
const SENTENCE_DENSITY_FLOOR = 1.5;

/**
 * Judge one page of extracted text.
 *
 * `substantive: false` means "do not spend an evidence slot on this". It never
 * means the page is wrong, unindexed or should be deleted — the row stays, and
 * `/api/search/native`'s "found inside" hits are unaffected, because a reader
 * searching for a phrase printed in a table of contents should still find it
 * there.
 */
export function assessPageText(text: string): PageQuality {
  const raw = (text ?? "").replace(/\s+/gu, " ").trim();
  const khmer = KHMER.test(raw);
  const tokens = raw.split(" ").filter(Boolean);
  // Khmer has no word boundaries, so a "word" count is meaningless for it;
  // 6 characters is the conventional stand-in for one Khmer word and is used
  // only to put the two scripts on one scale.
  const words = khmer ? Math.round(raw.length / 6) : tokens.length;
  const numbers = tokens.filter((t) => BARE_NUMBER.test(t)).length;
  const numericRatio = tokens.length ? numbers / tokens.length : 0;
  const sentences = (raw.match(SENTENCE_END) ?? []).length;
  const sentenceDensity = words ? (sentences / words) * 100 : 0;

  const q = (kind: PageKind, substantive: boolean, reason: string): PageQuality => ({
    kind,
    substantive,
    reason,
    numericRatio: Number(numericRatio.toFixed(3)),
    sentenceDensity: Number(sentenceDensity.toFixed(2)),
  });

  if (words < MIN_WORDS) return q("sparse", false, `${words} words — too little text to carry a claim`);

  const marker = FURNITURE_MARKERS.find((re) => re.test(raw));
  const thinProse = sentenceDensity < SENTENCE_DENSITY_FLOOR;
  const locatorHeavy = numericRatio >= NUMERIC_RATIO_FLOOR;
  const dotLeaders = DOT_LEADER.test(raw);

  // TWO signals, always. A marker alone would drop a chapter that discusses
  // acknowledgement practice; thin prose alone would drop a page of poetry or
  // a Khmer page whose terminator pdf.js lost.
  if (marker && thinProse)
    return q("front_matter", false, `carries "${marker.source.slice(0, 28)}" and has no sentences (${sentenceDensity.toFixed(1)}/100 words)`);
  if (dotLeaders && thinProse) return q("front_matter", false, "dot leaders to page numbers, and no sentences");
  if (locatorHeavy && thinProse)
    return q("index", false, `${Math.round(numericRatio * 100)}% of tokens are bare page numbers and there are no sentences`);

  return q("prose", true, `prose: ${sentenceDensity.toFixed(1)} sentence ends per 100 words, ${Math.round(numericRatio * 100)}% numbers`);
}

/** Convenience for the retrieval legs: is this text worth an evidence slot? */
export function isSubstantivePage(text: string): boolean {
  return assessPageText(text).substantive;
}
