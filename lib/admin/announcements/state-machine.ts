/**
 * Server-authoritative status transitions for announcements. The client never
 * sets `status` directly — every mutation goes through a named action
 * (publish/schedule/cancel/...) which calls `assertTransition` before writing.
 * Pure — safe to unit test without a database.
 */

import type { AnnouncementStatus } from "./shared";

const TRANSITIONS: Record<AnnouncementStatus, AnnouncementStatus[]> = {
  draft: ["awaiting_approval", "scheduled", "publishing", "archived"],
  awaiting_approval: ["draft", "scheduled", "publishing", "archived"],
  scheduled: ["draft", "cancelled", "publishing"],
  publishing: ["active", "completed", "partially_delivered", "failed"],
  active: ["expired", "archived", "draft" /* unpublish/pause */, "partially_delivered", "completed"],
  partially_delivered: ["completed", "expired", "archived", "draft"],
  completed: ["expired", "archived"],
  expired: ["archived"],
  failed: ["publishing" /* retry */, "cancelled", "archived"],
  cancelled: ["archived", "draft"],
  archived: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: AnnouncementStatus, to: AnnouncementStatus) {
    super(`Cannot move an announcement from "${from}" to "${to}".`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: AnnouncementStatus, to: AnnouncementStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: AnnouncementStatus, to: AnnouncementStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export interface DeliveryTotals {
  sent: number;
  failed: number; // includes terminal "dead" rows
  expired: number;
  total: number;
}

/**
 * Overall announcement status after a push delivery pass. Pure so it is unit
 * testable without touching the database.
 *
 * Rule: in-app/banner channels make the announcement "live" independent of
 * push outcome — a push-only announcement is the only case where the overall
 * status can become "completed" (fully delivered, nothing left to show) or
 * "failed" (nothing could be sent at all). Any push channel with a mix of
 * sent + failed/expired always surfaces as "partially_delivered" so the
 * dashboard flags imperfect delivery, even when other channels keep the
 * announcement visibly active.
 */
export function computeOverallStatus(
  hasNonPushLiveChannel: boolean,
  hasPushChannel: boolean,
  totals: DeliveryTotals,
): AnnouncementStatus {
  if (!hasPushChannel) return "active";

  const settled = totals.sent + totals.failed + totals.expired;
  const stillPending = settled < totals.total;
  if (stillPending) return hasNonPushLiveChannel ? "active" : "publishing";

  if (totals.total === 0) return hasNonPushLiveChannel ? "active" : "completed";
  if (totals.sent === 0) return hasNonPushLiveChannel ? "active" : "failed";
  if (totals.failed > 0 || totals.expired > 0) return "partially_delivered";
  return hasNonPushLiveChannel ? "active" : "completed";
}

/** Row actions valid for a given status — drives which buttons a table row
 *  shows. Permission checks happen separately; this is purely status logic. */
export function availableActions(status: AnnouncementStatus): string[] {
  switch (status) {
    case "draft":
      return ["view", "edit", "duplicate", "publish", "schedule", "requestApproval", "archive", "delete"];
    case "awaiting_approval":
      return ["view", "edit", "approve", "reject", "duplicate"];
    case "scheduled":
      return ["view", "edit", "cancelSchedule", "duplicate"];
    case "publishing":
      return ["view"];
    case "active":
      return ["view", "duplicate", "pause", "archive", "resendFailed"];
    case "partially_delivered":
      return ["view", "duplicate", "resendFailed", "pause", "archive"];
    case "completed":
      return ["view", "duplicate", "archive"];
    case "expired":
      return ["view", "duplicate", "archive"];
    case "failed":
      return ["view", "duplicate", "resendFailed", "archive"];
    case "cancelled":
      return ["view", "duplicate", "archive"];
    case "archived":
      return ["view", "duplicate"];
    default:
      return ["view"];
  }
}
