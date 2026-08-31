// lib/subjects/labels.ts
//
// Turning subject counts into the localized phrases the UI shows.
//
// PURE and browser-safe (no server-only import), separate from
// lib/subjects/index.ts, because the subject hub and the subject detail page
// both render the same "8 e-books · 2 theses" breakdown. Two copies of the
// message-key mapping is how one surface ends up saying "publications" while
// the other says "articles" for the same number.

export const SUBJECT_RESOURCE_TYPES = ["book", "thesis", "publication", "catalog"] as const;
export type SubjectResourceType = (typeof SUBJECT_RESOURCE_TYPES)[number];

export type SubjectCounts = Record<SubjectResourceType, number> & { total: number };

/** Message-key suffix for a resource type: "book" → "Book". Keeps the
 *  `countBook` / `groupBook` / `typeBook` / `browseAllBook` families derivable
 *  from the type rather than hand-listed at every call site. */
export function subjectTypeKey(type: SubjectResourceType): string {
  return type[0].toUpperCase() + type.slice(1);
}

/**
 * Minimal shape of a next-intl translator, so this file needs no next-intl
 * import and stays trivially testable.
 *
 * `values` is the ICU argument type, NOT `Record<string, unknown>`: a wider
 * parameter type here is not assignable from next-intl's own `Translator`
 * under strictFunctionTypes, and the call site fails to compile.
 */
type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

/**
 * Localized phrases for the resource types a subject ACTUALLY has —
 * `["8 e-books", "2 theses"]`.
 *
 * Zero-count types are omitted rather than rendered as "0 theses": the
 * breakdown states what is there, and `public.categories` carries no
 * description column, so counts are the only thing a subject page can honestly
 * say about itself.
 */
export function subjectBreakdown(counts: SubjectCounts, t: Translate): string[] {
  return SUBJECT_RESOURCE_TYPES.filter((type) => counts[type] > 0).map((type) =>
    t(`count${subjectTypeKey(type)}`, { count: counts[type] }),
  );
}
