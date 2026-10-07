// Read-only worksheet logic for two cataloguing defects (SEO audit 2026-10,
// WI-7 and WI-7b). Pure; the scripts that use it write a CSV and nothing else.
//
//   WI-7   191 production titles are exactly 65 characters long and cut
//          mid-word — a cap applied upstream of this repository, which
//          removed the grade or volume that tells one MoEYS textbook from the
//          next. The book's own first pages usually print the full title; a
//          line that BEGINS with the truncated one is a candidate.
//   WI-7b  Khmer titles tagged English, and the reverse.
//
// A candidate is a suggestion for a librarian, who checks it against the PDF
// cover and edits the title in the normal form (slugs never change on edit,
// so no URL moves). Nothing here writes, and a candidate is never shorter
// than the title it would replace.

import { normalizeTitle } from "@/lib/books/duplicate-detection/normalize";

/** The length every truncated production title shares. */
export const TRUNCATION_LENGTH = 65;

const KHMER = /[ក-៿]/;
const KHMER_G = /[ក-៿]/g;
const LATIN_G = /[A-Za-z]/g;

/**
 * Was this title probably cut? Exactly the cap's length, or — for a Latin
 * title — a last word the corpus has never seen (a word cut in half).
 * Khmer has no word boundaries, so only the length rule applies to it.
 */
export function looksTruncated(title: string, vocabulary: ReadonlySet<string>): { truncated: boolean; reason: string | null } {
  const t = title.trim();
  if (t.length === TRUNCATION_LENGTH) return { truncated: true, reason: "length_65" };
  if (KHMER.test(t)) return { truncated: false, reason: null };
  const words = t.toLowerCase().match(/[a-z]+/g) ?? [];
  const last = words[words.length - 1];
  if (last && last.length >= 4 && !vocabulary.has(last)) return { truncated: true, reason: "last_word_unknown" };
  return { truncated: false, reason: null };
}

export type TitleCandidate = { candidate: string; page: number; confidence: "high" | "medium" };

/**
 * The first line of the book's opening pages that STARTS WITH the (normalized)
 * title and continues past it. `pages` maps page number → extracted text.
 */
export function findTitleCandidate(title: string, pages: ReadonlyMap<number, string>): TitleCandidate | null {
  const want = normalizeTitle(title);
  if (!want) return null;
  for (const pageNo of [...pages.keys()].sort((a, b) => a - b)) {
    const lines = (pages.get(pageNo) ?? "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      // A title can wrap: try the line alone and joined with the next one.
      for (const text of [lines[i], lines[i + 1] ? `${lines[i]} ${lines[i + 1]}` : null]) {
        if (!text) continue;
        const norm = normalizeTitle(text);
        if (!norm.startsWith(want) || norm.length <= want.length) continue;
        if (text.length <= title.trim().length) continue; // never shorter
        const confidence = text.length <= title.length * 2 ? "high" : "medium";
        return { candidate: text, page: pageNo, confidence };
      }
    }
  }
  return null;
}

/** Share of the title's LETTERS that are Khmer, and that are Latin. */
export function scriptShares(title: string): { khmer: number; latin: number } {
  const khmer = (title.match(KHMER_G) ?? []).length;
  const latin = (title.match(LATIN_G) ?? []).length;
  const total = khmer + latin;
  return total === 0 ? { khmer: 0, latin: 0 } : { khmer: khmer / total, latin: latin / total };
}

/**
 * A language tag that disagrees with the title's own script, or null.
 * Deliberately one-sided thresholds: an English title naming a Khmer
 * place is still English, and a Khmer title with an English subtitle is still
 * Khmer — only a title that is MOSTLY the other script is reported.
 */
export function languageMismatch(language: string | null | undefined, title: string): "khmer_title_tagged_english" | "latin_title_tagged_khmer" | null {
  const lang = (language ?? "").trim().toLowerCase();
  const { khmer, latin } = scriptShares(title);
  if ((lang === "english" || lang === "en") && khmer >= 0.6) return "khmer_title_tagged_english";
  if ((lang === "khmer" || lang === "km") && latin >= 0.8 && khmer === 0) return "latin_title_tagged_khmer";
  return null;
}
