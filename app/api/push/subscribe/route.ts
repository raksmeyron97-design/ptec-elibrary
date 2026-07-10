import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  clientMetadata,
  pushError,
  pushJson,
  readSmallJson,
  requirePushUser,
  requireSameOrigin,
} from "@/app/api/push/_utils";
import { PUSH_ERROR_CODES, validateSerializedSubscription } from "@/lib/push-utils";

// POST  /api/push/subscribe  — save a new push subscription
// DELETE /api/push/subscribe  — legacy alias for /api/push/unsubscribe
export async function POST(req: NextRequest) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;

  const auth = await requirePushUser();
  if (auth instanceof NextResponse) return auth;

  const body = await readSmallJson(req);
  if (body instanceof NextResponse) return body;

  const parsed = validateSerializedSubscription(body);
  if (!parsed.ok || !parsed.data) {
    return pushError(parsed.error ?? "Invalid subscription.", 400, parsed.code ?? PUSH_ERROR_CODES.INVALID_SUBSCRIPTION);
  }

  const db = createServiceClient();
  const meta = clientMetadata(req);
  const now = new Date().toISOString();
  const { error } = await db.from("push_subscriptions").upsert({
    user_id: auth.user.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth_key: parsed.data.keys.auth,
    enabled: true,
    platform: meta.platform,
    browser: meta.browser,
    user_agent: meta.userAgent,
    last_seen_at: now,
    updated_at: now,
  }, { onConflict: "endpoint" });

  if (error) {
    return pushError("Could not save subscription.", 500, PUSH_ERROR_CODES.SUBSCRIPTION_SYNC_FAILED);
  }

  return pushJson({ ok: true, subscribed: true });
}

export async function DELETE(req: NextRequest) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;

  const auth = await requirePushUser();
  if (auth instanceof NextResponse) return auth;

  const body = await readSmallJson(req);
  if (body instanceof NextResponse) return body;

  const parsed = validateSerializedSubscription(body);
  const endpointFromBody =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).endpoint
      : null;
  const endpoint =
    parsed.ok && parsed.data
      ? parsed.data.endpoint
      : typeof endpointFromBody === "string"
        ? endpointFromBody
        : null;
  if (!endpoint) {
    return pushError("Missing endpoint.", 400, PUSH_ERROR_CODES.INVALID_SUBSCRIPTION);
  }

  const db = createServiceClient();
  await db
    .from("push_subscriptions")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("endpoint", endpoint)
    .eq("user_id", auth.user.id);

  return pushJson({ ok: true, subscribed: false });
}
