/**
 * Client-safe constants, types, and pure helpers for the admin Theses CMS.
 * No "server-only" import here (unlike lib/admin/theses.ts) — this is the
 * module client components ("use client") import from. lib/admin/theses.ts
 * re-exports everything here too.
 */

import { unicodeSlug } from "@/lib/slug";

// `rejected` comes from the existing editorial review queue (0061 —
// app/actions/review.ts can flip research_reports.status to it). It's kept
// here so badges/labels never crash on a real DB value, even though it
// isn't one of the primary status filter chips.
export const STATUSES = ["draft", "pending_review", "published", "scheduled", "archived", "rejected"] as const;
export type ThesisStatus = (typeof STATUSES)[number];

export const THESIS_TYPES = ["thesis", "research_report", "capstone", "action_research", "other"] as const;
export type ThesisType = (typeof THESIS_TYPES)[number];

export const THESIS_TYPE_LABELS: Record<ThesisType, string> = {
  thesis: "Thesis",
  research_report: "Research Report",
  capstone: "Capstone Project",
  action_research: "Action Research",
  other: "Other",
};

export const THESIS_LANGUAGES = ["km", "en", "km_en"] as const;
export type ThesisLanguage = (typeof THESIS_LANGUAGES)[number];

export const THESIS_LANGUAGE_LABELS: Record<ThesisLanguage, string> = {
  km: "Khmer",
  en: "English",
  km_en: "Khmer + English",
};

export const SORT_OPTIONS = [
  "newest",
  "oldest",
  "most-viewed",
  "most-downloaded",
  "title-asc",
  "title-desc",
  "updated",
  "metadata-quality",
] as const;
export type ThesisSort = (typeof SORT_OPTIONS)[number];

export const FILE_STATUS_OPTIONS = ["has_pdf", "missing_pdf", "has_cover", "missing_cover"] as const;
export type FileStatusFilter = (typeof FILE_STATUS_OPTIONS)[number];

export const METADATA_QUALITY_OPTIONS = ["complete", "good", "needs_review", "incomplete"] as const;
export type MetadataQualityFilter = (typeof METADATA_QUALITY_OPTIONS)[number];

export const STATUS_LABELS: Record<ThesisStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  published: "Published",
  scheduled: "Scheduled",
  archived: "Archived",
  rejected: "Rejected",
};

export const STATUS_BADGE_STYLES: Record<ThesisStatus, string> = {
  draft: "bg-paper text-text-muted border border-divider",
  pending_review: "bg-orange-50 text-orange-700 border border-orange-200",
  published: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  scheduled: "bg-violet-50 text-violet-700 border border-violet-200",
  archived: "bg-amber-50 text-amber-700 border border-amber-200",
  rejected: "bg-red-50 text-red-700 border border-red-200",
};

export function normalizeStatus(raw: string | null | undefined): ThesisStatus {
  return (STATUSES as readonly string[]).includes(raw ?? "") ? (raw as ThesisStatus) : "draft";
}

export function slugify(input: string): string {
  return unicodeSlug(input);
}

export type ThesisListRow = {
  id: string;
  title: string;
  slug: string | null;
  authorNames: string | null;
  advisorName: string | null;
  program: string | null;
  cohort: string | null;
  academicYear: string | null;
  status: ThesisStatus;
  coverUrl: string | null;
  fileUrl: string | null;
  doi: string | null;
  viewCount: number;
  downloadCount: number;
  /** Admin download override (tri-state); 'inherit' follows the Top-10 policy. */
  downloadOverride: "inherit" | "allow" | "block";
  /** Global Top-N rank among published theses (null when unranked). */
  rank: number | null;
  createdAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
  scheduledAt: string | null;
  /** Fields the metadata-quality scorer needs but the table doesn't render directly. */
  abstract: string | null;
  keywords: string[];
  references: string | null;
  license: string | null;
};

/** Client-safe mirror of the server permission engine's policy resolution —
 *  used only for at-a-glance admin badges (authoritative gate is server-side). */
export type EffectiveDownloadPolicy = {
  policy: "allowed" | "blocked";
  source: "automatic" | "allow" | "block";
  isTopTen: boolean;
};

export function effectiveThesisDownloadPolicy(row: {
  status: ThesisStatus;
  downloadOverride: "inherit" | "allow" | "block";
  rank: number | null;
}): EffectiveDownloadPolicy {
  const isTopTen = row.rank != null && row.rank >= 1 && row.rank <= 10;
  if (row.downloadOverride === "allow") return { policy: "allowed", source: "allow", isTopTen };
  if (row.downloadOverride === "block") return { policy: "blocked", source: "block", isTopTen };
  const published = row.status === "published";
  return { policy: published && !isTopTen ? "allowed" : "blocked", source: "automatic", isTopTen };
}

export type ThesesSummary = {
  total: number;
  published: number;
  drafts: number;
  pendingReview: number;
  scheduled: number;
  archived: number;
  totalViews: number;
  totalDownloads: number;
  missingMetadata: number;
  missingFiles: number;
};

export type ThesisProgramOption = { code: string; label: string };
export type ThesisTextOption = { value: string; label: string };

export type ThesesQueryParams = {
  q?: string;
  status?: string;
  program?: string;
  cohort?: string;
  academicYear?: string;
  fileStatus?: string;
  metadataQuality?: string;
  sort?: string;
  page: number;
  pageSize: number;
};
