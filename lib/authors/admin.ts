// lib/authors/admin.ts
//
// Pure helpers and types for the author management table. They live here, not
// in app/actions/authors.ts, for two reasons: a "use server" module may only
// export async functions (a non-async export there is a build error), and these
// are the rules worth unit-testing — completeness scoring and duplicate
// detection decide what a librarian is shown and what a merge will do.

/** One row of the admin authors table. */
export interface AdminAuthorRow {
  id: string;
  full_name: string;
  full_name_km: string | null;
  slug: string | null;
  photo_url: string | null;
  position_title: string | null;
  affiliation_name: string | null;
  orcid: string | null;
  email: string | null;
  bio: string | null;
  bio_km: string | null;
  website_url: string | null;
  google_scholar_url: string | null;
  research_gate_url: string | null;
  research_interests: string[];
  is_published: boolean;
  /** How many publications this record is attached to. */
  publicationCount: number;
  /** 0–100. See completeness() for what it counts and why. */
  completeness: number;
  /** Ids of other author records whose name normalises to the same thing. */
  duplicateOf: string[];
}

/** The eight profile fields completeness() weighs, equally. */
export const COMPLETENESS_FIELDS = 8;

/**
 * Profile completeness, as a percentage.
 *
 * The eight fields a scholarly profile page can actually render, weighted
 * equally. The NAME is excluded on purpose — it is required, so counting it
 * would give every record a floor of 12% and make the figure describe the
 * schema rather than the record.
 *
 * This is a nudge, not a grade. A real academic may have no ORCID and no
 * ResearchGate, and 50% for them is a finished profile. It exists so a
 * librarian scanning eighty rows can see at a glance which ones are bare.
 */
export function completeness(author: {
  photo_url?: string | null;
  position_title?: string | null;
  affiliation_name?: string | null;
  bio?: string | null;
  orcid?: string | null;
  website_url?: string | null;
  google_scholar_url?: string | null;
  research_interests?: string[] | null;
}): number {
  const values = [
    author.photo_url,
    author.position_title,
    author.affiliation_name,
    author.bio,
    author.orcid,
    author.website_url,
    author.google_scholar_url,
    author.research_interests?.length ? "y" : null,
  ];
  const filled = values.filter((v) => typeof v === "string" && v.trim().length > 0).length;
  return Math.round((filled / COMPLETENESS_FIELDS) * 100);
}

/**
 * Normalised name key for duplicate detection.
 *
 * Casefolded, punctuation stripped, whitespace collapsed — so "Sok Dara",
 * "sok  dara" and "Sok, Dara" collapse together, which is exactly how one
 * person ends up in the table three times after three separate publication
 * imports.
 *
 * Diacritics are deliberately NOT stripped. "Muller" and "Müller" are
 * different people about as often as they are the same one, and the action
 * this flag leads to — a merge — is destructive. The rule is to under-report
 * rather than over-report: a missed duplicate is a tidy-up left undone, a
 * false one is two academics silently made into one.
 */
export function duplicateKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map each author id to the ids of other records that share its name key.
 * Empty array for a record with no duplicates.
 */
export function duplicateGroups(
  authors: { id: string; full_name: string }[],
): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const author of authors) {
    const key = duplicateKey(author.full_name ?? "");
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), author.id]);
  }

  const result = new Map<string, string[]>();
  for (const author of authors) {
    const key = duplicateKey(author.full_name ?? "");
    result.set(author.id, (byKey.get(key) ?? []).filter((id) => id !== author.id));
  }
  return result;
}
