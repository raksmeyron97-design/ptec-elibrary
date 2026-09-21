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
  | "sparse"
  /**
   * Khmer that extracted as correctly-encoded but WRONG code points — a PDF
   * whose embedded font carries no usable ToUnicode map. See `assessKhmerText`.
   */
  | "unreadable";

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
  // No `\b` on the Khmer marker: a word boundary is defined on [A-Za-z0-9_],
  // so `\bមាតិកា\b` can only match where Khmer sits directly against Latin —
  // i.e. essentially never. It silently matched nothing until a change to the
  // word floor stopped masking it.
  /មាតិកា/u,
];

/** Dot leaders — "Sampling error .......... 188" — are a contents page and
 *  nothing else. Khmer numerals for the same reason as BARE_NUMBER. */
const DOT_LEADER = /\.{3,}\s*[\d០-៩]{1,4}/u;

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
 *
 * Khmer numerals are deliberately NOT added to that lookbehind, and the
 * reason is worth writing down because it looks like an omission. The
 * LOOKAHEAD already requires an uppercase letter (or end of input) after the
 * terminator, and Khmer has no uppercase — `/\p{Lu}/u` is false for any
 * Khmer string. So a period between two Khmer words can never match at all,
 * with or without ០-៩ in the lookbehind. Adding it was tried during the
 * SEO5-08 script sweep, measured at 0 matches either way, and reverted
 * rather than kept as a fix that fixes nothing.
 *   (?<!\b\p{Lu}) a back-of-book index lists authors by initial ("Spradley,
 *                J. P., 190"; "(Neuman, McCormick), 182"), and every initial
 *                read as a sentence boundary. An initial is a single capital
 *                standing alone, which is never how an English sentence ends.
 */
const SENTENCE_END = /(?<![0-9])(?<!\b\p{Lu})[.!?](?=\s+["'“(\p{Lu}]|\s*$)|។/gu;

/**
 * A token that is only digits — a page locator.
 *
 * KHMER NUMERALS ០-៩ COUNT. `\d` is ASCII-only in JavaScript even under the
 * `u` flag, so a Khmer contents or index page — which prints its locators in
 * Khmer digits — scored a numeric ratio of exactly 0% and the `locatorHeavy`
 * signal could never fire for it.
 *
 * The heading marker `មាតិកា` hid this for the FIRST page of a contents
 * listing, which is why it survived: that page is caught by `marker &&
 * thinProse` before the locator route is reached. A CONTINUATION page has no
 * heading, and measured on the real assessPageText(), one such page scored:
 *
 *   Khmer numerals  kind=prose  substantive=TRUE   "0% numbers"
 *   same page, ASCII digits  kind=index  substantive=false  "37% ... bare page numbers"
 *
 * So the furniture filter — whose whole purpose is keeping a list of
 * pointers out of the evidence set — was admitting Khmer furniture as prose.
 * 1,521 of this library's 1,846 indexed books are Khmer.
 *
 * The two-signal rule still applies: a page is only dropped when it is BOTH
 * locator-heavy and has no sentences. Khmer prose terminates with the khan
 * (។), which SENTENCE_END already counts, so a real Khmer page keeps its
 * sentence density and is not at risk.
 */
const BARE_NUMBER = /^[\d០-៩]{1,4}(?:[–-][\d០-៩]{1,4})?$/u;

const KHMER = /[ក-៿]/u;

/**
 * Below this many words there is no claim on the page at all — a title page,
 * a running head, a cross-reference stub.
 *
 * 25, and the number was corrected by CI rather than chosen well the first
 * time. At 40 it dropped the five seeded pages the e2e suite retrieves
 * against, which are 30–37 words of unmistakable prose (5.4–6.7 sentence
 * ends per 100 words), and six `e2e/ai-research.spec.ts` tests failed
 * because the sources panel had nothing to render.
 *
 * The real gap is wide and 25 sits in the middle of it: the things this floor
 * exists for run 9–17 words ("Qualitative Coding The Manual Researchers for
 * Johnny Saldaña 3E"; "Related activities Activity 36: …"), and the shortest
 * genuine paragraph measured runs 30.
 *
 * The 40-word version also dropped a 35-word page that names three
 * definitions without containing any of them. Keeping that page is the
 * correct outcome: whether a paragraph is USEFUL is a judgement about its
 * subject, and this module does not make those — it decides whether the text
 * is prose. Retrieval's own scoring is what ranks a weak paragraph low.
 */
const MIN_WORDS = 25;
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

// ── Khmer that extracted as nonsense ─────────────────────────────────────────
/**
 * A Khmer PDF whose embedded font has no usable ToUnicode map extracts as a
 * stream of REAL Khmer characters in an order that spells nothing:
 *
 *   អ ក េ បើ ស់ ៩៧,២០៧ ក់ ៦៥៩ វ គ សិ ក ២៣៨ េសៀ វ េ ៤,៧៩០
 *
 * Nothing downstream can tell that from Khmer prose. It is correctly encoded,
 * so it clears every character check; it carries the query's terms often
 * enough to clear the lexical floor; and it reaches the model as evidence,
 * where the only thing it can produce is a confident answer made of nonsense —
 * in the reader's own language, which is where it is least likely to be
 * spotted by whoever maintains the system.
 *
 * Measured against production on 2026-09-17 (`scripts/audit-khmer-page-text.ts`,
 * 20,000 pages): 10,061 pages are Khmer, **941 of them (9.4%) are unreadable**,
 * and they sit in **40 of the 127 records** that carry Khmer text.
 *
 * THE TEST IS STRUCTURAL, like the furniture test beside it, and it does not
 * read a dictionary. There are two flavours of this corruption in the corpus
 * and they look nothing alike, so there are two independent detectors:
 *
 *   FRAGMENTED — the mapping emits a space wherever the font had a ligature,
 *     so the text shatters into one- and two-character pieces:
 *       អ ក េ បើ ស់ ៩៧,២០៧ ក់ ៦៥៩ វ គ សិ ក ២៣៨ េសៀ វ េ
 *     Khmer writes a syllable as a consonant plus its dependent marks with no
 *     spaces, so real Khmer has LONG runs. Caught by run length.
 *
 *   ORPHANED MARKS — a second flavour, MEASURED BUT NOT ACTED ON. The runs
 *     stay long and syllables are split mid-word, so the second half BEGINS
 *     with a dependent vowel or sign:
 *       ការស្រ ាវស្រ ាវ និងការវាយតម្ម្ ៃក្ នុ ងការអប់រំ
 *     `ាវ` starts with U+17B6, which cannot begin a Khmer syllable — the
 *     dependent vowel has no consonant to attach to. Run length alone scores
 *     that page healthy, and it did reach the model as evidence in a measured
 *     run, so the signal is real and `orphanShare` is reported for it.
 *
 *     It does NOT decide anything, and that is a deliberate refusal. Measured
 *     over 10,091 Khmer pages of production, the two populations do not
 *     separate on it: pages the fragmentation rule calls readable have an
 *     orphan share with p50 0.078 and p95 0.120, and every threshold that
 *     catches the split pages also condemns 64% of the Khmer corpus. Dropping
 *     two thirds of a language's pages on a signal whose distributions overlap
 *     is not a filter, it is removing Khmer from the library — and it is not a
 *     judgement anyone should make without a Khmer reader confirming what the
 *     pages actually say. The number is in the audit script so that reader has
 *     something to adjudicate.
 *
 * The rule that DOES act requires two agreeing signals, for the reason the
 * furniture rule needs two: dropping an unreadable page loses nothing, and
 * dropping a readable one takes a Khmer reader's own language out of their
 * answer.
 */
const KHMER_RUN = /[\u1780-\u17FF]+/gu;
/** A page must be at least this much Khmer before this rule judges it at all. */
const KHMER_SHARE_FLOOR = 0.3;
/** Mean Khmer run length below which the text is fragmented rather than written. */
const KHMER_MEAN_RUN_FLOOR = 3;
/** Share of runs that are 1–2 characters, above which the page reads as broken. */
const KHMER_SHORT_RUN_CEILING = 0.5;
/** Runs needed before the two ratios mean anything. */
const KHMER_MIN_RUNS = 10;
/**
 * Khmer marks that cannot begin a syllable: the dependent vowels (U+17B6–
 * U+17C5) and the signs that attach to a consonant (U+17C6–U+17D3). A run
 * starting with one of these is a syllable cut in half.
 */
const KHMER_ORPHAN_START = /^[\u17B6-\u17D3]/u;
/**
 * Reported only. See the note above: over production these two populations do
 * not separate on this signal, so nothing is dropped for it.
 */
export const KHMER_ORPHAN_OBSERVED = { readableP95: 0.12, splitTypical: 0.2 } as const;

export interface KhmerTextVerdict {
  /** The page is mostly Khmer, so this rule applies to it. */
  khmer: boolean;
  /** Its Khmer spells nothing. Only the fragmentation rule sets this. */
  unreadable: boolean;
  fault: "none" | "fragmented";
  meanRun: number;
  shortRunShare: number;
  /** Share of runs beginning with a mark that cannot start a syllable. */
  orphanShare: number;
}

export function assessKhmerText(text: string): KhmerTextVerdict {
  const raw = String(text ?? "");
  const runs = raw.match(KHMER_RUN) ?? [];
  const khmerChars = runs.reduce((n, r) => n + r.length, 0);
  const letters = (raw.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const khmer = letters > 40 && khmerChars / Math.max(1, letters) >= KHMER_SHARE_FLOOR;
  const meanRun = khmerChars / Math.max(1, runs.length);
  if (!khmer || runs.length < KHMER_MIN_RUNS) {
    return { khmer, unreadable: false, fault: "none", meanRun, shortRunShare: 0, orphanShare: 0 };
  }
  const shortRunShare = runs.filter((r) => r.length <= 2).length / runs.length;
  const orphanShare = runs.filter((r) => KHMER_ORPHAN_START.test(r)).length / runs.length;

  const fragmented = meanRun < KHMER_MEAN_RUN_FLOOR && shortRunShare > KHMER_SHORT_RUN_CEILING;
  return {
    khmer,
    unreadable: fragmented,
    fault: fragmented ? "fragmented" : "none",
    meanRun,
    shortRunShare,
    // Carried, never acted on.
    orphanShare,
  };
}

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

  // Checked before the furniture rules, because a page that spells nothing
  // cannot be judged on whether its sentences are thin — it has no sentences
  // in the sense those rules mean, and it is not front matter either.
  const km = assessKhmerText(raw);
  if (km.unreadable) {
    return q(
      "unreadable",
      false,
      `Khmer spells nothing — ${Math.round(km.shortRunShare * 100)}% one- and two-character fragments ` +
        `(mean run ${km.meanRun.toFixed(1)}); the font carries no usable character map`,
    );
  }

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
