// lib/seo/description-gate.ts
//
// The description indexing gate (SEO Phase 5.4, finding F3) — OFF until the
// owner approves it (SEO_DESCRIPTION_GATE=on). Pure.
//
// A record with no file a reader can open, whose description is empty or the
// same template as four or more other books, says nothing on its page that a
// search result does not already say. Such a record is `noindex, follow` and
// out of the sitemap until a librarian approves a description of its own
// (0164). A record WITH a file stays indexable whatever its description: the
// book itself is the content. Measured 2026-10-01: 2 of 1,956 books qualify.

/** A template shared by this many books (the book included) is boilerplate. */
export const TEMPLATED_CLUSTER_MIN = 5;

export type DescriptionGateFacts = {
  hasFile: boolean;
  /** Books sharing this book's description template, itself included. */
  templateClusterSize: number;
  descriptionEmpty: boolean;
  /** books.description_status (0164); 'approved' always passes. */
  descriptionStatus?: string | null;
};

export function withheldByDescriptionGate(facts: DescriptionGateFacts, enabled: boolean): boolean {
  if (!enabled) return false;
  if (facts.hasFile) return false;
  if (facts.descriptionStatus === "approved") return false;
  return facts.descriptionEmpty || facts.templateClusterSize >= TEMPLATED_CLUSTER_MIN;
}
