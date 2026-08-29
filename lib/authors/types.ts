// lib/authors/types.ts
//
// Browser-safe types for the public author profile (/authors/[slug]). No
// server-only imports — the works list is a Client Component (it owns search
// and filtering) and needs these.

/** A work of any kind attributed to an author, normalised for one list. */
export type AuthorWorkType = "publication" | "thesis" | "ebook" | "catalog";

export interface AuthorWork {
  id: string;
  type: AuthorWorkType;
  title: string;
  href: string;
  /** Abstract/description, already trimmed. Null when the record has none. */
  excerpt: string | null;
  /** Four-digit year, or null when the record carries no usable date. */
  year: number | null;
  /** Journal, department, publisher — whatever names where the work sits. */
  venue: string | null;
  /** Full byline, so a co-authored work reads as co-authored in the list. */
  byline: string | null;
  doi: string | null;
  coverUrl: string | null;
  /**
   * False when the record exists but its full text is not downloadable —
   * either no file, or a policy/rights denial. The list shows "online reading
   * only" rather than a download affordance that would 403.
   */
  downloadable: boolean;
}

/**
 * The academic identity. Every field beyond `name` is optional, and the page
 * renders nothing for the ones that are absent — an author with only a name
 * gets a name and a works list, not a scaffold of empty sections.
 */
export interface AuthorProfile {
  slug: string;
  name: string;
  /** Khmer name, when the record has one distinct from `name`. */
  nameKm: string | null;
  photoUrl: string | null;
  positionTitle: string | null;
  affiliation: string | null;
  bio: string | null;
  bioKm: string | null;
  researchInterests: string[];
  orcid: string | null;
  websiteUrl: string | null;
  googleScholarUrl: string | null;
  researchGateUrl: string | null;
  works: AuthorWork[];
}

/** Derived figures shown in the profile's statistics strip. */
export interface AuthorStats {
  workCount: number;
  /** null when no work carries a year. */
  firstYear: number | null;
  lastYear: number | null;
  /** How many distinct kinds of work — 1 is not worth showing as a "variety". */
  typeCount: number;
  /** Counts per type, for the works-list filter chips. Only non-zero types. */
  byType: { type: AuthorWorkType; count: number }[];
}
