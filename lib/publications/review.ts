// Pure publish-readiness review for publications. Runs identically in the
// admin browser (live step states, Review & publish panel) and on the server
// (the publish gate re-reads canonical data and refuses on blocking errors).

import {
  countCitationsByReference,
  isValidDoi,
  normalizeDoi,
  validatePublicationCitations,
  type CitationSource,
} from "@/lib/publications/citations";
import {
  detectKhmerFieldLanguageMismatch,
  findLikelyReferenceDuplicates,
} from "@/lib/publications/reference-metadata";
import type { PublicationReference } from "@/lib/publications";

export type ReviewSeverity = "error" | "warning" | "recommendation";

export type ReviewStep = "basic" | "authors" | "content" | "details" | "files";

export interface PublicationReviewItem {
  severity: ReviewSeverity;
  code: string;
  message: string;
  /** Which workspace step resolves this item. */
  step: ReviewStep;
  /** Optional DOM id suffix the workspace can focus/scroll to. */
  field?: string;
}

export interface PublicationReviewInput {
  title?: string | null;
  title_km?: string | null;
  slug?: string | null;
  journal_name?: string | null;
  volume?: string | null;
  issue_no?: string | null;
  page_start?: string | null;
  page_end?: string | null;
  article_no?: string | null;
  doi?: string | null;
  publication_date?: string | null;
  abstract?: string | null;
  abstract_km?: string | null;
  keywords?: readonly string[] | null;
  subjects?: readonly string[] | null;
  license?: string | null;
  cover_url?: string | null;
  /** True when an article PDF exists or is queued for upload. */
  hasPdf: boolean;
  authorshipCount: number;
  references: unknown;
}

export interface PublicationReviewResult {
  items: PublicationReviewItem[];
  errors: PublicationReviewItem[];
  warnings: PublicationReviewItem[];
  recommendations: PublicationReviewItem[];
  /** Normalized references from citation validation (safe to persist). */
  references: PublicationReference[];
  /** True when nothing blocks publishing. */
  publishable: boolean;
}

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: string): number | null {
  return /^\d{1,6}$/.test(value) ? Number(value) : null;
}

export function buildPublicationReview(
  input: PublicationReviewInput,
): PublicationReviewResult {
  const items: PublicationReviewItem[] = [];
  const push = (
    severity: ReviewSeverity,
    code: string,
    message: string,
    step: ReviewStep,
    field?: string,
  ) => items.push({ severity, code, message, step, ...(field ? { field } : {}) });

  // ── Identity ────────────────────────────────────────────────────────────
  if (!text(input.title)) {
    push("error", "missing_title", "The English title is required.", "basic", "title");
  }
  if (!text(input.slug)) {
    push("error", "missing_slug", "A URL slug is required.", "basic", "slug");
  }

  const doi = text(input.doi);
  if (doi) {
    const normalized = normalizeDoi(doi);
    if (!normalized || !isValidDoi(normalized)) {
      push("error", "invalid_publication_doi", "The article DOI is not a valid DOI.", "basic", "doi");
    }
  }

  const publicationDate = text(input.publication_date);
  if (publicationDate) {
    const year = new Date(publicationDate).getFullYear();
    const currentYear = new Date().getFullYear();
    if (Number.isNaN(year) || year < 1900 || year > currentYear + 1) {
      push(
        "error",
        "invalid_publication_date",
        `The publication date must fall between 1900 and ${currentYear + 1}.`,
        "basic",
        "publication_date",
      );
    }
  } else {
    push(
      "warning",
      "missing_publication_date",
      "No publication date is set; the article will sort as undated.",
      "basic",
      "publication_date",
    );
  }

  const titleKmMismatch = detectKhmerFieldLanguageMismatch(input.title_km);
  if (titleKmMismatch) {
    push(
      "warning",
      "title_km_language",
      "The Khmer title appears to contain mostly English text.",
      "basic",
      "title_km",
    );
  }

  // ── Journal consistency ─────────────────────────────────────────────────
  const journal = text(input.journal_name);
  const volume = text(input.volume);
  const issue = text(input.issue_no);
  const pageStart = text(input.page_start);
  const pageEnd = text(input.page_end);
  if (!journal && (volume || issue || pageStart || pageEnd || text(input.article_no))) {
    push(
      "warning",
      "issue_without_journal",
      "Volume, issue, or page details are set without a journal name.",
      "basic",
      "journal_name",
    );
  }
  if (pageEnd && !pageStart) {
    push("warning", "page_end_only", "A last page is set without a first page.", "basic", "page_start");
  }
  const start = numeric(pageStart);
  const end = numeric(pageEnd);
  if (start !== null && end !== null && start > end) {
    push(
      "warning",
      "page_range_reversed",
      `The page range ${start}–${end} runs backwards.`,
      "basic",
      "page_start",
    );
  }

  // ── Authors ─────────────────────────────────────────────────────────────
  if (input.authorshipCount === 0) {
    push("warning", "no_authors", "No authors are linked to this article.", "authors");
  }

  // ── Content: abstracts and citations ────────────────────────────────────
  const abstractEn = text(input.abstract);
  const abstractKm = text(input.abstract_km);
  if (!abstractEn) {
    push(
      "warning",
      "missing_abstract",
      "There is no English abstract; readers and search will only see the title.",
      "content",
      "abstract-en",
    );
  }
  const abstractKmMismatch = detectKhmerFieldLanguageMismatch(input.abstract_km);
  if (abstractKmMismatch) {
    push(
      "warning",
      "abstract_km_language",
      "The Khmer abstract appears to contain mostly English text.",
      "content",
      "abstract-km",
    );
  }
  if (!abstractKm) {
    push(
      "recommendation",
      "no_khmer_abstract",
      "A Khmer abstract makes the article accessible to Khmer readers.",
      "content",
      "abstract-km",
    );
  }

  const sources: CitationSource[] = [
    { id: "abstract-en", text: input.abstract ?? "" },
    { id: "abstract-km", text: input.abstract_km ?? "" },
  ];
  const citationValidation = validatePublicationCitations(input.references ?? [], sources);
  for (const issue of citationValidation.errors) {
    push("error", issue.code, issue.message, "content", issue.field === "citation" ? "citations" : "references");
  }
  const references = citationValidation.references;

  const counts = countCitationsByReference(sources, references);
  const uncited = references.filter((reference) => !counts[reference.id]);
  if (uncited.length > 0) {
    push(
      "warning",
      "uncited_references",
      uncited.length === 1
        ? `Reference ${references.findIndex((r) => r.id === uncited[0].id) + 1} is never cited in an abstract.`
        : `${uncited.length} references are never cited in an abstract.`,
      "content",
      "references",
    );
  }

  for (let index = 1; index < references.length; index += 1) {
    const current = references[index];
    const matches = findLikelyReferenceDuplicates(
      {
        ...(current.meta ?? { type: "other" as const }),
        ...(current.doi ? { doi: current.doi } : {}),
        ...(current.url ? { url: current.url } : {}),
        originalText: current.text,
      },
      references.slice(0, index),
    );
    const strong = matches.find((match) => match.confidence >= 0.9);
    if (strong) {
      push(
        "warning",
        "likely_duplicate_reference",
        `Reference ${index + 1} looks like a duplicate of reference ${strong.existingIndex + 1}.`,
        "content",
        "references",
      );
    }
  }

  if ((input.keywords?.length ?? 0) === 0) {
    push(
      "warning",
      "missing_keywords",
      "No keywords are set; discovery and related-content matching suffer.",
      "content",
      "keywords",
    );
  }

  // ── Files ────────────────────────────────────────────────────────────────
  if (!input.hasPdf) {
    push("error", "missing_pdf", "The article PDF is required before publishing.", "files", "pdf");
  }
  if (!text(input.cover_url)) {
    push(
      "recommendation",
      "no_cover",
      "A cover or graphical abstract improves listings and social sharing.",
      "files",
      "cover",
    );
  }

  // ── Details ──────────────────────────────────────────────────────────────
  if (!text(input.license)) {
    push(
      "recommendation",
      "no_license",
      "Without a license the article cannot be harvested via OAI-PMH.",
      "basic",
      "license",
    );
  }
  if ((input.subjects?.length ?? 0) === 0) {
    push(
      "recommendation",
      "no_subjects",
      "Subject areas help readers browse related material.",
      "details",
      "subjects",
    );
  }

  const errors = items.filter((item) => item.severity === "error");
  const warnings = items.filter((item) => item.severity === "warning");
  const recommendations = items.filter((item) => item.severity === "recommendation");

  return {
    items,
    errors,
    warnings,
    recommendations,
    references,
    publishable: errors.length === 0,
  };
}
