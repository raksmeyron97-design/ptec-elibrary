import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { logAdminAction } from "@/app/actions/audit";
import type { AnnouncementStatus } from "./shared";

/**
 * Every meaningful announcement lifecycle action is recorded twice, on
 * purpose:
 *   1. `admin_audit_log` — the repo-wide audit convention (app/actions/audit.ts),
 *      used elsewhere (push.broadcast, post.publish, ...).
 *   2. `activity_events` (resource_type='announcement') — the table the
 *      /admin/logs UI actually renders (lib/admin/activity-log.ts unions this
 *      table; admin_audit_log is written but not surfaced there today). This
 *      is what satisfies "important actions appear in /admin/logs".
 * Both writes are best-effort: a logging failure must never block the
 * underlying announcement action.
 */
export async function logAnnouncementActivity(params: {
  actorId: string | null;
  announcementId: string;
  action: string;
  status?: "success" | "failed";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { actorId, announcementId, action, status = "success", metadata = {} } = params;

  try {
    if (actorId) {
      await logAdminAction(actorId, `announcement.${action}`, "announcements", announcementId, metadata);
    }
  } catch (err) {
    console.error("[announcements/audit] admin_audit_log write failed:", err);
  }

  try {
    const db = createServiceClient();
    await db.from("activity_events").insert({
      event_type: "admin",
      event_status: status,
      resource_type: "announcement",
      resource_id: announcementId,
      user_id: actorId,
      metadata: { action, ...metadata },
    });
  } catch (err) {
    // Degrades silently if 0094 activity_events hasn't been applied yet — the
    // admin_audit_log write above still captured the action.
    console.error("[announcements/audit] activity_events write failed:", err);
  }
}

export async function recordStatusHistory(params: {
  announcementId: string;
  fromStatus: AnnouncementStatus | null;
  toStatus: AnnouncementStatus;
  actorId: string | null;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = createServiceClient();
    await db.from("announcement_status_history").insert({
      announcement_id: params.announcementId,
      from_status: params.fromStatus,
      to_status: params.toStatus,
      actor_id: params.actorId,
      reason: params.reason ?? null,
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    console.error("[announcements/audit] status_history write failed:", err);
  }
}
