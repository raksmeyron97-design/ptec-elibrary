import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/server";

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
    process.env.VAPID_MAILTO ?? "mailto:info@ptec.edu.kh",
    publicKey,
    privateKey,
  );
  vapidInitialized = true;
}

export { webpush };

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

export async function sendPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PushPayload,
) {
  ensureVapid();
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      },
      JSON.stringify(payload),
      { TTL: 86400 },
    );
    return { ok: true };
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    return { ok: false, expired: status === 410 || status === 404 };
  }
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
    .select("endpoint, p256dh, auth_key")
    .in("user_id", userIds);
  if (!subs?.length) return 0;

  let sent = 0;
  const expired: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      const res = await sendPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        payload,
      );
      if (res.ok) sent++;
      else if (res.expired) expired.push(sub.endpoint);
    }),
  );

  if (expired.length > 0) {
    await db.from("push_subscriptions").delete().in("endpoint", expired);
  }
  return sent;
}
