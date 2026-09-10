// lib/ai/work-ranking.ts
// How the assistant orders CATALOGUE results. Pure — no I/O, no `server-only`.
//
// WHY THIS EXISTS
//
// The assistant's book/thesis/post search builds its candidate pool with a
// broad `OR` over the query's tokens and then took the pool in
// `download_count` order. With no scoring step in between, "do you have the
// book X" was answered from the most-downloaded books that share ANY word with
// X — so a question naming a title exactly came back with five other books and
// the sentence "I found 5 books related to X". Measured against production
// with scripts/ai-answer-benchmark.ts, the named book was absent from the
// results for 10 of 10 exact-title questions, while /api/search/native
// returned it first for the same strings.
//
// That is the same defect `lib/search/ranking.ts` was written to fix for the
// public search page, and CLAUDE.md records its cause in the same words:
// "the broad token pool (ordered by downloads before scoring — which is how an
// unpopular exact title used to vanish)". The public search fixed it by
// scoring the pool; this module is that step for the assistant.
//
// It is deliberately NOT an import of `RANKING_WEIGHTS`. That model scores
// across six collections using fields the assistant's queries do not select
// (availability, ISBN, page hits), and half-feeding it would produce a number
// that looks like the search page's and is not. What the assistant needs is
// narrower and can be stated exactly: a title the reader named should lead,
// and popularity may only break ties.

import { normalizeSearchText } from "@/lib/search/normalize";

/** A candidate the assistant may show, reduced to what ordering needs. */
export interface RankableWork {
  title: string;
  /** Author / author_names, when the row carries one. */
  author?: string | null;
  /** The pool's existing order signal — downloads or views. Ties only. */
  popularity?: number | null;
}

/**
 * How well a candidate answers the query, 0–1.
 *
 * The bands are ordered so that no amount of popularity can lift a weaker
 * title match above a stronger one; `rankWorks` uses popularity only inside a
 * band. Whole-phrase evidence outranks token evidence for the same reason it
 * does in `lexicalScore`: a reader who types a title is naming a document, not
 * describing a topic.
 */
export function workScore(work: RankableWork, query: string): number {
  const q = normalizeSearchText(query);
  if (!q) return 0;
  const title = normalizeSearchText(work.title ?? "");
  if (!title) return 0;

  if (title === q) return 1;
  // "interviewing as qualitative research" for "Interviewing as Qualitative
  // Research (3rd Edition)" — an edition suffix must not cost the match.
  if (title.startsWith(q) || q.startsWith(title)) return 0.95;
  if (title.includes(q)) return 0.9;

  const author = normalizeSearchText(work.author ?? "");
  const terms = q.split(" ").filter((t) => t.length >= 3);
  if (terms.length === 0) return 0;

  const inTitle = terms.filter((t) => title.includes(t)).length;
  const inAuthor = author ? terms.filter((t) => author.includes(t)).length : 0;

  // Capped below the phrase bands: however many words a title happens to share
  // with the question, it has not been NAMED by it.
  const coverage = inTitle / terms.length;
  const authorBonus = author && inAuthor === terms.length ? 0.1 : 0;
  return Math.min(0.85, coverage * 0.8 + authorBonus);
}

/**
 * Order a candidate pool by how well each item answers the query, keeping the
 * pool's own popularity order as the tie-break.
 *
 * Stable: equal score and equal popularity preserve input order, so a change
 * here can never make the same question return a different list run to run.
 */
export function rankWorks<T extends RankableWork>(pool: readonly T[], query: string): T[] {
  return pool
    .map((work, index) => ({ work, index, score: workScore(work, query) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.work.popularity ?? 0) - (a.work.popularity ?? 0) ||
        a.index - b.index,
    )
    .map((r) => r.work);
}
