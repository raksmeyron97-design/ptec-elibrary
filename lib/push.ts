import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/server";
import {
  PUSH_ERROR_CODES,
  type PushPayload,
  type SerializedPushSubscription,
  safeInternalUrl,
  validatePushPayload,
} from "@/lib/push-utils";

let vapidInitialized = false;

function ensureVapid() {
  if (vapidInitialized) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error(
      "VAPID keys are not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.",
    );
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? process.env.VAPID_MAILTO ?? "mailto:info@ptec.edu.kh",
    publicKey,
    privateKey,
  );
  vapidInitialized = true;
}

export { webpush };
export type { PushPayload, SerializedPushSubscription };

const DEFAULT_ICON = "/favicon/web-app-manifest-192x192.png";
const DEFAULT_BADGE = "/favicon/favicon-96x96.png";
const DELIVERY_CONCURRENCY = 25;

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth_key: string;
  failure_count?: number | null;
};

function normalizePayload(payload: PushPayload): PushPayload {
  const validation = validatePushPayload(payload);
  if (!validation.ok || !validation.data) {
    throw new Error(validation.code ?? PUSH_ERROR_CODES.PUSH_SEND_FAILED);
  }

  return {
    ...validation.data,
    icon: validation.data.icon ?? DEFAULT_ICON,
    badge: validation.data.badge ?? DEFAULT_BADGE,
    url: safeInternalUrl(validation.data.url),
    tag: validation.data.tag ?? validation.data.eventId,
  };
}

async function settleInBatches<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  for (let i = 0; i < items.length; i += limit) {
    await Promise.allSettled(items.slice(i, i + limit).map(worker));
  }
}

export async function sendPush(
  subscription: SerializedPushSubscription,
  payload: PushPayload,
) {
  try {
    ensureVapid();
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      },
      JSON.stringify(normalizePayload(payload)),
      { TTL: 86400 },
    );
    return { ok: true };
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    return { ok: false, expired: status === 410 || status === 404, statusCode: status };
  }
}

async function deliverRows(rows: PushSubscriptionRow[], payload: PushPayload): Promise<{
  sent: number;
  expired: number;
  failed: number;
}> {
  if (rows.length === 0) return { sent: 0, expired: 0, failed: 0 };

  const db = createServiceClient();
  const now = new Date().toISOString();
  let sent = 0;
  let expired = 0;
  let failed = 0;

  await settleInBatches(rows, DELIVERY_CONCURRENCY, async (sub) => {
    const res = await sendPush(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
      payload,
    );

    if (res.ok) {
      sent += 1;
      await db
        .from("push_subscriptions")
        .update({ last_success_at: now, failure_count: 0, enabled: true })
        .eq("endpoint", sub.endpoint);
      return;
    }

    const nextFailureCount = (sub.failure_count ?? 0) + 1;
    if (res.expired) {
      expired += 1;
      await db
        .from("push_subscriptions")
        .update({ enabled: false, last_failure_at: now, failure_count: nextFailureCount })
        .eq("endpoint", sub.endpoint);
      return;
    }

    failed += 1;
    await db
      .from("push_subscriptions")
      .update({ last_failure_at: now, failure_count: nextFailureCount })
      .eq("endpoint", sub.endpoint);
  });

  return { sent, expired, failed };
}

/**
 * Push a payload to every push subscription of the given users, pruning
 * expired endpoints (mirrors /api/push/send). Server-to-server only — callers
 * must already be authorized. Returns the number of notifications delivered.
 */
export async function broadcastPush(
  userIds: string[],
  payload: PushPayload,
): Promise<number> {
  if (userIds.length === 0) return 0;

  const db = createServiceClient();
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key, failure_count")
    .eq("enabled", true)
    .in("user_id", userIds);
  if (!subs?.length) return 0;

  const result = await deliverRows(subs, payload);
  return result.sent;
}

export async function broadcastAllPush(payload: PushPayload): Promise<{
  sent: number;
  expired: number;
  failed: number;
}> {
  const db = createServiceClient();
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key, failure_count")
    .eq("enabled", true);

  return deliverRows(subs ?? [], payload);
}
