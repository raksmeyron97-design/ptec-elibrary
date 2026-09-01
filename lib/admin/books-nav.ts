/**
 * The Books section of the admin sidebar, as data.
 *
 * Two problems it exists to solve.
 *
 * **Upload is no longer a sibling of the collection.** It was the first entry
 * in this group, which put the rarest action at the top of the section a
 * librarian opens dozens of times a day, and made "add a book" look like a
 * destination rather than something you do *to* the collection. It is now
 * reached from the Manage E-books workspace itself — the primary button in the
 * command bar, the workspace strip on all three book pages, the empty state,
 * the dashboard header and the command palette all already pointed there, so
 * the route and every deep link (`ebookUploadUrl(title)` from the search-gap
 * cards) are unchanged. Only the sidebar entry is gone.
 *
 * **A nav entry no longer carries a gate of its own.** It carries the id of the
 * route policy its destination enforces, and `canReachEntry` asks that policy.
 * A sidebar that answers a *different* question from the route is how this
 * section came to disagree with reality in two directions at once: entries
 * shown to people the destination then refused, and entries hidden in front of
 * routes that had no guard at all, where the hidden link was the whole access
 * control and a typed URL walked straight past it. Both are structurally
 * impossible now — there is one requirement per destination, in
 * `lib/admin/access-policy.ts`, and `lib/admin/books-nav.test.ts` fails if an
 * entry's `href` ever stops matching its policy's route.
 *
 * Order is the librarian's day, not the alphabet:
 *
 *   1. Manage E-books — the hub. Every other entry is reached from it or feeds
 *      it, and it is the first one `staff` (books: read) can open.
 *   2. Review Queue    ┐ the two queues that carry badges: work is waiting and
 *   3. Book Requests   ┘ somebody is waiting on it. Adjacent so the counts read
 *                        as one column. Both are READ surfaces whose actions
 *                        are separately gated on write.
 *   4. Duplicates      — a periodic sweep, and a destructive one: write.
 *   5. Catalog         — the physical collection. A different collection with
 *                        its own permission, so it ends the group rather than
 *                        sitting between two e-book entries.
 */

import { canAccessRoute, routePolicy, type AdminViewer } from "./access-policy";

export type BooksNavKey = "manage" | "review" | "requests" | "duplicates" | "catalog";

export type BooksNavEntry = {
  key: BooksNavKey;
  /** Route policy id in `lib/admin/access-policy.ts` — the single gate. */
  policyId: string;
  /** Key under the `adminShell.nav` message namespace. */
  labelKey: string;
  /** Which `SidebarBadges` count hangs off this entry, if any. */
  badge?: "review" | "bookRequests";
};

export const BOOKS_NAV: readonly BooksNavEntry[] = [
  { key: "manage", policyId: "books.manage", labelKey: "manageEbooks" },
  { key: "review", policyId: "books.review", labelKey: "reviewQueue", badge: "review" },
  { key: "requests", policyId: "books.requests", labelKey: "bookRequests", badge: "bookRequests" },
  { key: "duplicates", policyId: "books.duplicates", labelKey: "duplicates" },
  { key: "catalog", policyId: "catalog.manage", labelKey: "catalog" },
];

/** The destination a nav entry links to, taken from the policy table. */
export function hrefFor(entry: BooksNavEntry): string {
  const policy = routePolicy(entry.policyId);
  if (!policy) throw new Error(`books-nav: unknown route policy ${entry.policyId}`);
  return policy.route;
}

export type NavViewer = AdminViewer;

/**
 * Can this viewer reach the entry's destination?
 *
 * Delegates to the route policy, so the answer is definitionally the answer the
 * page's own guard will give — including the super-admin short-circuit, so the
 * sidebar cannot hide something the server would let them through to.
 */
export function canReachEntry(entry: BooksNavEntry, viewer: NavViewer): boolean {
  return canAccessRoute(viewer, entry.policyId);
}

/** The entries a viewer should see, in order. */
export function visibleBooksNav(viewer: NavViewer): BooksNavEntry[] {
  return BOOKS_NAV.filter((entry) => canReachEntry(entry, viewer));
}
