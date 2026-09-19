/**
 * Client-safe types, metadata, and formatters for the admin Users page.
 * NO "server-only" import — imported by client components (badges, table,
 * drawer). Server-only fetching lives in lib/admin/users.ts.
 *
 * The library is free and borrowing is unlimited, so there is no membership /
 * subscription / borrowing concept here — the page is about identity, role,
 * account status, and activity only.
 */

import type { AppRole } from "@/lib/types/roles";

// ── Account status ───────────────────────────────────────────────────────────
export type AccountStatus = "active" | "pending" | "disabled" | "blocked";

/**
 * Status appearance, on the `--ptec-{status}-{soft,line,text}` tokens rather
 * than a raw palette triplet. Each token already resolves per theme, so no call
 * site needs a `dark:` variant — the panel forces light today and the literals
 * these replace were a trap for whoever changes that. `label` stays English on
 * purpose: it is for non-UI consumers (the CSV export, keyword search), and the
 * badge translates through `adminUsers.status.*`.
 */
export const STATUS_META: Record<
  AccountStatus,
  { label: string; dot: string; text: string; bg: string; ring: string }
> = {
  active:   { label: "Active",   dot: "bg-success", text: "text-success-text", bg: "bg-success-soft", ring: "ring-success-line" },
  pending:  { label: "Pending",  dot: "bg-warning", text: "text-warning-text", bg: "bg-warning-soft", ring: "ring-warning-line" },
  disabled: { label: "Disabled", dot: "bg-text-muted", text: "text-text-muted", bg: "bg-paper",       ring: "ring-divider" },
  blocked:  { label: "Blocked",  dot: "bg-danger",  text: "text-danger-text",  bg: "bg-danger-soft",  ring: "ring-danger-line" },
};

// ── Row shape ────────────────────────────────────────────────────────────────
export type UserRow = {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: AppRole;
  isSuperAdmin: boolean;
  status: AccountStatus;
  createdAt: string;
  lastLoginAt: string | null;
  emailConfirmed: boolean;
};

export type UsersSummary = {
  total: number;
  byRole: Record<AppRole, number>;
  newThisMonth: number;
  newLastMonth: number;
};

// ── Role filter groups ───────────────────────────────────────────────────────

/**
 * A filter value that selects several roles at once.
 *
 * It exists because the "Admins" KPI counts `admin + super_admin` and linked to
 * `?role=admin`, so the tile and the list it opened disagreed about how many
 * administrators the library has — a card that lies the moment you click it.
 * One group, not a general grouping system: this is the only tier the panel
 * talks about as a tier.
 */
export const ROLE_GROUPS: Readonly<Record<string, readonly AppRole[]>> = {
  admins: ["admin", "super_admin"],
};

export function rolesForFilter(value: string | undefined): readonly AppRole[] | null {
  if (!value) return null;
  return ROLE_GROUPS[value] ?? null;
}

// ── Sort + filter option metadata ────────────────────────────────────────────
export const USER_SORT_OPTIONS = [
  "newest",
  "oldest",
  "name_asc",
  "name_desc",
  "recent_login",
] as const;
export type UserSort = (typeof USER_SORT_OPTIONS)[number];

export const USER_SORT_LABELS: Record<UserSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  name_asc: "Name A→Z",
  name_desc: "Name Z→A",
  recent_login: "Recently active",
};

export const JOINED_RANGE_OPTIONS = ["all", "7d", "30d", "90d", "year"] as const;
export type JoinedRange = (typeof JOINED_RANGE_OPTIONS)[number];
export const JOINED_RANGE_LABELS: Record<JoinedRange, string> = {
  all: "Any time",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  year: "Last 12 months",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Human label for a user — name, else email, else a safe fallback (email may be blank). */
export function userLabel(user: { fullName: string | null; email: string }): string {
  return user.fullName?.trim() || user.email?.trim() || "this user";
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // Pin to UTC so server (UTC) and client (local tz) render the SAME day —
  // otherwise dates near midnight cause a React hydration mismatch.
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Translator shape for the optional localized variant (adminUsers.time.*). */
type RelativeT = (key: string, values?: Record<string, string | number>) => string;

/** "Yesterday", "3 days ago", "2 hours ago", or a date for older timestamps.
 *  Pass a translator scoped to `adminUsers.time` for localized output; without
 *  one (e.g. CSV export) the English strings are kept. */
export function formatRelative(iso: string | null, t?: RelativeT): string {
  if (!iso) return t ? t("never") : "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return t ? t("never") : "Never";
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return t ? t("justNow") : "Just now";
  if (mins < 60) return t ? t("minAgo", { count: mins }) : `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return t ? t("hoursAgo", { count: hrs }) : `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return t ? t("yesterday") : "Yesterday";
  if (days < 30) return t ? t("daysAgo", { count: days }) : `${days} days ago`;
  return formatDate(iso);
}
