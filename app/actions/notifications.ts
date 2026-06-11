"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireAdmin, requireUser } from "@/lib/auth-guards";
import { revalidatePath } from "next/cache";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType = "new_user" | "new_book" | "new_report" | "announcement";

export interface Notification {
  id: string;
  type: NotificationType;
  title_en: string;
  title_km: string | null;
  body_en: string | null;
  body_km: string | null;
  link: string | null;
  target_role: "admin" | null;
  created_at: string;
  is_read: boolean;
}

// ── getUnreadCount ────────────────────────────────────────────────────────────
// Lightweight — polled every 60s. Returns 0 for unauthenticated callers.
export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  // Fetch all visible notification IDs (RLS filters by role automatically)
  const { data: allNotifs } = await supabase
    .from("notifications")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(200);

  if (!allNotifs || allNotifs.length === 0) return 0;

  const allIds = allNotifs.map((n) => n.id);

  const { count } = await supabase
    .from("notification_reads")
    .select("notification_id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("notification_id", allIds);

  return Math.max(0, allIds.length - (count ?? 0));
}

// ── getNotifications ──────────────────────────────────────────────────────────
// Full fetch with is_read flag — called only when the dropdown opens.
export async function getNotifications(): Promise<{
  data: Notification[];
  error: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: [], error: null };

  const { data: notifs, error } = await supabase
    .from("notifications")
    .select("id, type, title_en, title_km, body_en, body_km, link, target_role, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { data: [], error: error.message };
  if (!notifs || notifs.length === 0) return { data: [], error: null };

  const notifIds = notifs.map((n) => n.id);

  const { data: reads } = await supabase
    .from("notification_reads")
    .select("notification_id")
    .eq("user_id", user.id)
    .in("notification_id", notifIds);

  const readSet = new Set((reads ?? []).map((r) => r.notification_id));

  return {
    data: notifs.map((n) => ({ ...n, is_read: readSet.has(n.id) })),
    error: null,
  };
}

// ── markAsRead ────────────────────────────────────────────────────────────────
export async function markAsRead(notificationId: string): Promise<void> {
  const { user, supabase } = await requireUser();
  await supabase
    .from("notification_reads")
    .upsert(
      { notification_id: notificationId, user_id: user.id },
      { onConflict: "notification_id,user_id" }
    );
}

// ── markAllAsRead ─────────────────────────────────────────────────────────────
export async function markAllAsRead(): Promise<void> {
  const { user, supabase } = await requireUser();

  const { data: notifs } = await supabase
    .from("notifications")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(200);

  if (!notifs || notifs.length === 0) return;

  const rows = notifs.map((n) => ({
    notification_id: n.id,
    user_id: user.id,
  }));

  await supabase
    .from("notification_reads")
    .upsert(rows, { onConflict: "notification_id,user_id", ignoreDuplicates: true });
}

// ── createAnnouncement ────────────────────────────────────────────────────────
// Admin-only: broadcasts to all authenticated users (target_role = NULL).
export async function createAnnouncement(payload: {
  title_en: string;
  title_km?: string;
  body_en?: string;
  body_km?: string;
  link?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin();
    const { error } = await supabase.from("notifications").insert({
      type: "announcement",
      title_en: payload.title_en,
      title_km: payload.title_km ?? null,
      body_en: payload.body_en ?? null,
      body_km: payload.body_km ?? null,
      link: payload.link ?? null,
      target_role: null,
    });
    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/announcements");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── getAnnouncementsForAdmin ──────────────────────────────────────────────────
export async function getAnnouncementsForAdmin(): Promise<{
  data: Notification[];
  error: string | null;
}> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title_en, title_km, body_en, body_km, link, target_role, created_at")
    .eq("type", "announcement")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { data: [], error: error.message };
  return {
    data: (data ?? []).map((n) => ({ ...n, is_read: false })),
    error: null,
  };
}

// ── createAdminNotification ───────────────────────────────────────────────────
// Internal helper called by other server actions. Never throws — errors are
// logged only so the calling action always completes successfully.
export async function createAdminNotification(
  type: "new_user" | "new_book" | "new_report",
  title_en: string,
  body_en?: string,
  link?: string
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
