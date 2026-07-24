// lib/resources/types.ts
//
// Canonical resource vocabulary shared by the consolidated resource tables
// (contributors, files, subjects, references — migrations 0104-0109) and the
// services that read them. This is the ONE place the polymorphic
// (resource_type, resource_id) type union is defined for the app; the DB
// mirrors it in CHECK constraints on each link table.
//
// Pure module — no server imports — so it is usable from client components
// (badges, filters) and unit tests.

/** The resource types that participate in the canonical link tables. */
export const RESOURCE_TYPES = ["book", "thesis", "publication", "learning_path"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export function isResourceType(v: unknown): v is ResourceType {
  return typeof v === "string" && (RESOURCE_TYPES as readonly string[]).includes(v);
}

/** Contributor roles (mirrors resource_contributors.role CHECK). */
export const CONTRIBUTOR_ROLES = [
  "author", "editor", "advisor", "supervisor", "translator",
  "compiler", "reviewer", "illustrator", "publisher", "institution",
] as const;
export type ContributorRole = (typeof CONTRIBUTOR_ROLES)[number];

/** File roles (mirrors resource_files.file_role CHECK). */
export const FILE_ROLES = [
  "primary_pdf", "epub", "cover", "thumbnail", "preview",
  "supplementary", "dataset", "attachment", "transcript",
] as const;
export type FileRole = (typeof FILE_ROLES)[number];

/**
 * The legacy table each resource type currently lives in. Kept here so
 * services and reconciliation code never re-hardcode the mapping. Note the
 * historical naming: theses are the `research_reports` table (see CLAUDE.md).
 */
export const RESOURCE_TABLE: Record<ResourceType, string> = {
  book: "books",
  thesis: "research_reports",
  publication: "publications",
  learning_path: "learning_paths",
};
