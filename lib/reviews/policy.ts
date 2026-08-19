// Which content types accept star ratings and reader reviews.
//
// A 5-star widget is a consumer-review affordance. On a peer-reviewed journal
// article it conflates "I enjoyed this" with scholarly assessment, and a
// single one-word review ("good") becomes the visible quality signal on a
// record that carries a DOI. Books and theses in a teaching library are a
// different case: reader feedback there is genuinely useful to students.
//
// So this is a per-content-type switch, not a removal. Existing review rows
// are never deleted — display is gated, the data stays, and flipping the flag
// back restores everything.

export type ReviewableContentType = "book" | "thesis" | "publication";

/**
 * Publications default to OFF. This is a product decision surfaced for a human
 * to confirm or reverse (see the handoff notes); flipping the value here is
 * the whole change, and no data is affected either way.
 */
const REVIEWS_ENABLED: Record<ReviewableContentType, boolean> = {
  book: true,
  thesis: true,
  publication: false,
};

export function reviewsEnabled(contentType: ReviewableContentType): boolean {
  return REVIEWS_ENABLED[contentType] ?? false;
}

/**
 * Aggregate rating may only be published where reviews are published. This
 * keeps `aggregateRating` out of the JSON-LD for types whose widget is off —
 * emitting a rating that appears nowhere on the page is a structured-data
 * mismatch Google flags.
 */
export function aggregateRatingAllowed(contentType: ReviewableContentType): boolean {
  return reviewsEnabled(contentType);
}
