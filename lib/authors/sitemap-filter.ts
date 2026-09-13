// lib/authors/sitemap-filter.ts
//
// Which author URLs the sitemap may advertise. PURE — no fetch, no database —
// because the interesting part is not the filter but what it does when the
// roster it filters against is EMPTY, and that branch has to be testable
// without standing up a directory.
//
// ── The defect ───────────────────────────────────────────────────────────────
//
// /authors/kenneth-n-berk-patrick-carey was in sitemap.xml, answered
// `index, follow`, and had zero works — a soft-404 of exactly the shape SEO V2
// removed from subjects. Three rules had never met: app/sitemap.ts emitted
// every `authors` row, lib/authors/directory.ts listed only `workCount > 0`,
// and the author page sent `noindex` only for a slug that does not resolve.
// The sitemap now asks the directory's question (SEO 3.3 final report §5.5).
//
// ── Why an empty roster is not an answer ─────────────────────────────────────
//
// getAuthorDirectory() catches its own errors and returns []. So "no listed
// authors" means EITHER "no author has works" OR "the read failed", and the
// two are indistinguishable at the call site. Acting on the second reading
// would drop all 157 author URLs from the sitemap in order to remove one —
// vastly worse than the defect being fixed, and the same failure shape as a
// contributor read answering [] after a timeout and silently deleting a byline
// (lib/resources/contributor-view.ts, where it is called `unavailable`).
//
// So an empty roster beside a non-empty row set is UNKNOWN: the unfiltered set
// is emitted, which is the behaviour that shipped for months, and the caller
// is told so it can be logged. Being wrong by advertising one soft-404 costs a
// crawl budget rounding error; being wrong by advertising nothing costs the
// whole entity layer.

export type AuthorSitemapDecision<T> = {
  /** The rows to emit. */
  entries: [string, T][];
  /** True when the roster could not be trusted and the filter was SKIPPED. */
  degraded: boolean;
};

/**
 * Keep only the author URLs the directory lists as having public works.
 *
 * `listedSlugs` empty while `candidates` is not is treated as a failed read,
 * not as "nobody has works" — see the note above.
 */
export function authorUrlsWithWorks<T>(
  candidates: ReadonlyMap<string, T>,
  listedSlugs: ReadonlySet<string>,
): AuthorSitemapDecision<T> {
  const entries = [...candidates.entries()];
  // The one case where an empty roster IS the answer: there are no authors at
  // all, so an empty result is consistent rather than suspicious.
  if (listedSlugs.size === 0 && entries.length > 0) {
    return { entries, degraded: true };
  }
  return { entries: entries.filter(([slug]) => listedSlugs.has(slug)), degraded: false };
}
