// Publish-readiness gates shared by EVERY code path that can set a record
// live (the per-entity server actions and the review queue's
// transitionContent). Pure functions: callers fetch the canonical server
// row and pass it in — client payloads are never trusted for publishing.
//
// These are the HARD errors only (a record that would be broken or
// undiscoverable when public). Advisory quality warnings live with each
// entity's admin UI (e.g. lib/publications/review.ts warnings).

import { validateThesisPublish, firstValidationError } from "@/lib/admin/thesis-validation";
import { isGenericThesisTitle } from "@/lib/seo/thesis-seo";

/** Blocks a thesis transition to published/scheduled when required fields
 *  (spec §26) are missing. Returns the first human-readable blocker. */
export function checkThesisPublishReady(merged: Record<string, unknown>): string | null {
  if (merged.status !== "published" && merged.status !== "scheduled") return null;
  // A generic title ("Report" / "របាយការណ៍" / "Thesis") is too weak for academic
  // discovery. Block publication unless an authorized admin has recorded that
  // the official title was verified against the source document.
  if (
    isGenericThesisTitle(merged.title as string) &&
    !(merged as { official_title_verified?: boolean }).official_title_verified
  ) {
    return 'This title is too generic for an academic record (e.g. "Report", "Thesis", "របាយការណ៍"). Enter the thesis’s official title, or mark the official title as verified to publish an exception.';
  }
  const errors = validateThesisPublish({
    title: (merged.title as string) ?? "",
    slug: (merged.slug as string) ?? "",
    program: (merged.program as string) ?? null,
    cohort: (merged.cohort as string) ?? null,
    academicYear: (merged.academic_year as string) ?? null,
    authorNames: (merged.author_names as string) ?? null,
    advisorName: (merged.advisor_name as string) ?? null,
    fileUrl: (merged.file_url as string) ?? null,
    coverUrl: (merged.cover_url as string) ?? null,
    abstract: (merged.abstract as string) ?? null,
    keywords: (merged.keywords as string[]) ?? [],
    references: (merged.references as string) ?? null,
    license: (merged.license as string) ?? null,
  });
  return firstValidationError(errors);
}

/** Hard blockers for publishing a digital book: it must have a title, a
 *  public slug, and a readable file (book_files is the source of truth —
 *  the same rule the bulk e-book publisher enforces). */
export function checkBookPublishReady(input: {
  title: string | null | undefined;
  slug: string | null | undefined;
  hasFile: boolean;
}): string | null {
  if (!input.title?.trim()) return "A title is required before publishing.";
  if (!input.slug?.trim()) return "A public URL slug is required before publishing.";
  if (!input.hasFile) {
    return "Attach the book PDF before publishing — a published e-book must have a readable file.";
  }
  return null;
}
