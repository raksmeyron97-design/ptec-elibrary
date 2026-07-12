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

export const STATUS_META: Record<
  AccountStatus,
  { label: string; dot: string; text: string; bg: string; ring: string }
> = {
  active:   { label: "Active",   dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200" },
  pending:  { label: "Pending",  dot: "bg-amber-500",   text: "text-amber-700",   bg: "bg-amber-50",   ring: "ring-amber-200" },
  disabled: { label: "Disabled", dot: "bg-slate-400",   text: "text-slate-600",   bg: "bg-slate-100",  ring: "ring-slate-200" },
  blocked:  { label: "Blocked",  dot: "bg-rose-500",    text: "text-rose-700",    bg: "bg-rose-50",    ring: "ring-rose-200" },
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

/** "Yesterday", "3 days ago", "2 hours ago", or a date for older timestamps. */
export function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never";
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDate(iso);
}
