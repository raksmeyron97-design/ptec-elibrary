// lib/seo/seo-flags.ts
//
// Server-only rollout gates for SEO output.
//
// Modelled on lib/admin/analytics-flags.ts, with one deliberate difference:
// that one defaults to the NEW path in development. These do not. An SEO
// flag governs what a crawler is told, and "on in dev, off in prod" is a
// difference that only shows up as a surprise in a staging crawl or an e2e
// snapshot. OFF everywhere unless the value is exactly "on".
//
// The resolver is exported separately from the reader so the pure builders
// can be handed a boolean: lib/seo/book-seo.ts must stay browser-safe, so
// it may not import this file (lib/cache/cache-safety.test.ts and the
// browser-safety note in CLAUDE.md both depend on that).

import "server-only";

/**
 * Pure, so the rule is testable without stubbing the environment.
 *
 * Anything that is not exactly "on" — unset, "off", "true", "1", "ON " with
 * a stray space, a typo — resolves to false. A flag that can be switched on
 * by accident is not a flag.
 */
export function resolveSeoFlag(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "on";
}

/**
 * Append "(PDF)" to a book's `<title>` when the file is publicly
 * downloadable.
 *
 * OFF until the rights review (SEO5-01) has been worked through: the suffix
 * advertises a downloadable PDF, and advertising one for a book PTEC may not
 * have the right to distribute is the opposite of what this pass is for.
 */
export function pdfTitleSuffixEnabled(): boolean {
  return resolveSeoFlag(process.env.SEO_PDF_TITLE_SUFFIX);
}
