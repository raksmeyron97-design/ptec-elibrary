/* lib/semantic/passages.ts
 *
 * What a page of extracted text IS, before anything is derived from it.
 *
 * ── The problem this solves ──────────────────────────────────────────────────
 *
 * `book_pages.content` is one whitespace-collapsed string per page, with no
 * structure recovered — pdf.js gives reading order, not layout. So a real page
 * of production text starts like this:
 *
 *   "PROBABILITY SAMPLES 111 Chapter 4 subjects for the sample. This can be
 *    done by drawing names out of a container…"
 *
 * The first five tokens are the running header. Three things go wrong if it is
 * left in place. A topic matched only in a running header is claimed to be
 * "discussed on" 600 pages, because the header repeats on all of them. A table
 * of contents lists every topic in the book, so front matter matches
 * everything and proves nothing. And a bibliography is dense with subject
 * words that the book cites rather than covers.
 *
 * None of those are text-quality problems — the extraction is perfect. They
 * are structure problems, and they are the difference between a page reference
 * a reader can trust and one that wastes their time.
 *
 * ── Why frequency and not a layout model ─────────────────────────────────────
 *
 * Running headers are not identifiable within one page: "PROBABILITY SAMPLES
 * 111 Chapter 4" is indistinguishable from a sentence fragment. They are
 * identifiable across a document, because that is what makes them running.
 * So furniture detection takes the whole page set and asks which tokens keep
 * reappearing in the first and last few token positions — which is exactly the
 * property that defines the thing.
 *
 * Pure and browser-safe: no DB, no server-only imports.
 */

/** Tokens examined at each end of a page when looking for furniture. */
const EDGE_WINDOW = 8;

/**
 * A token is furniture when it recurs in the edge window on this share of the
 * document's pages.
 *
 * A running header appears on every page, or on every recto or every verso
 * when the two differ — so the honest floor is near a half, not near a fifth.
 * At 0.2 a body phrase that merely happens to open one page in five is
 * stripped as furniture, which is how the first draft deleted real opening
 * clauses from a document; 0.4 keeps recto/verso alternation and clears
 * anything a book's prose does by coincidence.
 */
const FURNITURE_PAGE_RATIO = 0.4;
/** …and on at least this many pages. Below it, frequency means nothing. */
const FURNITURE_MIN_PAGES = 5;

/** Documents shorter than this have no statistically detectable furniture. */
const MIN_PAGES_FOR_FURNITURE = 12;

export type PageInput = { pageNo: number; content: string };

export type PassageKind =
  /** Body text — the only kind that counts as evidence. */
  | "body"
  /** Cover, title page, imprint, dedication, foreword. */
  | "front-matter"
  /** Contents listing: names every topic, proves none of them. */
  | "contents"
  /** Bibliography / references: cites subjects rather than covering them. */
  | "references"
  /** Index, glossary, tables of figures — reference apparatus. */
  | "back-matter"
  /** Too little text, or too little of it letters, to be prose. */
  | "sparse";

export type ClassifiedPage = {
  pageNo: number;
  kind: PassageKind;
  /** The page with running header/footer removed. Empty for `sparse`. */
  body: string;
  /** Characters removed as furniture. */
  furnitureChars: number;
};

// ── Tokenization ─────────────────────────────────────────────────────────────

/** Digits carry the page number, which differs on every page by definition. */
function furnitureKey(token: string): string {
  return token.toLowerCase().replace(/\d+/g, "#");
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

// ── Furniture ────────────────────────────────────────────────────────────────

export type Furniture = { header: Set<string>; footer: Set<string> };

/**
 * Tokens that recur at the edges of this document's pages.
 *
 * Returned as two sets rather than a single reconstructed header string,
 * because the header text CHANGES between sections ("SAMPLING" on one spread,
 * "PROBABILITY SAMPLES" on the next) while its vocabulary and position do not.
 * Matching on membership survives that; matching on a fixed string does not.
 */
export function detectFurniture(pages: readonly PageInput[]): Furniture {
  const empty: Furniture = { header: new Set(), footer: new Set() };
  if (pages.length < MIN_PAGES_FOR_FURNITURE) return empty;

  const headCounts = new Map<string, number>();
  const footCounts = new Map<string, number>();

  for (const page of pages) {
    const tokens = tokenize(page.content);
    if (tokens.length < EDGE_WINDOW * 2) continue;
    // Sets, so a word repeated inside one window counts once for that page.
    for (const key of new Set(tokens.slice(0, EDGE_WINDOW).map(furnitureKey))) {
      headCounts.set(key, (headCounts.get(key) ?? 0) + 1);
    }
    for (const key of new Set(tokens.slice(-EDGE_WINDOW).map(furnitureKey))) {
      footCounts.set(key, (footCounts.get(key) ?? 0) + 1);
    }
  }

  const threshold = Math.max(FURNITURE_MIN_PAGES, Math.ceil(pages.length * FURNITURE_PAGE_RATIO));
  const pick = (counts: Map<string, number>) =>
    new Set([...counts].filter(([, n]) => n >= threshold).map(([key]) => key));

  return { header: pick(headCounts), footer: pick(footCounts) };
}

/** A bare page number, a folio, a section number: "105", "4.", "(17)". */
function isLocatorToken(token: string): boolean {
  return /^[([]?\d+[.,)\]]?$/.test(token);
}

/**
 * Set in full capitals — the running-head typographic convention.
 *
 * Needed because a section name is furniture that is NOT frequent: a header
 * reading "PROBABILITY SAMPLES" spans only the pages of that section, so
 * across the document it may appear on 5% of pages and never clear the
 * frequency bar, while "Chapter" and the folio clear it on every page. Without
 * this the strip stops at token 0 and the entire header survives.
 *
 * Uppercase-only, deliberately. Title case cannot be told from a sentence
 * opening, and a rule that could not tell them apart would eat real first
 * words.
 */
function isRunningHeadStyled(token: string): boolean {
  const letters = token.replace(/[^\p{L}]/gu, "");
  return letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

/**
 * The page with its running header and footer removed.
 *
 * Stripping is anchored and greedy-from-the-edge: it consumes header-shaped
 * tokens from each end and STOPS at the first token that is not one. It never
 * removes a word from the middle of the page, so a header word that is also a
 * real subject word ("sampling") keeps every one of its body occurrences —
 * which is the whole point, since those are the occurrences that are evidence.
 *
 * A run is only removed when it contained at least one FREQUENT furniture
 * token. That guard is what keeps the shape-based rules honest: a body page
 * opening "SPSS is a statistical package" leads with an uppercase token and a
 * page opening "17 per cent of respondents" leads with a locator, and neither
 * run reaches a token this document actually repeats, so neither is touched.
 */
export function stripFurniture(content: string, furniture: Furniture): string {
  const tokens = tokenize(content);
  if (tokens.length === 0) return "";

  const consume = (
    index: number,
    step: 1 | -1,
    frequent: Set<string>,
  ): { stop: number; sawFrequent: boolean } => {
    let cursor = index;
    let stop = index;
    let sawFrequent = false;
    for (let taken = 0; taken < EDGE_WINDOW; taken++) {
      const token = tokens[cursor];
      if (token === undefined) break;
      const isFrequent = frequent.has(furnitureKey(token));
      if (!isFrequent && !isLocatorToken(token) && !isRunningHeadStyled(token)) break;
      if (isFrequent) {
        sawFrequent = true;
        // Only commit up to the last frequent token: a locator or an
        // uppercase word AFTER the header proper is body text.
        stop = cursor + (step === 1 ? 1 : 0);
      }
      cursor += step;
    }
    return { stop, sawFrequent };
  };

  const head = consume(0, 1, furniture.header);
  const tail = consume(tokens.length - 1, -1, furniture.footer);

  const start = head.sawFrequent ? head.stop : 0;
  const end = tail.sawFrequent ? Math.max(start, tail.stop) : tokens.length;
  return tokens.slice(start, end).join(" ");
}

// ── Structural classification ────────────────────────────────────────────────

/** Front matter runs at most this deep, whatever the document's length. */
const MAX_FRONT_MATTER_PAGES = 24;
/** …and at least this deep in anything book-length: half title, title,
 *  imprint, dedication, contents and a foreword is six pages before a real
 *  book has said anything, and the measured collection runs 12–20. */
const MIN_FRONT_MATTER_PAGES = 6;
/** Proportional in between. */
const FRONT_MATTER_RATIO = 0.06;
/** Below this length a document has no front matter to speak of, and applying
 *  the book-length floor would classify half a leaflet as its own cover. */
const SHORT_DOCUMENT_PAGES = 30;

/** Below this many characters a page cannot carry a claim about a topic. */
const MIN_BODY_CHARS = 200;
/** Letters ÷ characters. Below this the page is a table, an index or a plate. */
const MIN_LETTER_RATIO = 0.45;

const CONTENTS_HEADING = /\b(contents|table of contents)\b/i;
const REFERENCES_HEADING = /\b(references|bibliography|works cited)\b/i;
const INDEX_HEADING = /\b(index|glossary|appendix)\b/i;

function letterRatio(text: string): number {
  if (text.length === 0) return 0;
  return (text.match(/[\p{L}\p{M}]/gu) ?? []).length / text.length;
}

/** Share of tokens that are bare numbers — a contents page is mostly locators. */
function numericTokenRatio(text: string): number {
  const tokens = tokenize(text);
  if (tokens.length === 0) return 0;
  return tokens.filter((t) => /^\d+[.,)]?$/.test(t)).length / tokens.length;
}

/** Citation years: "(2007)", "1998;" — dense in a bibliography, rare in prose. */
function citationYearDensity(text: string): number {
  const tokens = tokenize(text);
  if (tokens.length === 0) return 0;
  return (text.match(/\b(?:19|20)\d{2}\b/g) ?? []).length / tokens.length;
}

/**
 * What this page is, structurally.
 *
 * Position decides front matter (a contents page is at the front, by
 * definition); everything else is decided from the text, because a
 * bibliography's position varies per book and an appendix may precede an
 * index. Where the signals disagree the page falls through to `body` — the
 * cost of admitting one bibliography page as evidence is a slightly weaker
 * page reference, while wrongly excluding body pages silently shrinks the
 * evidence for every topic in the book.
 */
export function classifyPage(page: PageInput, totalPages: number, body: string): PassageKind {
  if (body.length < MIN_BODY_CHARS || letterRatio(body) < MIN_LETTER_RATIO) return "sparse";

  const frontMatterDepth =
    totalPages < SHORT_DOCUMENT_PAGES
      ? 3
      : Math.min(
          MAX_FRONT_MATTER_PAGES,
          Math.max(MIN_FRONT_MATTER_PAGES, Math.ceil(totalPages * FRONT_MATTER_RATIO)),
        );

  const numeric = numericTokenRatio(body);

  // A contents page is a list of locators, wherever it sits.
  if (numeric > 0.25 || (CONTENTS_HEADING.test(body.slice(0, 200)) && numeric > 0.12)) {
    return page.pageNo <= frontMatterDepth ? "contents" : "back-matter";
  }

  if (page.pageNo <= frontMatterDepth) return "front-matter";

  if (citationYearDensity(body) > 0.06 && REFERENCES_HEADING.test(body.slice(0, 300))) return "references";
  if (citationYearDensity(body) > 0.12) return "references";

  // The last stretch of a book is where the apparatus lives; a heading alone is
  // not enough, because a body page may well discuss "the appendix".
  const inTail = page.pageNo > totalPages * 0.9;
  if (inTail && (INDEX_HEADING.test(body.slice(0, 200)) || numeric > 0.15)) return "back-matter";

  return "body";
}

/**
 * Classify a document's pages in one pass, furniture detected across the whole
 * set. Pages must be the complete extracted set for the record — furniture is
 * a property of the document, and a sample would find none.
 */
export function classifyPages(pages: readonly PageInput[]): ClassifiedPage[] {
  const furniture = detectFurniture(pages);
  const total = pages.reduce((max, p) => Math.max(max, p.pageNo), 0);

  return pages.map((page) => {
    const body = stripFurniture(page.content, furniture);
    return {
      pageNo: page.pageNo,
      kind: classifyPage(page, total, body),
      body,
      furnitureChars: page.content.length - body.length,
    };
  });
}
