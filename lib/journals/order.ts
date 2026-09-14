// Deterministic ordering for journal surfaces. Pure; unit-tested.
//
// Every comparator ends in the row id, so two runs over the same rows always
// agree and pagination never shuffles (the rule lib/search/ranking.ts states
// for search).

import type { JournalIssue } from "@/lib/journals/types";

/** A leading integer, or null: "114" → 114, "e1023" → null, "7A" → 7. */
function leadingInt(v: string | null | undefined): number | null {
  const m = /^\s*(\d{1,9})/.exec(v ?? "");
  return m ? Number(m[1]) : null;
}

function cmpNullableNumber(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // unknowns last
  if (b === null) return -1;
  return a - b;
}

function cmpText(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? "").localeCompare(b ?? "", "en", { numeric: true });
}

/** Text order where a missing value sorts AFTER any present one. */
function cmpTextNullsLast(a: string | null | undefined, b: string | null | undefined): number {
  const hasA = !!a?.trim();
  const hasB = !!b?.trim();
  if (hasA !== hasB) return hasA ? -1 : 1;
  return cmpText(a, b);
}

export type OrderableArticle = {
  id: string;
  title: string;
  page_start: string | null;
  article_no: string | null;
  publication_date: string | null;
};

/**
 * The order articles are printed in an issue's table of contents.
 *
 * `page_start` first — it is the printed position, and every seeded and
 * real-world issue carries it. `article_no` next: continuous-publication
 * journals number articles instead of paginating them. Then the article's own
 * date, then title, then id. Nothing here invents a position for an article
 * that states none; those sort after every article that does.
 */
export function compareArticlesInIssue(a: OrderableArticle, b: OrderableArticle): number {
  return (
    cmpNullableNumber(leadingInt(a.page_start), leadingInt(b.page_start)) ||
    cmpNullableNumber(leadingInt(a.article_no), leadingInt(b.article_no)) ||
    cmpTextNullsLast(a.article_no, b.article_no) ||
    cmpTextNullsLast(a.publication_date, b.publication_date) ||
    cmpText(a.title, b.title) ||
    cmpText(a.id, b.id)
  );
}

/**
 * The articles printed immediately before and after `currentId` in its issue.
 *
 * The order is the issue page's own (`compareArticlesInIssue`), re-applied
 * here rather than trusted from the caller, so "Next article" on an article
 * page and the next row of that issue's table of contents can never disagree.
 * An article that is not in the list — a stale cache, an unpublished sibling
 * — has no neighbours, rather than neighbours guessed from somewhere else.
 */
export function issueNeighbours<T extends OrderableArticle>(
  articles: readonly T[],
  currentId: string,
): { previous: T | null; next: T | null } {
  const ordered = [...articles].sort(compareArticlesInIssue);
  const at = ordered.findIndex((a) => a.id === currentId);
  if (at === -1) return { previous: null, next: null };
  return { previous: ordered[at - 1] ?? null, next: ordered[at + 1] ?? null };
}

/** Newest first: the article's own date, then id (for stability). */
export function compareArticlesNewestFirst(
  a: Pick<OrderableArticle, "id" | "publication_date">,
  b: Pick<OrderableArticle, "id" | "publication_date">,
): number {
  return cmpText(b.publication_date, a.publication_date) || cmpText(a.id, b.id);
}

type OrderableIssue = Pick<JournalIssue, "id" | "issue_number" | "published_date" | "title"> & {
  volume?: { volume_number: string; year?: number | null } | null;
};

/**
 * Issues newest first: by volume (numeric where numeric), then issue number,
 * then date. A journal's "current issue" is the first element.
 */
export function compareIssuesNewestFirst(a: OrderableIssue, b: OrderableIssue): number {
  return (
    cmpNullableNumber(leadingInt(b.volume?.volume_number), leadingInt(a.volume?.volume_number)) ||
    cmpText(b.volume?.volume_number, a.volume?.volume_number) ||
    cmpNullableNumber(leadingInt(b.issue_number), leadingInt(a.issue_number)) ||
    cmpText(b.issue_number, a.issue_number) ||
    cmpText(b.published_date, a.published_date) ||
    cmpText(a.title, b.title) ||
    cmpText(a.id, b.id)
  );
}
