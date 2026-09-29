// lib/theses/contents.ts
//
// A thesis's own table of contents: its shape, how a stored value is made
// safe, and how a first draft is read off the PDF's indexed contents page.
//
// Pure and browser-safe — the admin form imports the types and the sanitiser,
// the draft action runs `draftContents()` over `book_pages` rows it has read.
//
// WHY A DRAFT, AND WHY ONLY A DRAFT
// ─────────────────────────────────
// Every indexed thesis already has its contents page in `book_pages`, and
// lib/ai/page-quality.ts already recognises one (it is how retrieval keeps
// contents pages out of evidence). Typing 20–40 chapter lines by hand is the
// slowest, most error-prone part of cataloguing a thesis, so the admin form
// offers a draft. But the text arrives whitespace-collapsed — pdf.js items
// joined with single spaces, no line breaks (lib/pdf-page-index.ts) — so a
// contents page is one flat run of tokens:
//
//   "CONTENTS Abstract ii CHAPTER 1 INTRODUCTION 1 1.1 Background 1 ..."
//
// and where one entry ends is an inference. The rules below are structural
// (a page locator closes an entry, a chapter word or a section number opens
// one) plus one sanity check (page numbers do not go backwards), and they are
// wrong sometimes. That is acceptable ONLY because nothing here writes to the
// database: a librarian reviews the draft, edits it, and saving it is theirs.

import { assessPageText } from "@/lib/ai/page-quality";

export interface ContentsEntry {
  /** 1 = chapter or unnumbered part (Abstract, References); 2 = section (1.1). */
  level: 1 | 2;
  /** As printed: "1", "II", "១", "2.3". Absent for unnumbered parts. */
  number?: string;
  label: string;
  /** The page number AS PRINTED ("iv", "27", "២៧") — not a PDF page index. */
  page?: string;
}

/** Bounds on what the save path stores. The migration (0160) enforces the
 *  entry count too; the rest is refused here. */
export const CONTENTS_LIMITS = { entries: 300, label: 300, number: 16, page: 12 } as const;

/** Only the opening pages are searched: a contents page sits in the front
 *  matter, and a later page carrying the word is a chapter about contents. */
export const CONTENTS_SEARCH_FIRST_PAGES = 40;
/** A contents section longer than this is not one contents section. */
const MAX_CONTENTS_PAGES = 4;
/** Fewer entries than this is not a contents page we understood. */
const MIN_ENTRIES = 3;

// ── Recognising the contents page ─────────────────────────────────────────

/** The heading. `c o n t e n t s` letter-spaced is how pdf.js extracts a
 *  letter-spaced running head (see FURNITURE_MARKERS in page-quality.ts).
 *  No `\b` on the Khmer marker: `\b` is ASCII-only. */
const CONTENTS_HEADING = /\b(?:table\s+of\s+)?c\s?o\s?n\s?t\s?e\s?n\s?t\s?s\b|មាតិកា/iu;

/** Lists that follow the contents and are not part of it. */
const OTHER_LIST_HEADING =
  /\blist\s+of\s+(?:tables|figures|illustrations|abbreviations|acronyms|appendices|charts|graphs)\b|បញ្ជី(?:តារាង|រូបភាព|ក្រាហ្វ|អក្សរកាត់)/giu;

/**
 * Where another list STARTS in this text, or -1.
 *
 * "LIST OF TABLES" appears twice in a typical thesis: as an ENTRY in the
 * contents ("LIST OF TABLES vi") and as the heading of the list itself. The
 * entry is followed by its page number; the heading is followed by the list.
 * Cutting at the first occurrence cut every such contents page short.
 */
function listStart(text: string): number {
  for (const m of text.matchAll(OTHER_LIST_HEADING)) {
    const next = text
      .slice(m.index + m[0].length)
      .replace(/^[\s.·•…_]+/u, "")
      .split(/\s+/u)[0];
    if (next && asPage(next)) continue;
    return m.index;
  }
  return -1;
}

/** Leading heading text to strip before parsing entries: "TABLE OF CONTENTS",
 *  optionally followed by the "Page" column header. */
const LEADING_HEADING =
  /^\s*(?:(?:table\s+of\s+)?c\s?o\s?n\s?t\s?e\s?n\s?t\s?s|បញ្ជីមាតិកា|មាតិកា)\s*(?:pages?|ទំព័រ)?\s*/iu;

// ── Token classes ─────────────────────────────────────────────────────────

const DIGITS = /^[0-9០-៩]{1,4}$/u;
/** Lowercase roman numerals up to 39 — front-matter pages (i, iv, xii).
 *  Lowercase only: an uppercase II is a chapter or part number, not a page. */
const ROMAN_PAGE = /^(?=[ivx])x{0,3}(?:ix|iv|v?i{0,3})$/u;
/** A single Khmer consonant — the Khmer front-matter page sequence (ក ខ គ …). */
const KHMER_LETTER_PAGE = /^[ក-អ]$/u;
/** 1.1, 2.3.1, ១.២ — a section number, which OPENS an entry. */
const SECTION_NUMBER = /^([0-9០-៩]{1,2})((?:\.[0-9០-៩]{1,2}){1,3})\.?$/u;
/** "1." or "1" with a trailing dot or colon, at the start of an entry. */
const LEADING_NUMBER = /^[0-9០-៩]{1,2}[.:)]?$/u;
const CHAPTER_WORD = /^(?:chapter|part|unit|section)$/iu;
/** ជំពូក (chapter), optionally ទី (ordinal), optionally the number in the
 *  same token: "ជំពូក", "ជំពូកទី", "ជំពូកទី១". */
const KHMER_CHAPTER = /^ជំពូក(?:ទី)?([0-9០-៩]{1,2})?$/u;
const CHAPTER_NUMBER = /^(?:[0-9០-៩]{1,2}|[IVXLivxl]{1,6}|one|two|three|four|five|six|seven|eight|nine|ten)[.:]?$/iu;

const KHMER_DIGIT_OFFSET = "០".charCodeAt(0) - "0".charCodeAt(0);
const toArabic = (s: string) =>
  s.replace(/[០-៩]/gu, (d) => String.fromCharCode(d.charCodeAt(0) - KHMER_DIGIT_OFFSET));

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10 };
function romanValue(s: string): number {
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]] ?? 0;
    const next = ROMAN[s[i + 1]] ?? 0;
    total += v < next ? -v : v;
  }
  return total;
}

type PageSystem = "arabic" | "roman" | "khmer_letter";

/** A token that can close an entry as its page, with its system and value. */
function asPage(token: string): { system: PageSystem; value: number } | null {
  if (DIGITS.test(token)) return { system: "arabic", value: Number(toArabic(token)) };
  if (ROMAN_PAGE.test(token)) return { system: "roman", value: romanValue(token) };
  if (KHMER_LETTER_PAGE.test(token)) return { system: "khmer_letter", value: token.charCodeAt(0) };
  return null;
}

const trimLabel = (s: string) => s.replace(/^[\s:–—-]+|[\s:–—-]+$/gu, "").trim();
const stripPunct = (s: string) => s.replace(/[.:)]+$/u, "");

// ── Parsing one contents text ─────────────────────────────────────────────

interface Draft {
  level: 1 | 2 | 3;
  number?: string;
  label: string[];
}

/**
 * Parse whitespace-collapsed contents text into entries.
 *
 * An entry OPENS on a chapter word ("CHAPTER 1", "ជំពូកទី១"), a section number
 * ("1.1"), or — when no entry is open — any word. It CLOSES on a page locator
 * once it has a label. A locator that would make the pages run backwards
 * within its numbering system ("Grade 1 pupils" after page 9) is read as part
 * of the label instead: contents pages are in page order.
 *
 * Sections three levels deep (1.1.1) are dropped. They are parsed, so their
 * pages still advance the ordering check, but a reader scanning a thesis's
 * outline wants chapters and their sections, not every sub-heading.
 */
export function parseContentsText(text: string): ContentsEntry[] {
  const cleaned = (text ?? "")
    .replace(LEADING_HEADING, "")
    // Dot leaders ("Background ........ 1") and their unicode cousins.
    .replace(/[.·•…_]{2,}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!cleaned) return [];
  const tokens = cleaned.split(" ");

  const out: Draft[] = [];
  const pages: ContentsEntry["page"][] = [];
  const last: Record<PageSystem, number> = { arabic: -1, roman: -1, khmer_letter: -1 };
  let cur: Draft | null = null;

  const close = (page?: string) => {
    if (cur && cur.label.length > 0) {
      out.push(cur);
      pages.push(page);
    }
    cur = null;
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    const kh = KHMER_CHAPTER.exec(tok);
    if (CHAPTER_WORD.test(tok) || kh) {
      close();
      let number = kh?.[1];
      if (!number && tokens[i + 1] && CHAPTER_NUMBER.test(tokens[i + 1])) {
        number = stripPunct(tokens[++i]);
      }
      cur = { level: 1, number, label: [] };
      continue;
    }

    const section = SECTION_NUMBER.exec(tok);
    if (section) {
      close();
      const depth = 1 + (section[2].match(/\./gu)?.length ?? 0);
      cur = { level: depth >= 3 ? 3 : 2, number: stripPunct(tok), label: [] };
      continue;
    }

    const page = asPage(tok);
    if (page && cur && cur.label.length > 0) {
      if (page.value >= last[page.system]) {
        last[page.system] = page.value;
        close(tok);
        continue;
      }
      cur.label.push(tok);
      continue;
    }

    if (!cur) {
      // Between entries, a roman or Khmer-letter locator is the contents
      // page's OWN folio ("v" at the foot of the page), and a lone "Page" is
      // the column header re-printed on a continuation page. Neither is an
      // entry.
      if ((page && page.system !== "arabic") || /^(?:pages?|ទំព័រ)$/iu.test(tok)) continue;
      // A bare number opening an entry is the entry's number ("1 Introduction 1").
      if (LEADING_NUMBER.test(tok) && tokens[i + 1] && !asPage(tokens[i + 1])) {
        cur = { level: 1, number: stripPunct(tok), label: [] };
        continue;
      }
      cur = { level: 1, label: [] };
    }
    cur.label.push(tok);
  }
  close();

  const entries: ContentsEntry[] = [];
  out.forEach((d, idx) => {
    if (d.level === 3) return;
    const label = trimLabel(d.label.join(" "));
    if (!label || label.length > CONTENTS_LIMITS.label) return;
    const page = pages[idx];
    entries.push({
      level: d.level,
      ...(d.number ? { number: d.number } : {}),
      label,
      ...(page ? { page } : {}),
    });
  });
  return entries;
}

// ── Drafting from a thesis's indexed pages ────────────────────────────────

export interface IndexedPage {
  pageNo: number;
  content: string;
}

export type ContentsDraft =
  | { ok: true; entries: ContentsEntry[]; sourcePages: number[] }
  | { ok: false; reason: "no_pages" | "no_contents_page" | "unparseable" };

/**
 * Find the contents page(s) among a thesis's indexed pages and parse them.
 *
 * The first page, in PDF order, that carries a contents heading AND is not
 * prose (page-quality's own judgement — a chapter discussing "contents" is
 * prose) starts the section. Following pages continue it while they are
 * still not prose and do not open another list (tables, figures). Text after
 * such a list's heading on the same page is cut.
 */
export function draftContents(pages: readonly IndexedPage[]): ContentsDraft {
  if (!pages.some((p) => p.content?.trim())) return { ok: false, reason: "no_pages" };
  const front = [...pages]
    .filter((p) => p.pageNo <= CONTENTS_SEARCH_FIRST_PAGES && p.content?.trim())
    .sort((a, b) => a.pageNo - b.pageNo);

  const startIdx = front.findIndex((p) => {
    const m = CONTENTS_HEADING.exec(p.content);
    if (!m) return false;
    // The heading must not sit inside another list's page ("List of Tables"
    // pages rarely say "contents", but a list page that does is not the TOC).
    const other = listStart(p.content);
    if (other >= 0 && other < m.index) return false;
    return !assessPageText(p.content).substantive;
  });
  if (startIdx < 0) return { ok: false, reason: "no_contents_page" };

  const texts: string[] = [];
  const sourcePages: number[] = [];
  for (let i = startIdx; i < front.length && sourcePages.length < MAX_CONTENTS_PAGES; i++) {
    const p = front[i];
    // Consecutive PDF pages only: a gap means an unindexed (scanned) page,
    // and gluing across it would join two unrelated lists.
    if (sourcePages.length > 0 && p.pageNo !== sourcePages[sourcePages.length - 1] + 1) break;
    let text = p.content;
    if (i === startIdx) {
      // Start at the heading: anything above it on the page (a running head,
      // the end of the acknowledgements) is not part of the list.
      text = text.slice(CONTENTS_HEADING.exec(text)!.index);
    } else {
      if (assessPageText(text).substantive) break;
      const opens = listStart(text);
      if (opens >= 0 && opens < 40) break;
      // "CONTENTS (continued)" re-printed at the top of the next page.
      text = text.replace(LEADING_HEADING, "").replace(/^\s*\(?continued\)?\s*/iu, "");
    }
    const other = listStart(text);
    texts.push(other >= 0 ? text.slice(0, other) : text);
    sourcePages.push(p.pageNo);
    if (other >= 0) break;
  }

  const entries = parseContentsText(texts.join(" "));
  if (entries.length < MIN_ENTRIES) return { ok: false, reason: "unparseable" };
  return { ok: true, entries: entries.slice(0, CONTENTS_LIMITS.entries), sourcePages };
}

// ── The save path ─────────────────────────────────────────────────────────

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const s = String(v).replace(/\s+/gu, " ").trim();
  return s ? s.slice(0, max) : undefined;
};

/**
 * Make a submitted contents value safe to store, or null when nothing is left.
 *
 * The admin form sends whatever the librarian typed; a hand-built request can
 * send anything. Every entry is re-shaped from scratch — unknown keys dropped,
 * strings trimmed and bounded, a level that is not 1 or 2 read as 1 — and an
 * entry without a label is dropped rather than stored as a blank line.
 */
export function sanitizeContents(raw: unknown): ContentsEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ContentsEntry[] = [];
  for (const item of raw) {
    if (out.length >= CONTENTS_LIMITS.entries) break;
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const label = str(r.label, CONTENTS_LIMITS.label);
    if (!label) continue;
    const number = str(r.number, CONTENTS_LIMITS.number);
    const page = str(r.page, CONTENTS_LIMITS.page);
    out.push({
      level: r.level === 2 || r.level === "2" ? 2 : 1,
      ...(number ? { number } : {}),
      label,
      ...(page ? { page } : {}),
    });
  }
  return out.length > 0 ? out : null;
}
