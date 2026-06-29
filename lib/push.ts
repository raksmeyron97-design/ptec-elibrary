import webpush from "web-push";

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
