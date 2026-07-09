/**
 * Pure validation rules for thesis create/edit/publish (spec §26). No
 * server/client split needed — these run in the Server Action and can be
 * re-run client-side for inline feedback since they touch no I/O.
 */

export type ThesisValidationInput = {
  title: string;
  slug: string;
  program: string | null;
  cohort: string | null;
  academicYear: string | null;
  authorNames: string | null;
  advisorName: string | null;
  fileUrl: string | null;
  coverUrl: string | null;
  abstract: string | null;
  keywords: string[];
  references: string | null;
  license: string | null;
};

export type ThesisValidationErrors = Partial<Record<
  "title" | "slug" | "program" | "cohort" | "academicYear" | "authorNames" | "fileUrl",
  string
>>;

export type ThesisPublishWarning = { key: string; label: string };

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Minimal check before saving any draft — a thesis needs at least a title to exist. */
export function validateThesisDraft(input: { title: string }): ThesisValidationErrors {
  const errors: ThesisValidationErrors = {};
  const title = input.title.trim();
  if (!title) errors.title = "Title is required";
  else if (title.length < 3) errors.title = "Title must be at least 3 characters";
  else if (title.length > 250) errors.title = "Title must be 250 characters or fewer";
  return errors;
}

/**
 * Required-before-publish rules (spec §26): title, slug, program, cohort,
 * academic year, at least one author, and a PDF. Everything else
 * (advisor/abstract/keywords/references/cover/license) is a warning, not a
 * hard block.
 */
export function validateThesisPublish(input: ThesisValidationInput): ThesisValidationErrors {
  const errors = validateThesisDraft(input) as ThesisValidationErrors;

  const slug = input.slug.trim();
  if (!slug) errors.slug = "Slug is required before publishing";
  else if (!SLUG_RE.test(slug)) errors.slug = "Slug must be lowercase letters, numbers, and hyphens only";

  if (!input.program) errors.program = "Program is required before publishing";
  if (!input.cohort) errors.cohort = "Cohort is required before publishing";
  if (!input.academicYear) errors.academicYear = "Academic year is required before publishing";
  if (!input.authorNames?.trim()) errors.authorNames = "At least one author is required before publishing";
  if (!input.fileUrl) errors.fileUrl = "A PDF file is required before publishing";

  return errors;
}

/** Strongly-recommended-but-not-blocking fields — surfaced as warnings on the Review step. */
export function thesisPublishWarnings(input: ThesisValidationInput): ThesisPublishWarning[] {
  const warnings: ThesisPublishWarning[] = [];
  if (!input.advisorName?.trim()) warnings.push({ key: "advisor", label: "No advisor listed" });
  if (!input.abstract?.trim()) warnings.push({ key: "abstract", label: "No abstract" });
  if (!input.keywords.length) warnings.push({ key: "keywords", label: "No keywords" });
  if (!input.references?.trim()) warnings.push({ key: "references", label: "No references" });
  if (!input.coverUrl) warnings.push({ key: "cover", label: "No cover image" });
  if (!input.license?.trim()) warnings.push({ key: "license", label: "No license selected" });
  return warnings;
}

export function firstValidationError(errors: ThesisValidationErrors): string | null {
  const values = Object.values(errors).filter(Boolean);
  return values.length ? (values[0] as string) : null;
}
