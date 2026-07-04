// lib/admin-notifications.ts
// Internal, server-only helper for emitting admin-targeted notifications.
//
// This intentionally lives OUTSIDE a "use server" action file so it is NOT
// exposed as a callable server action. It is only invoked server-to-server
// (from already-authorized actions / route handlers), so exposing it as an
// action would let anyone spoof admin notifications (including phishing links).
import { createServiceClient } from "@/lib/supabase/server";

export async function createAdminNotification(
  type: "new_user" | "new_book" | "new_report" | "new_publication",
  title_en: string,
  body_en?: string,
  link?: string,
): Promise<void> {
  try {
    const service = createServiceClient();
    await service.from("notifications").insert({
      type,
      title_en,
      body_en: body_en ?? null,
      link: link ?? null,
      target_role: "admin",
    });
  } catch (e) {
    console.error("[createAdminNotification] Failed:", e);
  }
}
