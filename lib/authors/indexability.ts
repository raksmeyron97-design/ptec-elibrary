// lib/authors/indexability.ts
//
// Whether an author page may be a search result (SEO Phase 2.6, finding F8,
// decision D2). PURE, and the ONE rule for both halves: the page's robots
// meta and the sitemap filter call it with the directory's own figures, so
// the sitemap can never advertise a page that answers `noindex`, or the
// reverse.
//
// Most author pages here name one or two books and nothing else — the same
// book-list the book page already shows, under a name. Those are `noindex,
// follow`: still answered, still linked from the directory and every byline,
// still crawled for their links, just not offered as results. A page earns
// indexing with enough works to be a real bibliography, or with a biography a
// librarian has approved, which is content no other page carries.

/** Works an author needs for an indexable page without an approved bio. */
export const DEFAULT_AUTHOR_MIN_WORKS = 3;

/** SEO_AUTHOR_MIN_WORKS as a whole number ≥ 1; anything else is the default. */
export function parseAuthorMinWorks(raw: string | undefined): number {
  const n = Number(raw?.trim());
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_AUTHOR_MIN_WORKS;
}

export type AuthorIndexFacts = {
  /** Public works credited to the author, as the directory counts them. */
  workCount: number;
  /** A biography a librarian approved (lib/authors/profile.ts). */
  hasApprovedBio: boolean;
};

/**
 * Indexable with `minWorks` works or more, or with an approved biography and
 * at least one work. An author with no public works stays `noindex` whatever
 * else is true: that page is a soft-404, a name with nothing to read.
 */
export function authorIsIndexable(facts: AuthorIndexFacts, minWorks: number = DEFAULT_AUTHOR_MIN_WORKS): boolean {
  if (facts.workCount <= 0) return false;
  return facts.workCount >= minWorks || facts.hasApprovedBio;
}
