// Pure, browser-safe rules that decide what a publication page is allowed to
// ASSERT about a record. No server imports — the detail page, the hero, the
// sidebar and the tests all read the same functions, so a claim can never be
// true in one block and false in another.
//
// Three separate concerns live here because all three were, at some point,
// decided independently by whichever component happened to render them:
//
//   1. Access status  — whether we may badge an item "Open Access".
//   2. Metrics        — one derivation of views/downloads/references/year.
//   3. Bilingual pairs— when a *_km value is a real translation vs a copy.

import type { Publication } from "@/lib/publications";

/* ─────────────────────────── 1. Access status ─────────────────────────── */

/**
 * "open"       — the record carries a licence we recognise as open.
 * "restricted" — the record carries a licence, but not an open one.
 * "unknown"    — no licence recorded. We claim nothing.
 *
 * Only "open" may be badged. A missing licence is NOT open access; the page
 * previously badged every publication "Open Access" unconditionally, which
 * asserted redistribution rights the library has not verified for third-party
 * articles (see docs/PUBLICATION-RIGHTS.md).
 */
export type AccessStatus = "open" | "restricted" | "unknown";

// Matched against a lowercased, punctuation-normalised licence string.
const OPEN_LICENCE_PATTERNS: RegExp[] = [
  /\bcc[\s-]?by\b/,          // CC BY, CC-BY-SA, CC BY-NC ... all Creative Commons BY variants
  /\bcc[\s-]?0\b/,           // CC0
  /\bcreative\s?commons\b/,
  /\bpublic\s?domain\b/,
  /\bopen\s?access\b/,
  /\bgpl\b|\bmit\b|\bapache\b/, // occasionally used for teaching materials
];

export function accessStatus(license: string | null | undefined): AccessStatus {
  const raw = license?.trim();
  if (!raw) return "unknown";
  const normalised = raw.toLowerCase().replace(/[._]/g, " ");
  return OPEN_LICENCE_PATTERNS.some((re) => re.test(normalised)) ? "open" : "restricted";
}

/** Only an explicitly recognised open licence earns the badge. */
export function canBadgeOpenAccess(license: string | null | undefined): boolean {
  return accessStatus(license) === "open";
}

/* ───────────────────────────── 2. Metrics ─────────────────────────────── */

export interface PublicationMetrics {
  /** null when the metric is below the publish threshold — render nothing. */
  views: number | null;
  downloads: number | null;
  referenceCount: number | null;
  year: string | null;
}

/**
 * A count at zero is omitted, not printed. "0 views · 0 downloads · 0
 * references" on a scholarly record reads as a broken counter, and on a young
 * collection it repeats "nobody has been here" across every page. This matches
 * the rule ResourceMetrics already enforces on every card surface.
 *
 * The threshold is 1: we suppress only genuine zeros, never real activity.
 */
export const METRIC_PUBLISH_THRESHOLD = 1;

/**
 * One count, zero-suppressed. Exported so any detail surface (theses included)
 * applies the identical rule rather than re-deciding what a 0 means.
 */
export function publishableCount(n: number | null | undefined): number | null {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v >= METRIC_PUBLISH_THRESHOLD ? v : null;
}

/**
 * The single derivation of every number the publication page displays.
 *
 * Both the masthead strip and the sidebar rail call this with the same
 * publication, so they cannot disagree. The reference count is derived from
 * the references array the References section itself renders — never from a
 * separate stored column that can drift.
 *
 * View counts are reported as stored. The page previously added +1 on render
 * to account for the in-flight view ping; that made the displayed figure a
 * prediction rather than a record, and it was applied in two places
 * independently.
 */
export function publicationMetrics(
  pub: Pick<Publication, "view_count" | "download_count" | "references">,
  year: string | null,
): PublicationMetrics {
  return {
    views: publishableCount(pub.view_count),
    downloads: publishableCount(pub.download_count),
    referenceCount: publishableCount(pub.references?.length ?? 0),
    year,
  };
}

/** True when every metric is suppressed — callers render no strip at all. */
export function metricsAreEmpty(m: PublicationMetrics): boolean {
  return m.views === null && m.downloads === null && m.referenceCount === null && !m.year;
}

/* ──────────────────────── 3. Bilingual value pairs ────────────────────── */

/**
 * Returns the secondary (Khmer) value only when it is a real alternative to
 * the primary one.
 *
 * Admin forms across this app offer a `*_km` field beside every `*` field, and
 * staff routinely paste the same string into both. Rendering the pair
 * unguarded produced "Ron Raksmey (Ron Raksmey)" in the affiliation panel —
 * the duplicated-name defect. The hero already guarded title/title_km this
 * way; this makes the rule shared instead of re-implemented per component.
 */
export function secondaryValue(
  primary: string | null | undefined,
  secondary: string | null | undefined,
): string | null {
  const a = primary?.trim() ?? "";
  const b = secondary?.trim() ?? "";
  if (!b) return null;
  if (a.toLowerCase() === b.toLowerCase()) return null;
  return b;
}

/* ─────────────────────── 4. Content-language notice ───────────────────── */

/**
 * Whether to tell the reader that the full text is not in the language they
 * are browsing in. The interface is bilingual; the scholarship is not. A
 * Khmer reader landing on an English article should be told so plainly rather
 * than left to conclude the translation is broken.
 *
 * `language` is the record's own content language (already on the model and
 * already emitted as citation_language) — no new column is required.
 */
export function needsLanguageNotice(
  contentLanguage: string | null | undefined,
  activeLocale: string,
): boolean {
  const content = (contentLanguage ?? "").trim().toLowerCase().slice(0, 2);
  const active = activeLocale.trim().toLowerCase().slice(0, 2);
  if (!content || !active) return false;
  return content !== active;
}
