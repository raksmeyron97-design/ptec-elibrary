// lib/ai/entity.ts
// How a named WORK is matched against catalogue titles. Pure — no I/O.
//
// One rule for three doors. The assistant had three title resolvers with three
// different rules (docs/AI_BRAIN_2_AUDIT.md §3): the catalogue search took a
// popularity-ordered token pool and hoped the named title was inside it, the
// comparison/summary resolver took the first of five rows by downloads whose
// normalized title CONTAINED the query, and the author fallback did the same
// with containment only. Measured on the live corpus: an edition-suffixed
// title could not be found at all (its parentheses were stripped from the
// phrase clause), a long title lost to thirty more-downloaded books sharing
// the word "Research", and "Who wrote English for Writing Research Papers?"
// answered with the 2nd edition because it is more downloaded than the exact
// title.
//
// The ordering here is the one the brief states and the one a librarian
// applies at the desk:
//
//   exact > normalized exact > edition-stripped exact > prefix > contains
//         > fuzzy (one typo per word) > token overlap
//
// and popularity may only break ties INSIDE a band. Nothing semantic enters:
// a reader who names a title is naming a document, not describing a topic.

import { normalizeSearchText, boundedEditDistance, typoTolerance } from "@/lib/search/normalize";
import { titleWithoutEdition } from "@/lib/books/duplicate-detection/normalize";

export type TitleBand =
  | "exact"
  | "normalized"
  | "edition"
  | "prefix"
  | "contains"
  | "fuzzy"
  | "tokens"
  | "none";

/** Bands strong enough to say "this is the work you named". */
export const STRONG_BANDS: ReadonlySet<TitleBand> = new Set<TitleBand>(["exact", "normalized", "edition", "prefix", "fuzzy"]);

const BAND_SCORE: Record<TitleBand, number> = {
  exact: 1,
  normalized: 0.98,
  edition: 0.95,
  prefix: 0.9,
  contains: 0.85,
  fuzzy: 0.8,
  tokens: 0.6,
  none: 0,
};

export interface TitleMatch {
  band: TitleBand;
  /** 0–1, monotone in band; within `tokens` it is the coverage. */
  score: number;
}

function tokens(s: string): string[] {
  return s.split(" ").filter((t) => t.length >= 3);
}

/**
 * How a candidate title answers a query that names a work.
 *
 * `fuzzy` is deliberately strict — every query word must sit within one edit
 * of a title word (two for long words) — because it exists for a typo, not
 * for a paraphrase. Two textbooks that share four of five words are `tokens`,
 * which no caller treats as identity.
 */
export function titleMatch(candidateTitle: string, query: string): TitleMatch {
  const raw = candidateTitle.trim();
  const q = query.trim();
  if (!raw || !q) return { band: "none", score: 0 };
  if (raw === q) return { band: "exact", score: BAND_SCORE.exact };

  const title = normalizeSearchText(raw);
  const norm = normalizeSearchText(q);
  if (!title || !norm) return { band: "none", score: 0 };
  if (title === norm) return { band: "normalized", score: BAND_SCORE.normalized };

  const titleBase = normalizeSearchText(titleWithoutEdition(raw));
  const queryBase = normalizeSearchText(titleWithoutEdition(q));
  if (titleBase && titleBase === queryBase) return { band: "edition", score: BAND_SCORE.edition };

  if (title.startsWith(norm) || titleBase.startsWith(queryBase)) return { band: "prefix", score: BAND_SCORE.prefix };
  if (title.includes(norm)) return { band: "contains", score: BAND_SCORE.contains };

  const qt = tokens(norm);
  const tt = tokens(title);
  if (qt.length === 0 || tt.length === 0) return { band: "none", score: 0 };

  let exactHits = 0;
  let fuzzyHits = 0;
  for (const word of qt) {
    if (tt.includes(word)) {
      exactHits++;
      continue;
    }
    const tol = typoTolerance(word);
    if (tol > 0 && tt.some((t) => boundedEditDistance(word, t, tol) <= tol)) fuzzyHits++;
  }
  const covered = exactHits + fuzzyHits;
  if (covered === qt.length && qt.length >= 2 && fuzzyHits > 0) return { band: "fuzzy", score: BAND_SCORE.fuzzy };
  if (covered === 0) return { band: "none", score: 0 };
  // The query names the title in a different word order, or in part.
  const coverage = covered / qt.length;
  if (coverage === 1 && qt.length >= 3) return { band: "contains", score: BAND_SCORE.contains };
  return { band: "tokens", score: BAND_SCORE.tokens * coverage };
}

export interface TitledCandidate {
  title: string;
  author?: string | null;
  /** Downloads or views — used only to break ties inside one band. */
  popularity?: number | null;
}

export interface RankedCandidate<T> {
  item: T;
  match: TitleMatch;
}

/**
 * Order a pool by how well each title answers the query. Stable; popularity
 * decides only between equal scores. The author is a tie-break too: a query
 * that also names the author ("Practical Research Methods by Dawson") prefers
 * the row whose byline agrees.
 */
export function rankByTitle<T extends TitledCandidate>(pool: readonly T[], query: string): RankedCandidate<T>[] {
  const norm = normalizeSearchText(query);
  return pool
    .map((item, index) => {
      const match = titleMatch(item.title ?? "", query);
      const author = normalizeSearchText(item.author ?? "");
      const authorAgrees = author.length >= 4 && norm.includes(author) ? 1 : 0;
      return { item, match, index, authorAgrees };
    })
    .sort(
      (a, b) =>
        b.match.score - a.match.score ||
        b.authorAgrees - a.authorAgrees ||
        (b.item.popularity ?? 0) - (a.item.popularity ?? 0) ||
        a.index - b.index,
    )
    .map(({ item, match }) => ({ item, match }));
}

/**
 * The one work the query names, or null. Only a STRONG band counts: a title
 * that merely contains the words is a search result, not an identity — and
 * a wrong identity is worse than none (the comparison, summary and citation
 * paths all build on it).
 */
export function resolveTitle<T extends TitledCandidate>(pool: readonly T[], query: string): RankedCandidate<T> | null {
  const ranked = rankByTitle(pool, query);
  const best = ranked[0];
  if (!best || !STRONG_BANDS.has(best.match.band)) return null;
  return best;
}

/**
 * The `ilike` pattern that finds a title from its words in order, tolerant of
 * the punctuation a reader does not type — "(3rd Edition)", a colon, an Oxford
 * comma. The database is asked with this; the rows are then confirmed by
 * `titleMatch`, so a single shared word can never claim the match.
 */
export function orderedWordsPattern(query: string, maxWords = 8): string | null {
  const words = normalizeSearchText(query)
    .split(" ")
    .filter((w) => w.length >= 2)
    .slice(0, maxWords);
  if (!words.length) return null;
  return `%${words.join("%")}%`;
}
