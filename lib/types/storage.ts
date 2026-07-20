/** Shared types for the /admin/storage file-manager module. Mirrors the
 *  response shapes of the separate `storage` project's /api/v1 API — see
 *  that repo's API_DOCUMENTATION.md for the authoritative contract. */

export type StorageVisibility = "public" | "private";
export type StorageStatus = "active" | "trashed" | "purged";

export const STORAGE_CATEGORIES = [
  "books",
  "posts",
  "research",
  "reports",
  "team",
  "avatars",
  "publications",
  "announcements",
] as const;
export type StorageCategory = (typeof STORAGE_CATEGORIES)[number];

/** Human-facing labels are resolved via i18n (adminStorage.categories.*); this
 *  just documents the folder ↔ real-world-meaning mapping for code readers. */
export const STORAGE_CATEGORY_LABELS_EN: Record<StorageCategory, string> = {
  books: "Books",
  posts: "Posts & news images",
  research: "Theses",
  reports: "Reports",
  team: "Team photos",
  avatars: "User avatars",
  publications: "Publications",
  announcements: "Announcements",
};

export interface StorageFile {
  id: string | null;
  storageKey: string;
  name: string;
  originalName: string;
  folder: string;
  extension: string;
  mimeType: string | null;
  size: number;
  checksum: string | null;
  visibility: StorageVisibility;
  status: StorageStatus;
  createdAt: string;
  updatedAt: string;
  uploadedBy: string | null;
  deletedAt: string | null;
  metadata: Record<string, unknown>;
  url?: string;
  indexed?: boolean;
}

export interface StorageFolderEntry {
  type: "folder";
  name: string;
  path: string;
}

export type StorageListItem = (StorageFile & { type: "file" }) | StorageFolderEntry;

export interface StoragePagination {
  cursor: number;
  limit: number;
  total: number;
  nextCursor: number | null;
}

export interface StorageCategorySummary {
  folder: string;
  files: number;
  bytes: number;
}

export interface StorageSummary {
  totals: { files: number; bytes: number };
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
  categories: StorageCategorySummary[];
  trashItems: number;
  uploadsThisMonth: number;
  trashRetentionDays: number;
  indexOnly: boolean;
}

export interface StorageUploadResult {
  originalName: string;
  success: boolean;
  file?: StorageFile;
  possibleDuplicate?: string | null;
  error?: { code: string; message: string };
}

export type StorageErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNSUPPORTED_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "FORBIDDEN_PATH"
  | "NOT_IN_TRASH"
  | "STORAGE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "RATE_LIMITED";

export interface StorageActionError {
  code: StorageErrorCode;
  message: string;
}

/** Discriminated result type every server action returns — never throws a
 *  raw upstream error to the client. */
export type StorageActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: StorageActionError };
