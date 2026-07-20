/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";

/**
 * Best-effort bridge into the legacy `notifications` table so the existing
 * NotificationBell / unread badge keep working unchanged when an
 * announcement's in-app channel is published.
 *
 * LIMITATION (documented in the final handoff): `notifications.target_role`
 * only distinguishes "everyone" vs "admin" — it cannot represent role-subset,
 * push-enabled, or individual audiences. Rather than either over-exposing a
 * restricted announcement to every reader or under-serving it, this bridge
 * intentionally SKIPS creating a bell notification for any audience shape it
 * cannot safely represent; those announcements are still fully served by the
 * website banner and the announcement detail page.
 */
export async function bridgeToNotifications(db: any, announcement: any): Promise<void> {
  if (!announcement.channel_in_app) return;

  let targetRole: "admin" | null;
  if (announcement.audience_type === "all_active") {
    targetRole = null;
  } else if (
    announcement.audience_type === "role" &&
    Array.isArray(announcement.audience_roles) &&
    announcement.audience_roles.length > 0 &&
    announcement.audience_roles.every((r: string) => (ADMIN_PANEL_ROLES as string[]).includes(r))
  ) {
    targetRole = "admin";
  } else {
    return;
  }

  const { data: existing } = await db
    .from("notifications")
    .select("id")
    .eq("source_announcement_id", announcement.id)
    .maybeSingle();
  if (existing) return;

  await db.from("notifications").insert({
    type: "announcement",
    title_en: announcement.title_en,
    title_km: announcement.title_km,
    body_en: announcement.summary_en ?? announcement.body_en,
    body_km: announcement.summary_km ?? announcement.body_km,
    link: announcement.cta_url,
    target_role: targetRole,
    source_announcement_id: announcement.id,
  });
}

export async function unbridgeNotification(db: any, announcementId: string): Promise<void> {
  await db.from("notifications").delete().eq("source_announcement_id", announcementId);
}
