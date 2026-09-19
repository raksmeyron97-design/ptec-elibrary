/**
 * Client-safe types and pure helpers for the admin user profile page
 * (`/admin/users/[id]`). NO `server-only` import — the profile panels are
 * client components. Fetching lives in `lib/admin/user-profile.ts`.
 *
 * Why this file exists. The Users directory answers "who is in the library?";
 * it could not answer "who is THIS person?". Everything a reader fills in on
 * their Download Access Profile — institution, faculty, student or staff id,
 * country, why they download — is what gates thesis access, and the librarian
 * approving that access had no way to read it. The same is true of what the
 * reader has actually done here: lists, bookmarks, notes, progress, requests.
 *
 * **The completeness verdict is NOT computed here.** It comes from
 * `computeDownloadProfileStatus` in `lib/profile/download-profile-shared.ts`,
 * which is the same pure function the permission engine, the download route,
 * the status endpoint and the reader's own Settings page use. A second
 * calculator with its own field list would let the admin panel report a reader
 * as ready while the download route refused them — two sources of truth about
 * one decision, which is the defect this repo keeps removing (see the
 * `getCollectionStats` and `lib/ptec.ts` notes in CLAUDE.md). The FIELD ORDER
 * below is presentation and nothing else.
 *
 * Two further rules are encoded here because the page is not the only thing
 * that will ever ask:
 *
 *  1. A MISSING field and an EMPTY one are the same answer to a librarian
 *     ("not provided"), but neither is the same as "we could not read it" —
 *     `ProfileSectionState` keeps `unavailable` distinct from empty. An
 *     institution that failed to load must never render as an institution the
 *     reader declined to give.
 *  2. An enum value stored in the database is a KEY, never a label. The reader
 *     picked it in their locale and an administrator reads it in theirs — and
 *     the keys are the reader's own (`downloadProfile.fields.*`), so the two
 *     screens cannot describe one column with two different words.
 */

import type { AppRole } from "@/lib/types/roles";
import type { AccountStatus } from "@/lib/admin/users-shared";
import type { DownloadProfileRow } from "@/lib/profile/download-profile-shared";

// ── Section loading state ────────────────────────────────────────────────────

/**
 * Every section of the profile resolves to one of three things, and the third
 * is the one that matters: a failed read is not an empty reader.
 */
export type ProfileSectionState = "ready" | "empty" | "unavailable";

// ── The Download Access Profile ──────────────────────────────────────────────

/**
 * The reader-supplied institutional record, exactly as the reader's own form
 * stores it. Deliberately the SAME row shape rather than a camel-cased copy:
 * it is what `computeDownloadProfileStatus` takes, and the snake_case keys are
 * also the message keys under `downloadProfile.fields.*`.
 */
export type AccessProfile = DownloadProfileRow;

/**
 * Presentation order, and which enum catalogue resolves each value.
 *
 * `enumNs` names the `downloadProfile` sub-namespace holding that field's
 * labels; a field without one is free text. `sensitive` marks a value that
 * identifies a person beyond their role in the institution — those are grouped
 * apart on the page so they are never scanned past by accident.
 *
 * This list does NOT decide completeness (see the module note) — it decides
 * what the page draws and in what order.
 */
export const ACCESS_PROFILE_FIELDS = [
  { key: "institution_name", enumNs: null, sensitive: false },
  { key: "institution_type", enumNs: "institutionType", sensitive: false },
  { key: "faculty_department", enumNs: null, sensitive: false },
  { key: "professional_role", enumNs: "role", sensitive: false },
  { key: "country", enumNs: null, sensitive: false },
  { key: "province_city", enumNs: null, sensitive: false },
  { key: "download_purpose", enumNs: "purpose", sensitive: false },
  { key: "student_staff_id", enumNs: null, sensitive: true },
  { key: "phone", enumNs: null, sensitive: true },
  { key: "gender", enumNs: "gender", sensitive: true },
] as const satisfies readonly {
  key: keyof DownloadProfileRow;
  enumNs: string | null;
  sensitive: boolean;
}[];

export type AccessProfileField = (typeof ACCESS_PROFILE_FIELDS)[number];

/** A value counts as provided only when it is a non-blank string. */
export function hasValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

// ── Library activity ─────────────────────────────────────────────────────────

/**
 * What the reader has DONE here. Counts only — the page links out to resources
 * rather than reproducing a reader's private notes and highlights, which an
 * administrator has no operational reason to read. `notes` and `annotations`
 * are therefore counts and nothing else, deliberately.
 */
export type LibraryActivityCounts = {
  downloads: number;
  reviews: number;
  lists: number;
  savedItems: number;
  bookmarks: number;
  notes: number;
  annotations: number;
  booksStarted: number;
  booksFinished: number;
  requests: number;
};

export const ACTIVITY_METRIC_KEYS = [
  "downloads",
  "reviews",
  "booksStarted",
  "booksFinished",
  "lists",
  "savedItems",
  "bookmarks",
  "notes",
  "annotations",
  "requests",
] as const satisfies readonly (keyof LibraryActivityCounts)[];

/** One item the reader is partway through. */
export type ReadingProgressItem = {
  bookId: string;
  title: string;
  slug: string | null;
  percent: number;
  updatedAt: string | null;
};

/** One request the reader has made for the library to acquire something. */
export type BookRequestItem = {
  id: string;
  title: string;
  status: string;
  createdAt: string | null;
};

/**
 * One thing that happened, in a form the RENDERER can translate.
 *
 * The old drawer received `"Downloaded Action Research"` — an English sentence
 * composed on the server, for an admin panel whose locale is a cookie. The verb
 * and the subject travel separately now, so the Khmer reading is a translation
 * rather than a half-English string.
 */
export type ProfileActivityItem = {
  kind: "download" | "review";
  at: string;
  /** Resource title, or null when the row pointed at something since deleted. */
  subject: string | null;
  /** Href for the subject when one resolves; plain text otherwise. */
  href: string | null;
  /** Stars, for a review. */
  rating?: number | null;
};

// ── One admin action taken against this account ──────────────────────────────

export type AdminTrailItem = {
  id: string;
  action: string;
  at: string | null;
  actorName: string | null;
  actorId: string | null;
};

// ── The whole profile ────────────────────────────────────────────────────────

export type UserProfileIdentity = {
  id: string;
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  role: AppRole;
  isSuperAdmin: boolean;
  status: AccountStatus;
  createdAt: string;
  lastLoginAt: string | null;
  emailConfirmed: boolean;
};

export type UserProfile = {
  identity: UserProfileIdentity;
  accessProfile: AccessProfile | null;
  accessProfileState: ProfileSectionState;
  counts: LibraryActivityCounts;
  countsState: ProfileSectionState;
  inProgress: ReadingProgressItem[];
  requests: BookRequestItem[];
  recentActivity: ProfileActivityItem[];
  activityState: ProfileSectionState;
  adminTrail: AdminTrailItem[];
  adminTrailState: ProfileSectionState;
  /** Web-push registrations: how many devices this reader can be notified on. */
  pushDevices: number | null;
};

// ── Tabs ─────────────────────────────────────────────────────────────────────

export const PROFILE_TABS = ["overview", "access", "activity", "trail"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export function isProfileTab(value: string | undefined): value is ProfileTab {
  return !!value && (PROFILE_TABS as readonly string[]).includes(value);
}

// ── Formatting ───────────────────────────────────────────────────────────────

/**
 * Reading progress as a whole percent, clamped. `progress_pct` is an integer
 * column (see 0141) and a stored value outside 0–100 is a data fault, not a
 * reason to draw a bar past its track.
 */
export function clampPercent(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
