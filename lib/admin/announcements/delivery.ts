/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { sendPush, type PushPayload } from "@/lib/push";
import { safeInternalUrl } from "@/lib/push-utils";
import { resolveAudience } from "./audience";
import { computeOverallStatus, type DeliveryTotals } from "./state-machine";
import { logAnnouncementActivity, recordStatusHistory } from "./audit";
import type { AnnouncementStatus } from "./shared";

const DELIVERY_CONCURRENCY = 25;
const MAX_RETRIES = 5;
/** Exponential backoff by attempt number (minutes): 1, 5, 15, 60, 240. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 240];

function backoffTime(retryCount: number): string {
  const minutes = BACKOFF_MINUTES[Math.min(retryCount - 1, BACKOFF_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function settleInBatches<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += limit) {
    await Promise.allSettled(items.slice(i, i + limit).map(worker));
  }
}

function buildPushPayload(announcement: any): PushPayload {
  const title = (announcement.push_title || announcement.title_en || "PTEC Library").trim();
  const body = (announcement.push_body || announcement.summary_en || announcement.title_en || "").trim();
  const url = safeInternalUrl(announcement.push_url || announcement.cta_url || "/");
  const eventId = `announcement:${announcement.id}:${announcement.published_at ?? announcement.id}`;
  return {
    type: "NEW_ANNOUNCEMENT",
    title,
    body,
    url,
    tag: eventId,
    entityId: announcement.id,
    eventId,
  };
}

/**
 * Create (or reuse, if it already exists) the delivery job for a publish
 * event. `idempotencyKey` is derived deterministically by the caller from the
 * announcement id + publish attempt, so a duplicate publish request (double
 * click, retry, refresh) always resolves to the SAME job row instead of a
 * second broadcast.
 */
export async function getOrCreateDeliveryJob(
  db: ReturnType<typeof createServiceClient>,
  announcementId: string,
  idempotencyKey: string,
  totalTargets: number,
): Promise<{ id: string; created: boolean }> {
  const { data: existing } = await db
    .from("announcement_delivery_jobs")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) return { id: existing.id, created: false };

  const { data: inserted, error } = await db
    .from("announcement_delivery_jobs")
    .insert({
      announcement_id: announcementId,
      channel: "push",
      idempotency_key: idempotencyKey,
      status: "pending",
      total_targets: totalTargets,
    })
    .select("id")
    .single();

  if (error) {
    // Unique-violation race: another concurrent request created it first —
    // fetch and reuse rather than failing the publish.
    const { data: raced } = await db
      .from("announcement_delivery_jobs")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (raced) return { id: raced.id, created: false };
    throw new Error(`Could not create delivery job: ${error.message}`);
  }

  return { id: inserted.id, created: true };
}

/**
 * Process (or resume) a delivery job. Safe to call repeatedly and
 * concurrently: already-`sent` rows are skipped via the (job_id,
 * push_subscription_id) upsert key, so a cron resume after a crash, a manual
 * "resend failed", and the initial `after()` kick-off can never double-send
 * to the same device. Batches sends with bounded concurrency — this function
 * is designed to run in the background (via `after()` or the cron sweep),
 * never inline inside the request that triggered publish.
 */
export async function processAnnouncementDeliveryJob(jobId: string): Promise<{ status: string }> {
  const db = createServiceClient();

  const { data: job } = await db.from("announcement_delivery_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return { status: "not_found" };
  if (job.status !== "pending" && job.status !== "running") return { status: job.status };

  await db
    .from("announcement_delivery_jobs")
    .update({ status: "running", started_at: job.started_at ?? new Date().toISOString() })
    .eq("id", jobId);

  const { data: announcement } = await db.from("announcements").select("*").eq("id", job.announcement_id).maybeSingle();
  if (!announcement) {
    await db
      .from("announcement_delivery_jobs")
      .update({ status: "failed", last_error: "Announcement not found", completed_at: new Date().toISOString() })
      .eq("id", jobId);
    return { status: "failed" };
  }

  const audience = await resolveAudience(db, {
    type: announcement.audience_type,
    roles: announcement.audience_roles ?? [],
    userIds: announcement.audience_user_ids ?? [],
  });

  const subRows =
    audience.userIds.length === 0
      ? []
      : ((
          await db
            .from("push_subscriptions")
            .select("id, endpoint, p256dh, auth_key, failure_count, user_id")
            .eq("enabled", true)
            .in("user_id", audience.userIds)
        ).data ?? []);

  const { data: existingRowsRaw } = await db
    .from("announcement_push_deliveries")
    .select("*")
    .eq("job_id", jobId);
  const existingBySub = new Map<string, any>((existingRowsRaw ?? []).map((r: any) => [r.push_subscription_id, r]));

  const now = Date.now();
  const targets = subRows.filter((sub: any) => {
    const existing = existingBySub.get(sub.id);
    if (!existing) return true;
    if (existing.status === "sent" || existing.status === "dead" || existing.status === "expired") return false;
    if (existing.status === "failed") {
      if (existing.retry_count >= MAX_RETRIES) return false;
      return !existing.next_retry_at || new Date(existing.next_retry_at).getTime() <= now;
    }
    return true; // "queued"
  });

  const payload = buildPushPayload(announcement);

  await settleInBatches(targets, DELIVERY_CONCURRENCY, async (sub: any) => {
    const existing = existingBySub.get(sub.id);
    const result = await sendPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
    const nowIso = new Date().toISOString();

    if (result.ok) {
      await db.from("announcement_push_deliveries").upsert(
        {
          job_id: jobId,
          announcement_id: announcement.id,
          push_subscription_id: sub.id,
          user_id: sub.user_id,
          status: "sent",
          attempted_at: nowIso,
          delivered_at: nowIso,
          retry_count: existing?.retry_count ?? 0,
          error_code: null,
          next_retry_at: null,
        },
        { onConflict: "job_id,push_subscription_id" },
      );
      await db.from("push_subscriptions").update({ last_success_at: nowIso, failure_count: 0, enabled: true }).eq("id", sub.id);
      return;
    }

    if (result.expired) {
      await db.from("announcement_push_deliveries").upsert(
        {
          job_id: jobId,
          announcement_id: announcement.id,
          push_subscription_id: sub.id,
          user_id: sub.user_id,
          status: "expired",
          attempted_at: nowIso,
          error_code: "SUBSCRIPTION_EXPIRED",
          retry_count: existing?.retry_count ?? 0,
        },
        { onConflict: "job_id,push_subscription_id" },
      );
      await db
        .from("push_subscriptions")
        .update({ enabled: false, last_failure_at: nowIso, failure_count: (sub.failure_count ?? 0) + 1 })
        .eq("id", sub.id);
      return;
    }

    const retryCount = (existing?.retry_count ?? 0) + 1;
    const dead = retryCount >= MAX_RETRIES;
    await db.from("announcement_push_deliveries").upsert(
      {
        job_id: jobId,
        announcement_id: announcement.id,
        push_subscription_id: sub.id,
        user_id: sub.user_id,
        status: dead ? "dead" : "failed",
        attempted_at: nowIso,
        error_code: String(result.statusCode ?? "SEND_FAILED"),
        retry_count: retryCount,
        next_retry_at: dead ? null : backoffTime(retryCount),
      },
      { onConflict: "job_id,push_subscription_id" },
    );
    await db
      .from("push_subscriptions")
      .update({ last_failure_at: nowIso, failure_count: (sub.failure_count ?? 0) + 1 })
      .eq("id", sub.id);
  });

  // Recompute totals from ALL rows for this job (source of truth), not just
  // this pass, so partial resumes accumulate correctly.
  const { data: allRows } = await db.from("announcement_push_deliveries").select("status, retry_count, next_retry_at").eq("job_id", jobId);
  const rows = (allRows ?? []) as any[];
  const totals: DeliveryTotals = {
    sent: rows.filter((r) => r.status === "sent").length,
    failed: rows.filter((r) => r.status === "failed" || r.status === "dead").length,
    expired: rows.filter((r) => r.status === "expired").length,
    total: subRows.length,
  };
  const hasMorePending =
    subRows.length > rows.filter((r) => r.status === "sent" || r.status === "expired" || r.status === "dead").length &&
    rows.some((r) => r.status === "queued" || (r.status === "failed" && r.retry_count < MAX_RETRIES));

  const jobStatus: "running" | "completed" = hasMorePending ? "running" : "completed";

  await db
    .from("announcement_delivery_jobs")
    .update({
      processed: totals.sent + totals.failed + totals.expired,
      sent: totals.sent,
      failed: totals.failed,
      expired: totals.expired,
      total_targets: totals.total,
      status: jobStatus,
      completed_at: jobStatus === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", jobId);

  const hasNonPushLiveChannel = !!(announcement.channel_in_app || announcement.channel_banner);
  const overallStatus = computeOverallStatus(hasNonPushLiveChannel, true, totals) as AnnouncementStatus;

  if (overallStatus !== announcement.status) {
    await db.from("announcements").update({ status: overallStatus }).eq("id", announcement.id);
    await recordStatusHistory({
      announcementId: announcement.id,
      fromStatus: announcement.status,
      toStatus: overallStatus,
      actorId: null,
      reason: "delivery_job_progress",
      metadata: { jobId, ...totals },
    });
  }

  if (jobStatus === "completed") {
    await logAnnouncementActivity({
      actorId: announcement.updated_by ?? announcement.created_by ?? null,
      announcementId: announcement.id,
      action: "delivery_completed",
      status: totals.sent > 0 || totals.total === 0 ? "success" : "failed",
      metadata: { jobId, ...totals },
    });
  }

  return { status: jobStatus };
}

/**
 * Manual "resend failed deliveries" — clears the backoff wait on retryable
 * rows and re-enters processAnnouncementDeliveryJob immediately (still
 * bounded/batched, never a raw loop in the request). Dead (permanently
 * failed) and expired rows are left untouched; expired subscriptions must be
 * re-subscribed by the reader, not retried server-side.
 */
export async function retryFailedDeliveries(announcementId: string): Promise<{ jobId: string | null; queued: number }> {
  const db = createServiceClient();
  const { data: job } = await db
    .from("announcement_delivery_jobs")
    .select("id, status")
    .eq("announcement_id", announcementId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) return { jobId: null, queued: 0 };

  const { data: retryable } = await db
    .from("announcement_push_deliveries")
    .update({ next_retry_at: new Date().toISOString() })
    .eq("job_id", job.id)
    .eq("status", "failed")
    .lt("retry_count", MAX_RETRIES)
    .select("id");

  const queued = retryable?.length ?? 0;
  if (queued > 0 && job.status !== "running") {
    await db.from("announcement_delivery_jobs").update({ status: "running" }).eq("id", job.id);
  }

  return { jobId: job.id, queued };
}
