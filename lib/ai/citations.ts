// lib/ai/citations.ts
// Citations are BUILT from retrieval output, never parsed out of model prose.
// Pure.
//
// The model's only job is to reference a page number we handed it; whether
// that reference is legitimate is decided here and in
// guardrails.enforceGrounding, not by trusting the model (§13).

import type { AILocale, Source } from "./response";

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";

export function toKhmerDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => KHMER_DIGITS[Number(d)]);
}

/** `(Title, p. 42)` / `(ចំណងជើង, ទំព័រ ៤២)`. */
export function formatCitation(source: Source, locale: AILocale): string {
  if (source.page === undefined) return `(${source.title})`;
  return locale === "km"
    ? `(${source.title}, ទំព័រ ${toKhmerDigits(source.page)})`
    : `(${source.title}, p. ${source.page})`;
}

export interface RetrievedPassage {
  title: string;
  author: string;
  url: string;
  page: number;
  text: string;
  similarity: number;
  /**
   * Which record the passage came from, when retrieval knew. Optional because
   * the legacy paths only ever had a title and a page; `lib/ai/evidence.ts`
   * always sets it, and it is what lets a source be saved and a citation be
   * verified by identity rather than by title text.
   */
  recordType?: "book" | "research" | "publication";
  recordId?: string;
}

/**
 * One Source per passage, in retrieval order, deduped by (title, page).
 * Snippets are short: they exist to let a reader verify the citation in the UI,
 * not to re-deliver the passage.
 */
export function buildSources(passages: readonly RetrievedPassage[], snippetChars = 180): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const p of passages) {
    const key = `${p.title.toLowerCase()}#${p.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const text = p.text.trim();
    out.push({
      title: p.title,
      author: p.author,
      page: p.page,
      url: `${p.url}?page=${p.page}`,
      snippet: text.length > snippetChars ? `${text.slice(0, snippetChars).trim()}…` : text,
      recordType: p.recordType,
      recordId: p.recordId,
    });
  }
  return out;
}

/** Sources actually referenced by the (already grounded) answer, in order. */
export function usedSources(answer: string, sources: readonly Source[]): Source[] {
  const lower = answer.toLowerCase();
  return sources.filter((s) => {
    if (s.page === undefined) return lower.includes(s.title.toLowerCase());
    const arabic = `p. ${s.page}`;
    const arabicAlt = `p.${s.page}`;
    const khmer = `ទំព័រ ${toKhmerDigits(s.page)}`;
    return (
      lower.includes(s.title.toLowerCase()) &&
      (lower.includes(arabic) || lower.includes(arabicAlt) || answer.includes(khmer))
    );
  });
}
