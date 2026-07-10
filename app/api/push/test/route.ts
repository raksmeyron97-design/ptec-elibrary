import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  pushError,
  pushJson,
  readSmallJson,
  requirePushUser,
  requireSameOrigin,
} from "@/app/api/push/_utils";
import { rateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-log";
import { sendPush } from "@/lib/push";
import { PUSH_ERROR_CODES } from "@/lib/push-utils";

type PushSubRow = {
  endpoint: string;
  p256dh: string;
  auth_key: string;
  failure_count: number | null;
};

export async function POST(req: NextRequest) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;

  const auth = await requirePushUser();
  if (auth instanceof NextResponse) return auth;

  const limited = await rateLimit(`push-test:${auth.user.id}`, 3, 10 * 60_000);
  if (!limited.success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/push/test", userId: auth.user.id });
    return pushError("Too many test notifications. Try again later.", 429, PUSH_ERROR_CODES.RATE_LIMITED);
  }

  const body = await readSmallJson(req);
  if (body instanceof NextResponse) return body;

  const endpoint =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).endpoint
      : null;

  const db = createServiceClient();
  let query = db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key, failure_count")
    .eq("user_id", auth.user.id)
    .eq("enabled", true);

  if (typeof endpoint === "string" && endpoint.trim()) {
    query = query.eq("endpoint", endpoint.trim());
  }

  const { data: subs, error } = await query;
  if (error) {
    return pushError("Could not load subscriptions.", 500, PUSH_ERROR_CODES.PUSH_SEND_FAILED);
  }

  const rows = (subs ?? []) as PushSubRow[];
  if (rows.length === 0) {
    return pushError("No active subscription found for this device.", 404, PUSH_ERROR_CODES.INVALID_SUBSCRIPTION);
  }

  const now = new Date().toISOString();
  let sent = 0;
  let expired = 0;
  let failed = 0;

  await Promise.allSettled(
    rows.map(async (sub) => {
      const result = await sendPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        {
          type: "TEST",
          title: "PTEC Library notifications are on",
          body: "You will receive updates when new books and announcements are published.",
          url: "/dashboard/settings",
          tag: `push-test-${auth.user.id}`,
          eventId: `push-test-${auth.user.id}-${Date.now()}`,
        },
      );

      if (result.ok) {
        sent += 1;
        await db
          .from("push_subscriptions")
          .update({ last_success_at: now, failure_count: 0 })
          .eq("endpoint", sub.endpoint)
          .eq("user_id", auth.user.id);
        return;
      }

      const nextFailureCount = (sub.failure_count ?? 0) + 1;
      if (result.expired) {
        expired += 1;
        await db
          .from("push_subscriptions")
          .update({ enabled: false, last_failure_at: now, failure_count: nextFailureCount })
          .eq("endpoint", sub.endpoint)
          .eq("user_id", auth.user.id);
        return;
      }

      failed += 1;
      await db
        .from("push_subscriptions")
        .update({ last_failure_at: now, failure_count: nextFailureCount })
        .eq("endpoint", sub.endpoint)
        .eq("user_id", auth.user.id);
    }),
  );

  if (sent === 0) {
    return pushError(
      expired > 0 ? "This subscription expired. Repair notifications and try again." : "Could not send a test notification.",
      502,
      PUSH_ERROR_CODES.PUSH_SEND_FAILED,
    );
  }

  return pushJson({ ok: true, sent, expired, failed });
}
