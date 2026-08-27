/**
 * Client-safe constants, types, and pure helpers for the admin Manage
 * E-books page. No "server-only" import here (unlike lib/admin/ebooks.ts) —
 * this is the module client components ("use client") import from.
 * lib/admin/ebooks.ts re-exports everything here too.
 */

// `rejected` comes from the editorial review queue (0061 —
// app/actions/review.ts can flip books.status to it); `archived` needs
// migration 0077. Both are kept here so badges/labels never crash on a
// real DB value.
export const EBOOK_STATUSES = ["draft", "pending_review", "published", "rejected", "archived"] as const;
export type EbookStatus = (typeof EBOOK_STATUSES)[number];

export const EBOOK_STATUS_LABELS: Record<EbookStatus, string> = {
  draft: "Draft",
  pending_review: "Needs Review",
  published: "Live",
  rejected: "Rejected",
  archived: "Archived",
};

/**
 * Status → Badge tone. Deliberately a tone name rather than a class triplet:
 * the classes live in components/admin/kit/Badge.tsx so the whole admin panel
 * changes shape or palette in one place, and every tone resolves through the
 * status tokens (no `dark:` variant needed at any call site).
 *
 * `draft` and `archived` are both neutral on purpose — neither is a problem
 * the librarian has to act on, so neither earns colour in a dense table.
 */
export const EBOOK_STATUS_TONES: Record<EbookStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  pending_review: "warning",
  published: "success",
  rejected: "danger",
  archived: "neutral",
};

export function normalizeEbookStatus(raw: string | null | undefined): EbookStatus {
  return (EBOOK_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as EbookStatus) : "draft";
}

export const EBOOK_SORT_OPTIONS = [
  "newest",
  "oldest",
  "updated",
  "most-downloaded",
  "most-viewed",
  "title-asc",
  "title-desc",
  "year-desc",
  "year-asc",
  "size-desc",
  "size-asc",
  "metadata-quality",
] as const;
export type EbookSort = (typeof EBOOK_SORT_OPTIONS)[number];

export const EBOOK_SORT_LABELS: Record<EbookSort, string> = {
  newest: "Recently uploaded",
  oldest: "Oldest first",
  updated: "Recently updated",
  "most-downloaded": "Most downloaded",
  "most-viewed": "Most viewed",
  "title-asc": "Title A–Z",
  "title-desc": "Title Z–A",
  "year-desc": "Year newest",
  "year-asc": "Year oldest",
  "size-desc": "File size largest",
  "size-asc": "File size smallest",
  "metadata-quality": "Metadata completeness",
};

export const EBOOK_FILE_STATUS_OPTIONS = ["has_pdf", "missing_pdf", "broken_file", "large_file"] as const;
export type EbookFileStatusFilter = (typeof EBOOK_FILE_STATUS_OPTIONS)[number];

export const EBOOK_FILE_STATUS_LABELS: Record<EbookFileStatusFilter, string> = {
  has_pdf: "PDF ready",
  missing_pdf: "Missing PDF",
  broken_file: "Broken file",
  large_file: "Large file",
};

export const EBOOK_COVER_STATUS_OPTIONS = ["has_cover", "missing_cover", "broken_cover"] as const;
export type EbookCoverStatusFilter = (typeof EBOOK_COVER_STATUS_OPTIONS)[number];

export const EBOOK_COVER_STATUS_LABELS: Record<EbookCoverStatusFilter, string> = {
  has_cover: "Cover ready",
  missing_cover: "Missing cover",
  broken_cover: "Broken cover",
};

export const EBOOK_QUALITY_OPTIONS = ["complete", "good", "needs_review", "incomplete"] as const;

/**
 * Verification is a second axis, independent of status (migration 0062): a
 * book can be live-but-unverified — everything uploaded with "publish
 * immediately" — or verified while still a draft. Readers see the difference:
 * an unverified record carries the "not yet verified by library staff"
 * warning on its citation box and is excluded from OAI-PMH.
 */
export const EBOOK_VERIFICATION_OPTIONS = ["verified", "unverified"] as const;
export type EbookVerificationFilter = (typeof EBOOK_VERIFICATION_OPTIONS)[number];

export const EBOOK_VERIFICATION_LABELS: Record<EbookVerificationFilter, string> = {
  verified: "Verified",
  unverified: "Not verified",
};

/**
 * A PDF at or above this size gets the amber "Large file" badge — a flag for
 * slow connections and mobile data, not a hard upload limit.
 */
export const LARGE_FILE_KB = 40 * 1024;

export function formatFileSize(kb: number | null): string {
  if (kb == null || kb <= 0) return "—";
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
}

export type EbookListRow = {
  id: string;
  title: string;
  slug: string;
  author: string | null;
  department: string | null;
  departmentId: string | null;
  category: string | null;
  language: string | null;
  year: number | null;
  status: EbookStatus;
  /** Trust stamp (migration 0062). null = no librarian has verified the metadata. */
  verifiedAt: string | null;
  coverUrl: string | null;
  fileUrl: string | null;
  fileFormat: string | null;
  fileSizeKb: number | null;
  viewCount: number;
  downloadCount: number;
  createdAt: string;
  /** null until migration 0077 adds books.updated_at */
  updatedAt: string | null;
  /** From the file_health table (out-of-band checker) — false when unchecked. */
  fileBroken: boolean;
  coverBroken: boolean;
  /** Fields the metadata-quality scorer needs but the table doesn't render directly. */
  description: string | null;
  tags: string[];
  license: string | null;
  isbn: string | null;
  publisher: string | null;
};

export type EbooksSummary = {
  total: number;
  live: number;
  drafts: number;
  pendingReview: number;
  archived: number;
  missingCovers: number;
  missingPdfs: number;
  brokenFiles: number;
  totalViews: number;
  totalDownloads: number;
  storageKb: number;
  missingMetadata: number;
  /** Published but never verified — the citation warning is live on these. */
  unverifiedLive: number;
};

export type EbookOption = { value: string; label: string };

export type EbooksQueryParams = {
  q?: string;
  status?: string;
  dept?: string;
  category?: string;
  year?: string;
  language?: string;
  fileStatus?: string;
  coverStatus?: string;
  quality?: string;
  verification?: string;
  sort?: string;
  page: number;
  pageSize: number;
};
