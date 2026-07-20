/**
 * Client-safe constants, types, and pure helpers for the Announcement Center.
 * No "server-only" import here — client components ("use client") import from
 * this module directly. Server-only logic (queries, audience resolution,
 * delivery) lives in the sibling files in this directory.
 */

export const ANNOUNCEMENT_TYPES = [
  "general",
  "new_resource",
  "event",
  "maintenance",
  "emergency",
  "policy_update",
  "other",
] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

export const PRIORITIES = ["normal", "important", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = [
  "draft",
  "awaiting_approval",
  "scheduled",
  "publishing",
  "active",
  "partially_delivered",
  "completed",
  "expired",
  "failed",
  "cancelled",
  "archived",
] as const;
export type AnnouncementStatus = (typeof STATUSES)[number];

export const AUDIENCE_TYPES = ["all_active", "role", "push_enabled", "individual"] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

/** Real, DB-backed roles only — never invented (matches lib/types/roles.ts). */
export const TARGETABLE_ROLES = ["reader", "staff", "librarian", "admin", "super_admin"] as const;
export type TargetableRole = (typeof TARGETABLE_ROLES)[number];

export const SORT_OPTIONS = [
  "newest",
  "oldest",
  "scheduled",
  "priority",
  "delivery",
] as const;
export type AnnouncementSort = (typeof SORT_OPTIONS)[number];

export const STATUS_LABELS: Record<AnnouncementStatus, string> = {
  draft: "Draft",
  awaiting_approval: "Awaiting approval",
  scheduled: "Scheduled",
  publishing: "Publishing",
  active: "Active",
  partially_delivered: "Partially delivered",
  completed: "Completed",
  expired: "Expired",
  failed: "Failed",
  cancelled: "Cancelled",
  archived: "Archived",
};

export type StatusTone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

export const STATUS_TONES: Record<AnnouncementStatus, StatusTone> = {
  draft: "neutral",
  awaiting_approval: "warning",
  scheduled: "info",
  publishing: "info",
  active: "success",
  partially_delivered: "warning",
  completed: "success",
  expired: "neutral",
  failed: "danger",
  cancelled: "neutral",
  archived: "neutral",
};

export const PRIORITY_TONES: Record<Priority, StatusTone> = {
  normal: "neutral",
  important: "info",
  urgent: "danger",
};

export const TYPE_LABELS: Record<AnnouncementType, string> = {
  general: "General information",
  new_resource: "New resource",
  event: "Event",
  maintenance: "Maintenance",
  emergency: "Emergency",
  policy_update: "Policy update",
  other: "Other",
};

/** Statuses considered "live history" that a table row can still act on. */
export const EDITABLE_STATUSES: AnnouncementStatus[] = ["draft", "awaiting_approval", "scheduled"];
export const CANCELLABLE_STATUSES: AnnouncementStatus[] = ["scheduled"];
export const ARCHIVABLE_STATUSES: AnnouncementStatus[] = ["completed", "expired", "cancelled", "failed", "active", "partially_delivered"];
export const PAUSABLE_STATUSES: AnnouncementStatus[] = ["active", "partially_delivered"];

export function normalizeType(raw: string | null | undefined): AnnouncementType {
  return (ANNOUNCEMENT_TYPES as readonly string[]).includes(raw ?? "") ? (raw as AnnouncementType) : "general";
}
export function normalizePriority(raw: string | null | undefined): Priority {
  return (PRIORITIES as readonly string[]).includes(raw ?? "") ? (raw as Priority) : "normal";
}
export function normalizeStatus(raw: string | null | undefined): AnnouncementStatus {
  return (STATUSES as readonly string[]).includes(raw ?? "") ? (raw as AnnouncementStatus) : "draft";
}
export function normalizeAudienceType(raw: string | null | undefined): AudienceType {
  return (AUDIENCE_TYPES as readonly string[]).includes(raw ?? "") ? (raw as AudienceType) : "all_active";
}

// ── Character limits (channel-aware) ────────────────────────────────────────
export const LIMITS = {
  internalName: 120,
  title: 120,
  summary: 240,
  body: 8000,
  ctaLabel: 40,
  /** Web Push practical display limits — most platforms truncate well before this. */
  pushTitle: 65,
  pushBody: 180,
};

// ── Row shape shared between the server query and client table/cards ───────
export interface AnnouncementListRow {
  id: string;
  internalName: string;
  titleEn: string;
  titleKm: string | null;
  type: AnnouncementType;
  priority: Priority;
  status: AnnouncementStatus;
  channelInApp: boolean;
  channelBanner: boolean;
  channelPush: boolean;
  audienceType: AudienceType;
  audienceRoles: string[];
  pinned: boolean;
  scheduledAt: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  estimatedRecipients: number | null;
  estimatedDevices: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Cheap rollup from the latest delivery job, null if push was never sent. */
  delivery: {
    sent: number;
    failed: number;
    expired: number;
    total: number;
    jobStatus: "pending" | "running" | "completed" | "failed" | null;
  } | null;
}

export interface AnnouncementFiltersValue {
  q: string;
  status: string;
  channel: string;
  priority: string;
  audience: string;
  creatorId: string;
  langComplete: string; // "all" | "both" | "en_only"
  dateFrom: string;
  dateTo: string;
  sort: AnnouncementSort;
}

export const DEFAULT_FILTERS: AnnouncementFiltersValue = {
  q: "",
  status: "all",
  channel: "all",
  priority: "all",
  audience: "all",
  creatorId: "",
  langComplete: "all",
  dateFrom: "",
  dateTo: "",
  sort: "newest",
};

/** Language-completeness check — pure, reusable by composer + table + tests.
 *  Only the title is required for "complete" — summary/body Khmer are
 *  encouraged but never mandatory (mirrors validateContentStep). */
export function isBilingualComplete(titleKm: string | null | undefined): boolean {
  return !!(titleKm && titleKm.trim());
}

/** Whether a channel selection is valid: at least one channel must be on. */
export function hasAnyChannel(channels: { inApp: boolean; banner: boolean; push: boolean }): boolean {
  return channels.inApp || channels.banner || channels.push;
}

export function truncatePreview(text: string, max: number): { text: string; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed.length <= max) return { text: trimmed, truncated: false };
  return { text: trimmed.slice(0, max - 1).trimEnd() + "…", truncated: true };
}
