// lib/subjects/indexability.ts
//
// WHETHER a subject hub may be indexed, linked and advertised — the SEO 3.3 §5
// criteria, as one pure decision.
//
// PURE and browser-safe, like lib/subjects/matching.ts, and for the same
// reason: the answer is needed in three places that cannot share a query —
// the page's `robots` meta (generateMetadata), the sitemap, and the hub's link
// list. Three copies of "is this one deep enough" is how a URL ends up
// submitted in sitemap.xml while the page it points at says `noindex`, which
// is a direct contradiction in the one place a crawler reads both.
//
// ── What was actually live ───────────────────────────────────────────────────
//
// The V2 gate was `counts.total > 0`: every subject holding a single resource
// was `index, follow` AND in the sitemap. Production carried a hub with ONE
// book (វិធីសាស្ត្របង្រៀនរូបវិទ្យា, 23 extracted pages) advertised exactly like
// the 65-book research collection. A list of one is the thin-content shape this
// phase exists to remove; docs/SEO-3.3-TOPIC-AUTHORITY-AUDIT.md §5, §6.2.
//
// ── The three states, and why "noindex" is not "suppressed" ──────────────────
//
//   index       deep enough to be an answer: crawl it, index it, advertise it.
//   noindex     a real destination for a reader, not a search result. It stays
//               linked from the hub and stays `follow`, so its resources keep
//               receiving link equity — what is withdrawn is the claim that the
//               PAGE is worth ranking, not the page itself.
//   suppressed  nothing to stand on (0 or 1 resource): also dropped from the
//               hub's link list and from the ItemList that describes it, so the
//               site does not advertise a destination it will not vouch for.
//
// Only criteria 1 and 2 are decided here, because only they vary per subject on
// the data this schema holds. The other three are structural and already hold:
// §5.3 (distinct label) — categories are the only routable taxonomy, so the 12
// measured cross-taxonomy collisions cannot produce two competing URLs today;
// §5.4 (stable slug) — every hub is slug-gated (lib/resource-slug-gate.ts);
// §5.5 (both locales) — one row set renders both locales, so a subject is never
// non-empty in one and empty in the other. Adding a second routable taxonomy is
// what would make §5.3 a live per-subject question, and it must be re-decided
// here rather than at that new surface.

import type { SubjectCounts } from "@/lib/subjects/labels";

/** §5.1 — below this a hub is a list, not a page. */
export const SUBJECT_MIN_RESOURCES = 5;

/** §5.2 — below this a hub's items cannot be searched inside or cited by an
 *  AI answer, which makes it a directory entry rather than a topic surface. */
export const SUBJECT_MIN_FULL_TEXT = 3;

/** At or below this a hub is not advertised at all — not in the sitemap and
 *  not in the hub's own link list. One resource is not a collection. */
export const SUBJECT_SUPPRESS_AT_OR_BELOW = 1;

export type SubjectVisibility = "index" | "noindex" | "suppressed";

/**
 * The visibility of one subject hub.
 *
 * `fullText` is the number of its resources with extracted full text, or
 * `null` when that could not be read. **`null` is not zero**: treating an
 * unavailable read as "no full text anywhere" would demote every subject in the
 * library at once, on one flaky query — the same failure shape as a contributor
 * graph timing out and publishing a page with no byline
 * (lib/resources/contributor-view.ts). Unknown therefore cannot DEMOTE: the
 * decision falls back to criterion 1 alone, which is the pre-3.3 behaviour.
 */
export function subjectVisibility(
  counts: Pick<SubjectCounts, "total">,
  fullText: number | null,
): SubjectVisibility {
  if (counts.total <= SUBJECT_SUPPRESS_AT_OR_BELOW) return "suppressed";
  if (counts.total < SUBJECT_MIN_RESOURCES) return "noindex";
  if (fullText !== null && fullText < SUBJECT_MIN_FULL_TEXT) return "noindex";
  return "index";
}

/** May this hub be indexed and submitted in the sitemap? */
export function isIndexableSubject(
  counts: Pick<SubjectCounts, "total">,
  fullText: number | null,
): boolean {
  return subjectVisibility(counts, fullText) === "index";
}

/** May this hub be linked as a destination (hub list, related rail, ItemList)?
 *  Wider than indexable on purpose — a thin subject is still a real place. */
export function isBrowsableSubject(
  counts: Pick<SubjectCounts, "total">,
  fullText: number | null,
): boolean {
  return subjectVisibility(counts, fullText) !== "suppressed";
}
