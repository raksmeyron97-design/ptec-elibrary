// lib/publications/article-layout.ts
//
// The decisions the journal article page makes about WHAT to show, kept out of
// the page and out of the components so they can be tested without rendering
// either. Pure and browser-safe.
//
// Four rules live here:
//
//  1. A section and its "On this page" entry come from the SAME flag, in one
//     fixed order — a nav entry can never point at a section that did not
//     render (the dead-anchor defect the old chip bar was built to avoid).
//  2. Related scholarship is shown once. The journal list, the author list and
//     the related list are fetched independently and overlap by construction
//     (getRelatedPublications' first tier IS "same journal"); the stronger
//     relationship keeps the item.
//  3. Dates are the record's own. The article's publication date leads; the
//     issue's date is shown only when it says something different.
//  4. Affiliation markers are numbered by first appearance in the byline, so
//     the superscripts read 1, 2, 3 left to right.

import type { PublicationAffiliation, PublicationAuthorship } from "@/lib/publications";

// ── 1. Sections ─────────────────────────────────────────────────────────────

/** Every section the article body can render, in reading order. */
export const ARTICLE_SECTIONS = [
  "abstract",
  "toc",
  "outcomes",
  "fulltext",
  "figures",
  "references",
  "authors",
  "reviews",
  "faq",
  "related",
] as const;

export type ArticleSectionId = (typeof ARTICLE_SECTIONS)[number];
export type ArticleSectionFlags = Record<ArticleSectionId, boolean>;
export type ArticleSectionLink = { id: ArticleSectionId; label: string };

/**
 * The "On this page" entries for the sections that actually rendered, in the
 * order they appear. `labels` is total over the ids so a new section cannot be
 * added without a label.
 */
export function articleSections(
  has: ArticleSectionFlags,
  labels: Record<ArticleSectionId, string>,
): ArticleSectionLink[] {
  return ARTICLE_SECTIONS.filter((id) => has[id]).map((id) => ({ id, label: labels[id] }));
}

// ── 2. Related scholarship ──────────────────────────────────────────────────

type WithId = { id: string };

/**
 * Drop from each weaker list anything a stronger list already shows.
 * Strength follows the page's order: journal, then authors, then related.
 * Each list keeps its own order; nothing is added.
 */
export function dedupeScholarship<J extends WithId, A extends WithId, R>(input: {
  journal: readonly J[];
  authors: readonly A[];
  related: readonly R[];
  relatedId: (item: R) => string;
}): { journal: J[]; authors: A[]; related: R[] } {
  const seen = new Set(input.journal.map((j) => j.id));
  const authors = input.authors.filter((a) => !seen.has(a.id));
  for (const a of authors) seen.add(a.id);
  const related = input.related.filter((r) => !seen.has(input.relatedId(r)));
  return { journal: [...input.journal], authors, related };
}

// ── 3. Dates ────────────────────────────────────────────────────────────────

/** The calendar day of an ISO date/timestamp, or null when it is not a date. */
function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Which dates the header states.
 *
 * `published` is the article's own date, falling back to when the library
 * published the record — the same fallback the page, the JSON-LD and the
 * Scholar tags have always used, so the three agree. `issue` is the issue's
 * date, shown only when it is a different day: an issue whose date equals the
 * article's is one fact, not two.
 */
export function articleDates(input: {
  publicationDate: string | null | undefined;
  publishedAt: string | null | undefined;
  issueDate: string | null | undefined;
}): { published: string | null; issue: string | null } {
  const published = dayOf(input.publicationDate) ? input.publicationDate! : dayOf(input.publishedAt) ? input.publishedAt! : null;
  const issueDay = dayOf(input.issueDate);
  const issue = issueDay && issueDay !== dayOf(published) ? input.issueDate! : null;
  return { published, issue };
}

// ── 4. Affiliation markers ──────────────────────────────────────────────────

export type NumberedAffiliation = { marker: number; affiliation: PublicationAffiliation };

/**
 * Superscript numbers for the byline, by order of first appearance, and the
 * affiliation list those numbers refer to. An id with no loaded affiliation row
 * gets no number at all — a marker must never point at nothing.
 */
export function affiliationMarkers(
  authorships: readonly PublicationAuthorship[],
  affiliations: readonly PublicationAffiliation[],
): { markerFor: Map<string, number>; ordered: NumberedAffiliation[] } {
  const byId = new Map(affiliations.map((a) => [a.id, a]));
  const markerFor = new Map<string, number>();
  const ordered: NumberedAffiliation[] = [];
  for (const a of authorships) {
    for (const id of a.affiliation_ids) {
      const affiliation = byId.get(id);
      if (!affiliation || markerFor.has(id)) continue;
      markerFor.set(id, markerFor.size + 1);
      ordered.push({ marker: markerFor.size, affiliation });
    }
  }
  return { markerFor, ordered };
}
