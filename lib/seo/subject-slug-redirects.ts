// The ten subject URLs that changed, and the 301s that keep them alive.
//
// Relative imports only, and no runtime dependencies: next.config.ts imports
// this module directly and path aliases are not resolved inside it (same rule
// as ./indexing.ts).
//
// ── Why these URLs exist ─────────────────────────────────────────────────────
//
// `slugify()` (lib/book-utils.ts) falls back to `book-${Date.now()}` when
// unicodeSlug() returns empty. It no longer does for Khmer — unicodeSlug keeps
// \p{L}\p{M}\p{N}, so a Khmer name slugs to itself — but before that fix every
// Khmer category got a timestamp. Nine survived, and because they hold ~200 of
// the library's 270 published books they are its most-linked subject URLs:
// /subjects/book-1781238023578 is Research, with 65 books under it.
//
// ── Why the targets are not a judgement call ─────────────────────────────────
//
// Each target is `slugify(name)` evaluated with today's function — the same
// value the app would mint for that category now, and the reason the other
// fourteen categories already read as Khmer. Nothing here is translated or
// invented: an English target would require inventing a name the database does
// not hold. lib/seo/subject-slug-redirects.test.ts recomputes every target
// from `name` through the real slugify() and fails if this table drifts.
//
// ── Why these are static, not a lookup table ─────────────────────────────────
//
// These nine are permanent historical URLs — a fixed, closed set. A DB-backed
// redirect (as books and catalogs have) would need a `category_slug_redirects`
// table AND a /subjects edge gate, which was deliberately deferred because a
// subject slug is a matching rule over `categories`, not a gateable column.
// next.config.ts `redirects()` runs BEFORE middleware, costs no query and no
// runtime work, and cannot fail open.
//
// KNOWN GAP, recorded rather than silently accepted: this does not make future
// category renames safe. An admin renaming a category still breaks its old URL,
// exactly as before. Closing that needs the redirect table above, and is not
// part of this change.

export type SubjectSlugRedirect = {
  /** The retired `book-<epoch>` slug, as it appears in Google's index. */
  readonly from: string;
  /** `slugify(name)` — what the app mints for this category today. */
  readonly to: string;
  /** The category's `name` column. The target is derived from this. */
  readonly name: string;
};

/**
 * Ordered by collection size, largest first — the order in which losing one
 * would hurt most. Verified against live production on 2026-09-10.
 */
export const SUBJECT_SLUG_REDIRECTS: readonly SubjectSlugRedirect[] = [
  { from: "book-1781238023578", to: "ស្រាវជ្រាវ", name: "ស្រាវជ្រាវ" },
  { from: "book-1781238033853", to: "គរុកោសល្យ", name: "គរុកោសល្យ" },
  { from: "book-1781238024978", to: "ស្រាវជ្រាវប្រតិបត្តិ", name: "ស្រាវជ្រាវប្រតិបត្តិ" },
  { from: "book-1781238124806", to: "វិទ្យាសាស្ត្រ", name: "វិទ្យាសាស្ត្រ" },
  { from: "book-1781238075501", to: "គណិតវិទ្យា", name: "គណិតវិទ្យា" },
  { from: "book-1781238041127", to: "ភាសាអង់គ្លេសសិក្សា", name: "ភាសាអង់គ្លេសសិក្សា" },
  { from: "book-1781238035277", to: "ស្រាវជ្រាវបែបគុណភាព", name: "ស្រាវជ្រាវបែបគុណភាព" },
  { from: "book-1781238028353", to: "ស្ថិតិ-និងវិភាគទិន្នន័យ", name: "ស្ថិតិ និងវិភាគទិន្នន័យ" },
  { from: "book-1781238123460", to: "កម្មវិធីសិក្សា", name: "កម្មវិធីសិក្សា" },
  // The tenth, found on production 2026-09-12 and migrated by 0143. Its
  // timestamp is ~1,176 s later than the latest of the nine above: a category
  // created after that set was enumerated but before slugify() stopped
  // falling back to `book-${Date.now()}` for Khmer, so 0142 could not see it.
  // 18 resources, indexed, self-canonical. See docs/SEO-3.0-AUDIT.md F-4.
  { from: "book-1781239299098", to: "កញ្ជប់គណិតវិទ្យា", name: "កញ្ជប់គណិតវិទ្យា" },
] as const;

/** A slug minted by the pre-unicodeSlug fallback. */
export const LEGACY_SUBJECT_SLUG = /^book-\d+$/;

/**
 * The `redirects()` entries for both locales.
 *
 * English is unprefixed and Khmer lives under /km, so each retired slug needs
 * two rules. Config redirects run before middleware, so the /km form must be
 * stated explicitly — middleware has not stripped it yet at this point.
 *
 * `statusCode: 301`, not `permanent: true`. Next maps `permanent` to **308**,
 * and while Google treats 308 and 301 alike for link equity, every other
 * retired URL in this app answers 301: legacy `/theses/<uuid>`, the `/en`
 * strip, and a retired catalog slug all use `NextResponse.redirect(…, 301)`.
 * A retired subject slug is the same kind of event and gives the same answer.
 *
 * Destinations are percent-encoded: a `Location` header is a URI, and the
 * targets are Khmer.
 */
export const SUBJECT_REDIRECT_STATUS = 301;

export function subjectSlugRedirectRules(): {
  source: string;
  destination: string;
  statusCode: number;
}[] {
  return SUBJECT_SLUG_REDIRECTS.flatMap(({ from, to }) =>
    ["", "/km"].map((prefix) => ({
      source: `${prefix}/subjects/${from}`,
      destination: `${prefix}/subjects/${encodeURIComponent(to)}`,
      statusCode: SUBJECT_REDIRECT_STATUS,
    })),
  );
}
