/**
 * Metadata completeness scoring for admin Theses (spec section 5).
 * Computed on read, not stored — the checklist can change over time without
 * a backfill, and this library is small enough that scoring on every fetch
 * is cheap (see lib/admin/theses.ts for where this runs across a page).
 */

export type MetadataQualityTier = "complete" | "good" | "needs_review" | "incomplete";

export type MetadataQualityInput = {
  title: string | null;
  slug: string | null;
  authorNames: string | null;
  advisorName: string | null;
  program: string | null;
  cohort: string | null;
  academicYear: string | null;
  publishedAt: string | null;
  abstract: string | null;
  keywords: string[] | null;
  references: string | null;
  coverUrl: string | null;
  fileUrl: string | null;
  license: string | null;
};

type Check = { key: string; label: string; weight: number; ok: boolean };

function hasText(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function buildChecks(t: MetadataQualityInput): Check[] {
  return [
    { key: "title", label: "Title", weight: 10, ok: hasText(t.title) },
    { key: "slug", label: "Slug", weight: 5, ok: hasText(t.slug) },
    { key: "authors", label: "Author(s)", weight: 10, ok: hasText(t.authorNames) },
    { key: "advisor", label: "Advisor", weight: 10, ok: hasText(t.advisorName) },
    { key: "program", label: "Program", weight: 8, ok: hasText(t.program) },
    { key: "cohort", label: "Cohort", weight: 7, ok: hasText(t.cohort) },
    { key: "academicYear", label: "Academic year", weight: 7, ok: hasText(t.academicYear) },
    { key: "publicationDate", label: "Publication date", weight: 8, ok: hasText(t.publishedAt) },
    { key: "abstract", label: "Abstract", weight: 15, ok: hasText(t.abstract) },
    { key: "keywords", label: "Keywords", weight: 10, ok: Boolean(t.keywords && t.keywords.length > 0) },
    { key: "references", label: "References", weight: 8, ok: hasText(t.references) },
    { key: "cover", label: "Cover image", weight: 6, ok: hasText(t.coverUrl) },
    { key: "pdf", label: "PDF file", weight: 10, ok: hasText(t.fileUrl) },
    { key: "license", label: "License", weight: 6, ok: hasText(t.license) },
  ];
}

export function scoreMetadataQuality(t: MetadataQualityInput): {
  score: number;
  tier: MetadataQualityTier;
  missing: { key: string; label: string }[];
} {
  const checks = buildChecks(t);
  const total = checks.reduce((sum, c) => sum + c.weight, 0);
  const achieved = checks.reduce((sum, c) => sum + (c.ok ? c.weight : 0), 0);
  const score = Math.round((achieved / total) * 100);

  let tier: MetadataQualityTier;
  if (score >= 90) tier = "complete";
  else if (score >= 70) tier = "good";
  else if (score >= 40) tier = "needs_review";
  else tier = "incomplete";

  const missing = checks.filter((c) => !c.ok).map((c) => ({ key: c.key, label: c.label }));

  return { score, tier, missing };
}

export const METADATA_TIER_LABELS: Record<MetadataQualityTier, string> = {
  complete: "Complete",
  good: "Good",
  needs_review: "Needs Review",
  incomplete: "Incomplete",
};

export const METADATA_TIER_STYLES: Record<MetadataQualityTier, string> = {
  complete: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  good: "bg-blue-50 text-blue-700 border border-blue-200",
  needs_review: "bg-orange-50 text-orange-700 border border-orange-200",
  incomplete: "bg-red-50 text-red-700 border border-red-200",
};
