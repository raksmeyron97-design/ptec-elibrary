// The retired-URL queue's decisions (migration 0170, SEO audit 2026-10 WI-1).
//
// Pure: the admin page and the Server Actions share these, so what the page
// SUGGESTS and what the action ACCEPTS cannot drift apart. No DB, no
// server-only imports.
//
// A suggestion is a reading, never a verdict. A live record is suggested when
// its title is the queued one (normalizeTitle equality), the same work in
// another edition, or very nearly the same title (titleSimilarity ≥ 90 — the
// duplicate queue's own measure, so "the same book" means one thing across
// the admin). The edition rule exists because a URL usually died here when a
// book was re-created as its next edition: measured on the 43 dead URLs, the
// plan's two rules alone suggested nothing for "effective-school-management"
// → "Effective School Management (4th Edition)" or any of its kind. A
// librarian opens the successor and confirms; nothing redirects on a
// suggestion alone.

import { normalizeTitle, titleWithoutEdition } from "@/lib/books/duplicate-detection/normalize";
import { titleSimilarity } from "@/lib/books/duplicate-detection/similarity";

export type RecordType = "book" | "thesis" | "subject";

export type QueueRow = {
  path: string;
  record_type: RecordType;
  title: string | null;
  cause: "deleted" | "unpublished" | "seeded";
  suggested_path: string | null;
  note: string | null;
  retired_at: string;
  resolution: "pending" | "redirected" | "gone" | "ignored";
};

/** A live record a retired URL could point at. */
export type Candidate = { path: string; title: string };

/** Why a candidate was suggested — shown to the librarian, who decides. */
export type SuggestionBasis = "same_title" | "other_edition" | "similar_title";

export type Suggestion = Candidate & { score: number; basis: SuggestionBasis };

/** titleSimilarity is 0–100; the plan's 0.9. */
export const SUGGESTION_THRESHOLD = 90;
export const MAX_SUGGESTIONS = 3;

/** Collections a librarian may redirect TO from this queue. */
export const TARGET_COLLECTIONS = { books: "book", theses: "thesis", subjects: "subject" } as const;
export type TargetCollection = keyof typeof TARGET_COLLECTIONS;

/** The 0170 url_redirects_shape check. */
const PATH_SHAPE = /^\/[a-z]+(\/[^/]+)+$/;

export function isStoredPathShape(path: string): boolean {
  return PATH_SHAPE.test(path);
}

/**
 * A redirect target this queue accepts: exactly `/books/<slug>`,
 * `/theses/<slug>` or `/subjects/<slug>`, decoded. Anything else — another
 * collection, a nested path, a full URL — is refused before any lookup.
 */
export function parseTarget(path: string): { collection: TargetCollection; slug: string } | null {
  const match = /^\/(books|theses|subjects)\/([^/?#]+)$/.exec(path.trim());
  if (!match) return null;
  return { collection: match[1] as TargetCollection, slug: match[2] };
}

/** What a queued row is matched on: its title, or — for a seeded row with no
 *  title — the words of its own slug. */
export function matchingText(row: Pick<QueueRow, "path" | "title">): string {
  if (row.title && row.title.trim()) return row.title;
  const last = row.path.slice(row.path.lastIndexOf("/") + 1);
  return last.replace(/-/g, " ");
}

/**
 * Live records that could be this row's successor, best first. Exact
 * normalized-title matches score 100; the rest must clear the threshold.
 * The row's own path is never suggested.
 */
export function suggestSuccessors(
  row: Pick<QueueRow, "path" | "title">,
  candidates: readonly Candidate[],
  limit: number = MAX_SUGGESTIONS,
): Suggestion[] {
  const text = matchingText(row);
  const key = normalizeTitle(text);
  if (!key) return [];
  const base = titleWithoutEdition(text);
  // The prefix reading ("Doing Data Analysis with SPSS" → "… Version 18,
  // 5th Edition") needs enough words to mean something: "qualitative
  // research" begins half the methods shelf.
  const prefixable = base.split(" ").filter(Boolean).length >= 3;
  const scored: Suggestion[] = [];
  for (const candidate of candidates) {
    if (candidate.path === row.path) continue;
    const suggestion = score(candidate);
    if (suggestion) scored.push(suggestion);
  }

  function score(candidate: Candidate): Suggestion | null {
    if (normalizeTitle(candidate.title) === key) return { ...candidate, score: 100, basis: "same_title" };
    const candidateBase = titleWithoutEdition(candidate.title);
    if (base && candidateBase === base) return { ...candidate, score: 95, basis: "other_edition" };
    const similarity = titleSimilarity(text, candidate.title);
    if (similarity >= SUGGESTION_THRESHOLD) return { ...candidate, score: similarity, basis: "similar_title" };
    if (prefixable && candidateBase.startsWith(`${base} `)) {
      return { ...candidate, score: SUGGESTION_THRESHOLD, basis: "other_edition" };
    }
    return null;
  }
  return scored
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}

/** Reasons a librarian may give a 301. A collection move is inferred, not chosen. */
export const REDIRECT_REASONS = ["recreated", "typo_fix", "duplicate_retired", "manual"] as const;
export type RedirectReason = (typeof REDIRECT_REASONS)[number] | "collection_move";

/** Reasons for a deliberate removal. PRIVATE: stored in url_redirects.reason
 *  and nowhere else — never in an audit row, a log or a public response. */
export const GONE_REASONS = ["withdrawn", "rights_removal"] as const;
export type GoneReason = (typeof GONE_REASONS)[number];

export function redirectReason(path: string, target: string, chosen?: string | null): RedirectReason {
  const from = path.split("/")[1];
  const to = target.split("/")[1];
  if (from && to && from !== to) return "collection_move";
  return (REDIRECT_REASONS as readonly string[]).includes(chosen ?? "")
    ? (chosen as RedirectReason)
    : "manual";
}

export function isGoneReason(value: unknown): value is GoneReason {
  return typeof value === "string" && (GONE_REASONS as readonly string[]).includes(value);
}

export type QueueTab = "pending" | "resolved" | "redirects";

export function parseQueueTab(value: string | undefined): QueueTab {
  return value === "resolved" || value === "redirects" ? value : "pending";
}

/**
 * A path typed or pasted by a librarian — a full URL, a /km path, or a
 * percent-encoded path — as the decoded, locale-less path 0170 stores, or
 * null when it is not shaped like one.
 */
export function pathFromInput(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      return null;
    }
  }
  if (!value.startsWith("/")) return null;
  value = value.replace(/^\/km(?=\/)/, "").replace(/\/+$/, "");
  try {
    value = value
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
  return isStoredPathShape(value) ? value : null;
}

/** A redirect TARGET: a book, thesis or subject path, or null. */
export function targetFromInput(raw: string): string | null {
  const value = pathFromInput(raw);
  return value && parseTarget(value) ? value : null;
}
