// Editorial status vocabulary + transition rules for the metadata
// verification workflow (migration 0086). Pure module — no imports from
// server-only code — so it is unit-testable and usable from client
// components (badges, filters).
//
// Legacy aliases: rows written before 0086 may hold 'pending_review'
// (≈ needs_review) or 'rejected' (≈ changes_requested). Both stay legal in
// the DB CHECK constraint; canonicalize() folds them for display and
// transition checks so old rows flow through the new workflow untouched.

import type { AppRole } from "@/lib/types/roles";

export type ContentStatus =
  | "draft"
  | "imported"
  | "needs_review"
  | "pending_review" // legacy alias of needs_review
  | "in_review"
  | "changes_requested"
  | "rejected" // legacy alias of changes_requested
  | "verified"
  | "scheduled"
  | "published"
  | "archived";

/** Statuses after folding legacy aliases. */
export type CanonicalStatus = Exclude<ContentStatus, "pending_review" | "rejected">;

export function canonicalize(status: string | null | undefined): CanonicalStatus {
  if (status === "pending_review") return "needs_review";
  if (status === "rejected") return "changes_requested";
  const known: CanonicalStatus[] = [
    "draft", "imported", "needs_review", "in_review", "changes_requested",
    "verified", "scheduled", "published", "archived",
  ];
  return known.includes(status as CanonicalStatus) ? (status as CanonicalStatus) : "draft";
}

export const STATUS_META: Record<CanonicalStatus, { label: string; badgeClass: string }> = {
  draft:             { label: "Draft",             badgeClass: "bg-slate-100 text-slate-700" },
  imported:          { label: "Imported",          badgeClass: "bg-sky-100 text-sky-800" },
  needs_review:      { label: "Needs review",      badgeClass: "bg-yellow-100 text-yellow-800" },
  in_review:         { label: "In review",         badgeClass: "bg-blue-100 text-blue-800" },
  changes_requested: { label: "Changes requested", badgeClass: "bg-orange-100 text-orange-800" },
  verified:          { label: "Verified",          badgeClass: "bg-emerald-100 text-emerald-800" },
  scheduled:         { label: "Scheduled",         badgeClass: "bg-indigo-100 text-indigo-800" },
  published:         { label: "Published",         badgeClass: "bg-green-100 text-green-800" },
  archived:          { label: "Archived",          badgeClass: "bg-zinc-200 text-zinc-700" },
};

/**
 * Editorial state machine. Key = from, values = allowed next states.
 * "Approve & publish" is modelled as needs_review/in_review → published
 * (verification happens in the same act — the reviewer has just checked the
 * metadata; verified_at/by are stamped by the server action).
 */
const TRANSITIONS: Record<CanonicalStatus, CanonicalStatus[]> = {
  draft:             ["needs_review", "archived"],
  imported:          ["draft", "needs_review", "archived"],
  needs_review:      ["in_review", "changes_requested", "verified", "published", "draft"],
  in_review:         ["changes_requested", "verified", "published", "needs_review"],
  changes_requested: ["needs_review", "draft", "archived"],
  verified:          ["published", "scheduled", "needs_review"],
  scheduled:         ["published", "verified", "draft"],
  published:         ["archived", "draft"],
  archived:          ["draft", "published"],
};

export function canTransition(from: string, to: string): boolean {
  const f = canonicalize(from);
  const t = canonicalize(to);
  if (f === t) return false;
  return TRANSITIONS[f].includes(t);
}

/** Transitions that publish or verify content — reviewer-only territory. */
const VERIFYING_TARGETS: CanonicalStatus[] = ["verified", "published", "scheduled"];

export function isVerifyingTransition(to: string): boolean {
  return VERIFYING_TARGETS.includes(canonicalize(to));
}

/**
 * Role separation: editors may move their own work through drafting states,
 * but verifying/publishing content they created themselves requires an
 * admin-level override (which the server action audit-logs as such).
 */
export function canActorTransition(opts: {
  role: AppRole;
  from: string;
  to: string;
  isOwnContent: boolean;
}): { allowed: boolean; override?: "self_approval"; reason?: string } {
  const { role, from, to, isOwnContent } = opts;
  if (!canTransition(from, to)) {
    return { allowed: false, reason: `Cannot move from '${canonicalize(from)}' to '${canonicalize(to)}'` };
  }
  if (!isVerifyingTransition(to)) return { allowed: true };

  const isReviewerRole = role === "librarian" || role === "admin" || role === "super_admin";
  if (!isReviewerRole) {
    return { allowed: false, reason: "Only librarians and admins can verify or publish" };
  }
  if (isOwnContent) {
    if (role === "admin" || role === "super_admin") {
      return { allowed: true, override: "self_approval" };
    }
    return {
      allowed: false,
      reason: "You created this record — another reviewer must verify it (or ask an admin)",
    };
  }
  return { allowed: true };
}

/** Statuses that count as publicly visible. Everything else is internal. */
export function isPublicStatus(status: string): boolean {
  return canonicalize(status) === "published";
}

/** Records safe for authoritative exports: published AND verified. */
export function isAuthoritative(status: string, verifiedAt: string | null | undefined): boolean {
  return isPublicStatus(status) && Boolean(verifiedAt);
}
