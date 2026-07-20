"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { requirePermission, requireStaff } from "@/lib/auth/requireAdmin";
import { revalidateLocalizedPath as revalidatePath, revalidatePublicPath, revalidateAnnouncementBanner } from "@/lib/cache/revalidate";
import { rateLimit } from "@/lib/rate-limit";
import { sendPush } from "@/lib/push";
import { normalizeStatus, type AnnouncementStatus } from "@/lib/admin/announcements/shared";
import { validateAnnouncement, firstValidationError, type AnnouncementInput } from "@/lib/admin/announcements/validation";
import { checkDestinationUrl } from "@/lib/admin/announcements/url-safety";
import { assertTransition } from "@/lib/admin/announcements/state-machine";
import { resolveAudience, estimateAudience, type AudienceRule } from "@/lib/admin/announcements/audience";
import { getOrCreateDeliveryJob, processAnnouncementDeliveryJob, retryFailedDeliveries } from "@/lib/admin/announcements/delivery";
import { logAnnouncementActivity, recordStatusHistory } from "@/lib/admin/announcements/audit";
import { inputToRow, rowToInput, channelsSummary } from "@/lib/admin/announcements/mapping";
import { bridgeToNotifications, unbridgeNotification } from "@/lib/admin/announcements/notifications-bridge";

// ── Shared helpers ───────────────────────────────────────────────────────────

async function requestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
    return { ip, userAgent: h.get("user-agent") ?? undefined };
  } catch {
    return {};
  }
}

async function enforceRateLimit(userId: string) {
  const { success } = await rateLimit(`announcement-mutate:${userId}`, 30, 60_000);
  if (!success) throw new Error("Too many changes — please wait a moment and try again.");
}

function revalidateAnnouncementSurfaces() {
  revalidatePath("/admin/announcements");
  // The public banner reads active announcements via its own cache tag —
  // this also revalidates the public layout tree it renders in.
  revalidateAnnouncementBanner();
  revalidatePublicPath("/");
}

// ── Draft CRUD ────────────────────────────────────────────────────────────

export async function createDraftAnnouncement(input: AnnouncementInput): Promise<{ id: string }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  await enforceRateLimit(user.id);

  if (!input.internalName.trim()) throw new Error("Internal name is required.");
  if (!input.content.en.title.trim()) throw new Error("English title is required.");

  const { data, error } = await supabase
    .from("announcements")
    .insert({ ...inputToRow(input), status: "draft", created_by: user.id, updated_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create announcement: ${error.message}`);

  await recordStatusHistory({ announcementId: data.id, fromStatus: null, toStatus: "draft", actorId: user.id });
  const meta = await requestMeta();
  await logAnnouncementActivity({ actorId: user.id, announcementId: data.id, action: "create", metadata: { internalName: input.internalName, ...meta } });

  revalidateAnnouncementSurfaces();
  return { id: data.id };
}

export async function updateAnnouncement(id: string, input: AnnouncementInput): Promise<{ success: true }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  await enforceRateLimit(user.id);

  const { data: existing, error: fetchError } = await supabase.from("announcements").select("status").eq("id", id).single();
  if (fetchError || !existing) throw new Error("Announcement not found.");

  const status = normalizeStatus(existing.status);
  if (!["draft", "awaiting_approval", "scheduled"].includes(status)) {
    throw new Error(`Cannot edit an announcement that is ${status}. Duplicate it to make a new version instead.`);
  }
  if (!input.internalName.trim()) throw new Error("Internal name is required.");
  if (!input.content.en.title.trim()) throw new Error("English title is required.");

  const { error } = await supabase.from("announcements").update({ ...inputToRow(input), updated_by: user.id }).eq("id", id);
  if (error) throw new Error(`Update failed: ${error.message}`);

  const meta = await requestMeta();
  await logAnnouncementActivity({ actorId: user.id, announcementId: id, action: "update", metadata: { internalName: input.internalName, ...meta } });

  revalidateAnnouncementSurfaces();
  return { success: true };
}

export async function deleteAnnouncement(id: string): Promise<{ success: true }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  await enforceRateLimit(user.id);

  const { data: existing } = await supabase.from("announcements").select("status, internal_name").eq("id", id).single();
  if (!existing) throw new Error("Announcement not found.");
  const status = normalizeStatus(existing.status);
  if (!["draft", "awaiting_approval"].includes(status)) {
    throw new Error("Only drafts can be permanently deleted — archive published announcements instead to keep their delivery history.");
  }

  await db_delete(supabase, id);
  const meta = await requestMeta();
  await logAnnouncementActivity({ actorId: user.id, announcementId: id, action: "delete", metadata: { internalName: existing.internal_name, ...meta } });
  revalidateAnnouncementSurfaces();
  return { success: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function db_delete(supabase: any, id: string) {
  await supabase.from("notifications").delete().eq("source_announcement_id", id);
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}

export async function duplicateAnnouncement(id: string): Promise<{ id: string }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  await enforceRateLimit(user.id);

  const { data: source, error } = await supabase.from("announcements").select("*").eq("id", id).single();
  if (error || !source) throw new Error("Announcement not found.");

  const input = rowToInput(source);
  input.internalName = `${input.internalName} (Copy)`;

  const { data: copy, error: insertError } = await supabase
    .from("announcements")
    .insert({ ...inputToRow(input), status: "draft", created_by: user.id, updated_by: user.id })
    .select("id")
    .single();
  if (insertError) throw new Error(`Duplicate failed: ${insertError.message}`);

  await recordStatusHistory({ announcementId: copy.id, fromStatus: null, toStatus: "draft", actorId: user.id, reason: `duplicated from ${id}` });
  const meta = await requestMeta();
  await logAnnouncementActivity({ actorId: user.id, announcementId: copy.id, action: "duplicate", metadata: { sourceId: id, ...meta } });

  revalidateAnnouncementSurfaces();
  return { id: copy.id };
}

// ── Audience estimate (composer preview) ─────────────────────────────────

export async function estimateAudienceAction(rule: AudienceRule): Promise<{ recipientCount: number; deviceCount: number }> {
  const { supabase, user } = await requirePermission("announcements", "read");
  const { success } = await rateLimit(`announcement-estimate:${user.id}`, 30, 60_000);
  if (!success) throw new Error("Too many estimate requests — please slow down.");
  return estimateAudience(supabase, rule);
}

/** Small typeahead for "individually selected users" — active accounts only,
 *  matched by name or email. Never returns more than 20 rows. */
export async function searchUsersForAudience(query: string): Promise<{ id: string; name: string; email: string | null }[]> {
  const { supabase, user } = await requirePermission("announcements", "read");
  const { success } = await rateLimit(`announcement-user-search:${user.id}`, 30, 60_000);
  if (!success) throw new Error("Too many searches — please slow down.");

  const q = query.trim().slice(0, 100);
  if (!q) return [];

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("status", "active")
    .or(`full_name.ilike.%${q.replace(/[%,()\\*]/g, " ")}%,email.ilike.%${q.replace(/[%,()\\*]/g, " ")}%`)
    .limit(20);

  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || p.id, email: p.email }));
}

// ── Test push ──────────────────────────────────────────────────────────────

export async function sendTestAnnouncementPush(input: { title: string; body: string; url: string }): Promise<{ sent: number; expired: number; failed: number }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  const limited = await rateLimit(`announcement-test-push:${user.id}`, 3, 10 * 60_000);
  if (!limited.success) throw new Error("Too many test notifications — try again in a few minutes.");

  const title = (input.title || "PTEC Library").trim().slice(0, 120);
  const body = (input.body || "This is a test notification.").trim().slice(0, 400);
  const urlCheck = checkDestinationUrl(input.url || "/");
  const url = urlCheck.ok ? urlCheck.url : "/";

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key, failure_count")
    .eq("user_id", user.id)
    .eq("enabled", true);
  if (error) throw new Error("Could not load your push subscriptions.");
  if (!subs?.length) throw new Error("You don't have an active push subscription on this device — enable notifications first, then try again.");

  const now = new Date().toISOString();
  let sent = 0, expired = 0, failed = 0;

  await Promise.allSettled(
    subs.map(async (sub) => {
      const result = await sendPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        { type: "TEST", title: `[Test] ${title}`, body, url, tag: `ann-test-${user.id}`, eventId: `ann-test-${user.id}-${Date.now()}` },
      );
      if (result.ok) {
        sent += 1;
        await supabase.from("push_subscriptions").update({ last_success_at: now, failure_count: 0 }).eq("endpoint", sub.endpoint).eq("user_id", user.id);
      } else if (result.expired) {
        expired += 1;
        await supabase.from("push_subscriptions").update({ enabled: false, last_failure_at: now, failure_count: (sub.failure_count ?? 0) + 1 }).eq("endpoint", sub.endpoint).eq("user_id", user.id);
      } else {
        failed += 1;
        await supabase.from("push_subscriptions").update({ last_failure_at: now, failure_count: (sub.failure_count ?? 0) + 1 }).eq("endpoint", sub.endpoint).eq("user_id", user.id);
      }
    }),
  );

  if (sent === 0) throw new Error(expired > 0 ? "Your subscription expired — re-enable notifications and try again." : "Could not deliver a test notification.");
  return { sent, expired, failed };
}

// ── Status transitions ───────────────────────────────────────────────────

export async function requestApproval(id: string): Promise<{ success: true }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  const { data: row } = await supabase.from("announcements").select("status").eq("id", id).single();
  if (!row) throw new Error("Announcement not found.");
  const status = normalizeStatus(row.status);
  assertTransition(status, "awaiting_approval");

  await supabase.from("announcements").update({ status: "awaiting_approval", updated_by: user.id }).eq("id", id);
  await recordStatusHistory({ announcementId: id, fromStatus: status, toStatus: "awaiting_approval", actorId: user.id });
  await logAnnouncementActivity({ actorId: user.id, announcementId: id, action: "request_approval" });
  revalidateAnnouncementSurfaces();
  return { success: true };
}

/**
 * Approve blocks self-approval EXCEPT in a solo-admin environment (fewer than
 * two admin/super_admin accounts exist), where a mandatory separation of
 * duties would make the optional approval workflow completely unusable.
 * Documented limitation — see the final handoff.
 */
export async function approveAnnouncement(id: string): Promise<{ success: true }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  const { data: row } = await supabase.from("announcements").select("status, created_by").eq("id", id).single();
  if (!row) throw new Error("Announcement not found.");
  const status = normalizeStatus(row.status);
  assertTransition(status, "draft");

  if (row.created_by === user.id) {
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).in("role", ["admin", "super_admin"]);
    if ((count ?? 0) > 1) throw new Error("You cannot approve your own announcement — ask another admin to review it.");
  }

  await supabase.from("announcements").update({ status: "draft", approved_by: user.id, approved_at: new Date().toISOString(), updated_by: user.id }).eq("id", id);
  await recordStatusHistory({ announcementId: id, fromStatus: status, toStatus: "draft", actorId: user.id, reason: "approved" });
  await logAnnouncementActivity({ actorId: user.id, announcementId: id, action: "approve" });
  revalidateAnnouncementSurfaces();
  return { success: true };
}

export async function rejectAnnouncement(id: string, reason: string): Promise<{ success: true }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  const { data: row } = await supabase.from("announcements").select("status").eq("id", id).single();
  if (!row) throw new Error("Announcement not found.");
  const status = normalizeStatus(row.status);
  assertTransition(status, "draft");

  await supabase.from("announcements").update({ status: "draft", updated_by: user.id }).eq("id", id);
  await recordStatusHistory({ announcementId: id, fromStatus: status, toStatus: "draft", actorId: user.id, reason: reason || "rejected" });
  await logAnnouncementActivity({ actorId: user.id, announcementId: id, action: "reject", metadata: { reason } });
  revalidateAnnouncementSurfaces();
  return { success: true };
}

export async function cancelScheduledAnnouncement(id: string): Promise<{ success: true }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  const { data: row } = await supabase.from("announcements").select("status").eq("id", id).single();
  if (!row) throw new Error("Announcement not found.");
  const status = normalizeStatus(row.status);
  assertTransition(status, "draft");
  if (status !== "scheduled") throw new Error("Only a scheduled announcement can be cancelled this way.");

  await supabase.from("announcements").update({ status: "draft", scheduled_at: null, updated_by: user.id }).eq("id", id);
  await recordStatusHistory({ announcementId: id, fromStatus: status, toStatus: "draft", actorId: user.id, reason: "schedule cancelled" });
  await logAnnouncementActivity({ actorId: user.id, announcementId: id, action: "cancel_schedule" });
  revalidateAnnouncementSurfaces();
  return { success: true };
}

export async function pauseAnnouncement(id: string): Promise<{ success: true }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  const { data: row } = await supabase.from("announcements").select("status").eq("id", id).single();
  if (!row) throw new Error("Announcement not found.");
  const status = normalizeStatus(row.status);
  assertTransition(status, "draft");

  await supabase.from("announcements").update({ status: "draft", updated_by: user.id }).eq("id", id);
  await unbridgeNotification(supabase, id);
  await recordStatusHistory({ announcementId: id, fromStatus: status, toStatus: "draft", actorId: user.id, reason: "paused" });
  await logAnnouncementActivity({ actorId: user.id, announcementId: id, action: "pause" });
  revalidateAnnouncementSurfaces();
  return { success: true };
}

export async function archiveAnnouncement(id: string): Promise<{ success: true }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  const { data: row } = await supabase.from("announcements").select("status").eq("id", id).single();
  if (!row) throw new Error("Announcement not found.");
  const status = normalizeStatus(row.status);
  assertTransition(status, "archived");

  await supabase.from("announcements").update({ status: "archived", archived_at: new Date().toISOString(), updated_by: user.id }).eq("id", id);
  await unbridgeNotification(supabase, id);
  await recordStatusHistory({ announcementId: id, fromStatus: status, toStatus: "archived", actorId: user.id });
  await logAnnouncementActivity({ actorId: user.id, announcementId: id, action: "archive" });
  revalidateAnnouncementSurfaces();
  return { success: true };
}

export async function resendFailedDeliveriesAction(id: string): Promise<{ queued: number }> {
  const { user } = await requirePermission("announcements_push", "write");
  const { jobId, queued } = await retryFailedDeliveries(id);
  if (jobId && queued > 0) {
    after(() => processAnnouncementDeliveryJob(jobId).catch((e) => console.error("[announcements] resend after() failed:", e)));
  }
  await logAnnouncementActivity({ actorId: user.id, announcementId: id, action: "resend_failed", metadata: { queued } });
  revalidateAnnouncementSurfaces();
  return { queued };
}

// ── Publish (the one safe path to a real broadcast) ─────────────────────

export interface PublishOptions {
  mode: "now" | "schedule";
  scheduledAt?: string | null;
}

export interface PublishResult {
  success: true;
  status: AnnouncementStatus;
  estimatedRecipients: number;
  estimatedDevices: number;
}

export async function publishAnnouncement(id: string, opts: PublishOptions): Promise<PublishResult> {
  const { supabase, user } = await requirePermission("announcements", "write");
  await enforceRateLimit(user.id);

  const { data: announcement, error } = await supabase.from("announcements").select("*").eq("id", id).single();
  if (error || !announcement) throw new Error("Announcement not found.");

  const currentStatus = normalizeStatus(announcement.status);
  const targetStatus: AnnouncementStatus = opts.mode === "schedule" ? "scheduled" : "publishing";
  assertTransition(currentStatus, targetStatus);

  const input = rowToInput(announcement);
  const errors = validateAnnouncement(input);
  if (Object.keys(errors).length > 0) {
    throw new Error(firstValidationError(errors) ?? "This announcement is not ready to publish yet.");
  }

  // Broadcast authority is separate from content authority.
  if (announcement.channel_push) {
    await requirePermission("announcements_push", "write");
  }

  if (opts.mode === "schedule") {
    const when = new Date(opts.scheduledAt ?? "");
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      throw new Error("Scheduled time must be a valid future date/time.");
    }
    await supabase.from("announcements").update({ status: "scheduled", scheduled_at: when.toISOString(), updated_by: user.id }).eq("id", id);
    await recordStatusHistory({ announcementId: id, fromStatus: currentStatus, toStatus: "scheduled", actorId: user.id });
    const meta = await requestMeta();
    await logAnnouncementActivity({
      actorId: user.id,
      announcementId: id,
      action: "schedule",
      metadata: { scheduledAt: when.toISOString(), channels: channelsSummary(announcement), ...meta },
    });
    revalidateAnnouncementSurfaces();
    return { success: true, status: "scheduled", estimatedRecipients: announcement.estimated_recipients ?? 0, estimatedDevices: announcement.estimated_devices ?? 0 };
  }

  // mode === "now": recalculate the audience server-side — never trust a
  // cached composer estimate or anything the client submitted.
  const audience = await resolveAudience(supabase, {
    type: announcement.audience_type,
    roles: announcement.audience_roles ?? [],
    userIds: announcement.audience_user_ids ?? [],
  });

  // Idempotency: reuse an existing in-flight key if this announcement is
  // already mid-publish (double click / retry / refresh); otherwise mint one.
  const idemKey: string = announcement.publish_idempotency_key ?? `${id}:${randomUUID()}`;
  const nowIso = new Date().toISOString();

  await supabase
    .from("announcements")
    .update({
      status: "publishing",
      publish_idempotency_key: idemKey,
      published_at: announcement.published_at ?? nowIso,
      estimated_recipients: audience.recipientCount,
      estimated_devices: audience.deviceCount,
      estimate_computed_at: nowIso,
      updated_by: user.id,
    })
    .eq("id", id);

  await recordStatusHistory({ announcementId: id, fromStatus: currentStatus, toStatus: "publishing", actorId: user.id });

  const refreshed = { ...announcement, published_at: announcement.published_at ?? nowIso };
  if (announcement.channel_in_app) {
    await bridgeToNotifications(supabase, refreshed);
  }

  let jobId: string | null = null;
  if (announcement.channel_push) {
    const job = await getOrCreateDeliveryJob(supabase, id, idemKey, audience.deviceCount);
    jobId = job.id;
  }

  const meta = await requestMeta();
  await logAnnouncementActivity({
    actorId: user.id,
    announcementId: id,
    action: "publish",
    metadata: {
      channels: channelsSummary(announcement),
      estimatedRecipients: audience.recipientCount,
      estimatedDevices: audience.deviceCount,
      jobId,
      ...meta,
    },
  });

  let finalStatus: AnnouncementStatus = "publishing";
  if (!announcement.channel_push) {
    finalStatus = "active";
    await supabase.from("announcements").update({ status: "active" }).eq("id", id);
    await recordStatusHistory({ announcementId: id, fromStatus: "publishing", toStatus: "active", actorId: user.id });
  } else if (jobId) {
    // Never send synchronously inside this request — kick off delivery in
    // the background after the response is sent. The cron sweep
    // (/api/cron/publish-scheduled) is the reliability backstop for anything
    // this best-effort pass doesn't finish (cold start, timeout, crash).
    const jobIdForClosure = jobId;
    after(() => processAnnouncementDeliveryJob(jobIdForClosure).catch((e) => console.error("[announcements] publish after() failed:", e)));
  }

  revalidateAnnouncementSurfaces();
  return { success: true, status: finalStatus, estimatedRecipients: audience.recipientCount, estimatedDevices: audience.deviceCount };
}

// ── Bulk actions ──────────────────────────────────────────────────────────

export type BulkAnnouncementAction = "archive" | "delete";

export async function bulkUpdateAnnouncements(ids: string[], action: BulkAnnouncementAction): Promise<{ success: number; failed: number }> {
  const { user } = await requireStaff();
  if (!ids.length) return { success: 0, failed: 0 };

  let success = 0, failed = 0;
  for (const id of ids) {
    try {
      if (action === "archive") await archiveAnnouncement(id);
      else await deleteAnnouncement(id);
      success += 1;
    } catch {
      failed += 1;
    }
  }

  await logAnnouncementActivity({ actorId: user.id, announcementId: ids[0], action: "bulk_action", metadata: { action, ids, success, failed } });
  revalidateAnnouncementSurfaces();
  return { success, failed };
}
