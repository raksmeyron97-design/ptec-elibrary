/**
 * Which sidebar entry is "the page you are on".
 *
 * The old rule was `pathname.startsWith(href)`, with a hardcoded exception
 * making `/admin` exact. That was correct only because no other admin nav entry
 * was an ancestor of another. Consolidating Upload, Manage and Duplicates under
 * /admin/books made three of them nested, and a plain prefix test lights up
 * "Collection" on /admin/books/upload as well as the Upload entry — two entries
 * both claiming to be the current page.
 *
 * The rule is longest-match: a candidate matches when the pathname is the href
 * or a segment-boundary descendant of it, and only the most specific matching
 * candidate wins. A parent group still highlights, because a group asks whether
 * ANY of its children is active.
 *
 * Segment boundaries matter: "/admin/books" must not match "/admin/book-requests".
 */

/** True when `pathname` is `href` itself or lives beneath it. */
export function isUnder(pathname: string, href: string): boolean {
  if (!pathname || !href) return false;
  if (pathname === href) return true;
  return pathname.startsWith(href.endsWith("/") ? href : `${href}/`);
}

export type ActiveOptions = {
  /**
   * Hrefs that match only their own exact path.
   *
   * The caller passes the panel root here. `/admin` is an ancestor of every
   * admin page, so prefix-matching it would mark Dashboard as the current page
   * on `/admin/edit/[id]` and `/admin/profile` — routes with no nav entry of
   * their own, where the honest answer is that nothing is current.
   */
  exact?: readonly string[];
};

/**
 * The single nav href that represents `pathname`, or null when none does.
 * `candidates` is every href in the tree — order does not matter.
 */
export function resolveActiveHref(
  pathname: string | null | undefined,
  candidates: readonly string[],
  options: ActiveOptions = {},
): string | null {
  if (!pathname) return null;
  const exact = new Set(options.exact ?? []);

  let best: string | null = null;
  for (const href of candidates) {
    const matches = exact.has(href) ? pathname === href : isUnder(pathname, href);
    if (!matches) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}

/** Curried predicate for a render pass: `const isActive = makeIsActive(pathname, hrefs, opts)`. */
export function makeIsActive(
  pathname: string | null | undefined,
  candidates: readonly string[],
  options: ActiveOptions = {},
): (href: string) => boolean {
  const active = resolveActiveHref(pathname, candidates, options);
  return (href: string) => active !== null && active === href;
}
