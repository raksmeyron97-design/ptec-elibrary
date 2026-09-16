// lib/books/featured.ts
//
// Editorial curation, as a pure decision. "Featured by PTEC Library" is the
// third axis of a book's life (migration 0149) — publication is `status`,
// verification is `verified_at`, curation is these three columns — and this
// module owns every rule about it that is not a database write.
//
// Pure and browser-safe on purpose, the same reason lib/books/access.ts is:
// the row menu that offers "Add to Featured", the management page that
// reorders the shelf, and the Server Action that performs both all ask the
// SAME function. A control that appears where the server would refuse is the
// failure this shape rules out.

// ── Eligibility ─────────────────────────────────────────────────────────────

/** The fields of a book row this decision reads. */
export interface FeatureEligibilityInput {
  /** Canonical or raw editorial status (0086). */
  status?: string | null;
  /** Verification stamp (0062). Null => no librarian has checked the metadata. */
  verifiedAt?: string | null;
}

export type FeatureBlocker =
  /** Not public. The shelf is a public surface; it cannot advertise a draft. */
  | "not_published"
  /** Public but never checked. Its citation box still carries the
   *  "not yet verified by library staff" warning — promoting that to the
   *  front of /books would put the library's name on an unchecked record. */
  | "not_verified";

export interface FeatureEligibility {
  eligible: boolean;
  /** Every reason it cannot be featured, in the order a librarian fixes them. */
  blockers: FeatureBlocker[];
}

/**
 * May this book be featured?
 *
 * Published AND verified, both. The two are independent axes and this is the
 * one place in the product that requires both at once, which is exactly why it
 * is stated once: "verified" is not "published", and a book can sit at either
 * without the other.
 *
 * Deliberately strict in one direction only — an already-featured book that
 * later loses one of the two is NOT force-unfeatured here. Withdrawal is a
 * librarian's decision, and the admin shelf flags such a row (see
 * `featuredRowWarning`) rather than acting on their behalf. The public shelf
 * filters on `is_published` regardless, so an unpublished book disappears from
 * readers' view the moment it is unpublished, featured or not.
 */
export function assessFeatureEligibility(book: FeatureEligibilityInput): FeatureEligibility {
  const blockers: FeatureBlocker[] = [];
  if (book.status !== "published") blockers.push("not_published");
  if (!book.verifiedAt) blockers.push("not_verified");
  return { eligible: blockers.length === 0, blockers };
}

/**
 * The warning a featured row carries when the book no longer satisfies the
 * rule that let it on the shelf — an editor unpublished it, or its
 * verification was withdrawn, after it was featured. Null when all is well.
 *
 * This is a flag, never an eviction: the row stays, visibly wrong, so the
 * librarian decides. Silently dropping it would make the shelf disagree with
 * itself between two page loads with nobody told why.
 */
export function featuredRowWarning(book: FeatureEligibilityInput): FeatureBlocker | null {
  return assessFeatureEligibility(book).blockers[0] ?? null;
}

// ── Ordering ────────────────────────────────────────────────────────────────

/**
 * There is no product-level cap on the shelf.
 *
 * Stated as a constant rather than left implicit because "is there a maximum?"
 * is a question the management page has to answer in words, and inventing a
 * round number (12 is the tempting one) would be a policy nobody decided.
 */
export const FEATURED_BOOKS_MAX: number | null = null;

/**
 * How many featured books /books actually renders.
 *
 * This is a RENDER bound on one section of a listing page, not a product cap
 * on curation — `FEATURED_BOOKS_MAX` is null and stays null. It exists so a
 * mis-click cannot push the whole collection below a hundred promoted cards,
 * and the admin shelf states it in words whenever more books are featured than
 * this, rather than silently truncating and leaving a librarian to wonder why
 * position 31 never appears.
 */
export const PUBLIC_FEATURED_RENDER_LIMIT = 24;

/** Positions are 1-based and contiguous — see migration 0149. */
export function positionLabel(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/**
 * Move the item at `from` to `to`, returning a NEW array.
 *
 * Both the drag handler and the keyboard Move up / Move down buttons route
 * through this, so the two interactions cannot produce different orders — the
 * bug that makes an accessible fallback worse than no fallback.
 * Out-of-range indices are a no-op rather than a throw: a drag that ends
 * outside the list is an ordinary gesture, not an error.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  if (to < 0 || to >= next.length) return next;
  if (from === to) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Same order, same length, same members — has the librarian actually changed anything? */
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Is `next` a valid reordering of `current` — a permutation, nothing added,
 * nothing dropped, nothing duplicated?
 *
 * The client's reorder is a rearrangement by construction, so this is not
 * about trusting it: it is the assertion that turns a stale client (someone
 * else featured a book while this page was open) into a refusal instead of a
 * silent partial apply. `set_featured_book_order()` re-checks the same thing
 * against the live rows, which is where the real guarantee lives; this one
 * lets the page say so before spending a round trip.
 */
export function isReorderOf(current: readonly string[], next: readonly string[]): boolean {
  if (current.length !== next.length) return false;
  if (new Set(next).size !== next.length) return false;
  const have = new Set(current);
  return next.every((id) => have.has(id));
}
