/**
 * Metadata completeness scoring for admin E-books — same computed-on-read
 * approach as lib/admin/thesis-metadata-quality.ts (the checklist can change
 * without a backfill; the library is small enough to score on every fetch).
 * Tier names, labels, and badge styles are shared with the thesis scorer so
 * "Complete / Good / Needs Review / Incomplete" means the same thing across
 * the whole admin panel.
 */

import {
  METADATA_TIER_LABELS,
  METADATA_TIER_STYLES,
  type MetadataQualityTier,
} from "@/lib/admin/thesis-metadata-quality";

export { METADATA_TIER_LABELS, METADATA_TIER_STYLES };
export type { MetadataQualityTier };

export type EbookQualityInput = {
  title: string | null;
  author: string | null;
  department: string | null;
  category: string | null;
  year: number | null;
  language: string | null;
  description: string | null;
  tags: string[] | null;
  coverUrl: string | null;
  fileUrl: string | null;
  license: string | null;
  publisher: string | null;
};

type Check = { key: string; label: string; weight: number; ok: boolean };

function hasText(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function buildChecks(b: EbookQualityInput): Check[] {
  return [
    { key: "title", label: "Title", weight: 10, ok: hasText(b.title) },
    { key: "author", label: "Author", weight: 10, ok: hasText(b.author) },
    { key: "department", label: "Department", weight: 8, ok: hasText(b.department) },
    { key: "category", label: "Category", weight: 8, ok: hasText(b.category) },
    { key: "year", label: "Year", weight: 7, ok: b.year != null && b.year > 0 },
    { key: "language", label: "Language", weight: 7, ok: hasText(b.language) },
    { key: "description", label: "Description", weight: 14, ok: hasText(b.description) },
    { key: "tags", label: "Keywords/tags", weight: 8, ok: Boolean(b.tags && b.tags.length > 0) },
    { key: "cover", label: "Cover image", weight: 9, ok: hasText(b.coverUrl) },
    { key: "pdf", label: "PDF file", weight: 12, ok: hasText(b.fileUrl) },
    // Both default-prone fields: license defaults to 'unknown' (0062).
    { key: "license", label: "License", weight: 4, ok: hasText(b.license) && b.license !== "unknown" },
    { key: "publisher", label: "Publisher", weight: 3, ok: hasText(b.publisher) },
  ];
}

const EMPTY_EBOOK: EbookQualityInput = {
  title: null, author: null, department: null, category: null, year: null,
  language: null, description: null, tags: null, coverUrl: null, fileUrl: null,
  license: null, publisher: null,
};

/** Field key → its share of the total score, in percentage points (sums to
 *  100). Same derivation and same reason as `thesisFieldWeights()`. */
export function ebookFieldWeights(): Record<string, number> {
  const checks = buildChecks(EMPTY_EBOOK);
  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  return Object.fromEntries(checks.map((check) => [check.key, (check.weight / total) * 100]));
}

/** Field key → its human label, from the same checklist. */
export function ebookFieldLabels(): Record<string, string> {
  return Object.fromEntries(buildChecks(EMPTY_EBOOK).map((check) => [check.key, check.label]));
}

export function scoreEbookQuality(b: EbookQualityInput): {
  score: number;
  tier: MetadataQualityTier;
  missing: { key: string; label: string }[];
} {
  const checks = buildChecks(b);
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
