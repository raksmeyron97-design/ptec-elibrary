/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { validateAnnouncement } from "./validation";
import { rowToInput } from "./mapping";
import { resolveAudience } from "./audience";
import { getOrCreateDeliveryJob, processAnnouncementDeliveryJob } from "./delivery";
import { bridgeToNotifications, unbridgeNotification } from "./notifications-bridge";
import { logAnnouncementActivity, recordStatusHistory } from "./audit";
import { revalidateAnnouncementBanner } from "@/lib/cache/revalidate";

export interface AnnouncementSweepResult {
  publishedScheduled: string[];
  publishErrors: { id: string; error: string }[];
  jobsProcessed: number;
  expired: string[];
}

/**
 * Cron-driven counterpart to publishAnnouncement()'s "now" path — no
 * requirePermission() here (there is no interactive user in a cron request);
 * the announcement was already authorized when an admin scheduled it. Reuses
 * the exact same idempotent delivery-job creation, so a sweep that runs twice
 * (e.g. an overlapping external pinger tick) can never create a duplicate
 * broadcast: getOrCreateDeliveryJob() is keyed by publish_idempotency_key.
 */
export async function sweepScheduledAnnouncements(db: ReturnType<typeof createServiceClient>): Promise<{ published: string[]; errors: { id: string; error: string }[] }> {
  const now = new Date().toISOString();
  const { data: due } = await db
    .from("announcements")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", now);

  const published: string[] = [];
  const errors: { id: string; error: string }[] = [];

  for (const announcement of (due ?? []) as any[]) {
    try {
      const input = rowToInput(announcement);
      const validationErrors = validateAnnouncement(input, Date.now());
      if (Object.keys(validationErrors).length > 0) {
        // Don't silently drop it — mark it failed so it's visible in the
        // dashboard instead of looping forever on a now-invalid draft
        // (e.g. its one-time destination link expired).
        await db.from("announcements").update({ status: "failed" }).eq("id", announcement.id);
        await recordStatusHistory({ announcementId: announcement.id, fromStatus: "scheduled", toStatus: "failed", actorId: null, reason: "validation_failed_at_scheduled_time" });
        errors.push({ id: announcement.id, error: "Validation failed at scheduled time" });
        continue;
      }

      const audience = await resolveAudience(db, {
        type: announcement.audience_type,
        roles: announcement.audience_roles ?? [],
        userIds: announcement.audience_user_ids ?? [],
      });

      const idemKey: string = announcement.publish_idempotency_key ?? `${announcement.id}:${randomUUID()}`;
      const nowIso = new Date().toISOString();

      await db
        .from("announcements")
        .update({
          status: "publishing",
          publish_idempotency_key: idemKey,
          published_at: announcement.published_at ?? nowIso,
          estimated_recipients: audience.recipientCount,
          estimated_devices: audience.deviceCount,
          estimate_computed_at: nowIso,
        })
        .eq("id", announcement.id);

      await recordStatusHistory({ announcementId: announcement.id, fromStatus: "scheduled", toStatus: "publishing", actorId: null, reason: "cron_sweep" });

      const refreshed = { ...announcement, published_at: announcement.published_at ?? nowIso };
      if (announcement.channel_in_app) await bridgeToNotifications(db, refreshed);

      if (announcement.channel_push) {
        const job = await getOrCreateDeliveryJob(db, announcement.id, idemKey, audience.deviceCount);
        await processAnnouncementDeliveryJob(job.id);
      } else {
        await db.from("announcements").update({ status: "active" }).eq("id", announcement.id);
        await recordStatusHistory({ announcementId: announcement.id, fromStatus: "publishing", toStatus: "active", actorId: null });
      }

      await logAnnouncementActivity({
        actorId: announcement.created_by,
        announcementId: announcement.id,
        action: "publish",
        metadata: { via: "cron_sweep", estimatedRecipients: audience.recipientCount, estimatedDevices: audience.deviceCount },
      });

      published.push(announcement.id);
    } catch (err) {
      errors.push({ id: announcement.id, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return { published, errors };
}

/** Resume any delivery job left pending/running — the reliability backstop
 *  for a publish whose `after()` best-effort pass didn't finish (cold start,
 *  function timeout, crash) and for jobs the scheduled-sweep just created. */
export async function sweepPendingDeliveryJobs(db: ReturnType<typeof createServiceClient>): Promise<number> {
  const { data: jobs } = await db
    .from("announcement_delivery_jobs")
    .select("id")
    .in("status", ["pending", "running"]);

  let processed = 0;
  for (const job of (jobs ?? []) as any[]) {
    try {
      await processAnnouncementDeliveryJob(job.id);
      processed += 1;
    } catch (err) {
      console.error(`[announcements/cron] job ${job.id} failed:`, err);
    }
  }
  return processed;
}

/** Expire announcements past their expires_at — history is kept (status
 *  flips to 'expired'), only the reader-facing bridge row is removed. */
export async function sweepExpiredAnnouncements(db: ReturnType<typeof createServiceClient>): Promise<string[]> {
  const now = new Date().toISOString();
  const { data: due } = await db
    .from("announcements")
    .select("id, status")
    .in("status", ["active", "partially_delivered", "completed"])
    .not("expires_at", "is", null)
    .lte("expires_at", now);

  const expired: string[] = [];
  for (const row of (due ?? []) as any[]) {
    await db.from("announcements").update({ status: "expired" }).eq("id", row.id);
    await unbridgeNotification(db, row.id);
    await recordStatusHistory({ announcementId: row.id, fromStatus: row.status, toStatus: "expired", actorId: null, reason: "expires_at_passed" });
    expired.push(row.id);
  }
  return expired;
}

export async function runAnnouncementSweep(): Promise<AnnouncementSweepResult> {
  const db = createServiceClient();
  const scheduled = await sweepScheduledAnnouncements(db);
  const jobsProcessed = await sweepPendingDeliveryJobs(db);
  const expired = await sweepExpiredAnnouncements(db);

  if (scheduled.published.length > 0 || expired.length > 0) {
    // A scheduled publish or an expiry can change what the public banner
    // shows — bust its cache (best-effort; never let this fail the sweep).
    try {
      revalidateAnnouncementBanner();
    } catch (err) {
      console.error("[announcements/cron] banner revalidation failed:", err);
    }
  }

  return {
    publishedScheduled: scheduled.published,
    publishErrors: scheduled.errors,
    jobsProcessed,
    expired,
  };
}
