// lib/subjects/matching.ts
//
// How a resource is decided to belong to a subject. PURE and browser-safe so
// the rules are unit-testable without a database (lib/subjects/matching.test.ts).
//
// These predicates are the reason this file exists separately from the queries:
// the subject hub counts resources in memory across every subject at once,
// while the subject detail page filters in the database for one subject. Two
// code paths, one rule — otherwise a hub advertising "12 resources" can open a
// page listing nine, which is exactly the kind of drift
// lib/resource-stats-consistency.test.ts exists to prevent elsewhere.
//
// The matching is inherited, not invented. Only books carry a real foreign key
// (`books.category_id`); theses, publications and catalog records associate by
// NAME, because that is how those tables were modelled. Matching by name is
// lossy, and V2 does not paper over it — see docs/CANONICAL-RESOURCES.md for
// the `subjects`/`resource_subjects` tables that will eventually replace it.

/** Case- and whitespace-insensitive comparison key for a subject name. */
export function subjectKey(name: string | null | undefined): string {
  return (name ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Substring association, the rule the thesis and catalog tables use. */
function containsSubject(field: string | null | undefined, key: string): boolean {
  if (!key) return false;
  return subjectKey(field).includes(key);
}

export type ThesisSubjectFields = {
  subject?: string | null;
  program?: string | null;
  faculty?: string | null;
};

/** A thesis belongs to a subject when ANY of its three taxonomy columns names
 *  it. Mirrors the `.or(subject.ilike,program.ilike,faculty.ilike)` filter. */
export function thesisMatchesSubject(row: ThesisSubjectFields, name: string): boolean {
  const key = subjectKey(name);
  return (
    containsSubject(row.subject, key) ||
    containsSubject(row.program, key) ||
    containsSubject(row.faculty, key)
  );
}

/** Publications carry a `subjects` text[]. Membership is EXACT (the DB filter
 *  is `.contains("subjects", [name])`), not substring. */
export function publicationMatchesSubject(
  subjects: readonly (string | null)[] | null | undefined,
  name: string,
): boolean {
  const key = subjectKey(name);
  if (!key) return false;
  return (subjects ?? []).some((s) => subjectKey(s) === key);
}

/** Catalog records carry a free-text `category`. Substring, like theses. */
export function catalogMatchesSubject(
  category: string | null | undefined,
  name: string,
): boolean {
  return containsSubject(category, subjectKey(name));
}
