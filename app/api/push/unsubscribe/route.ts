import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  pushError,
  pushJson,
  readSmallJson,
  requirePushUser,
  requireSameOrigin,
} from "@/app/api/push/_utils";
import { PUSH_ERROR_CODES } from "@/lib/push-utils";

export async function DELETE(req: NextRequest) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;

  const auth = await requirePushUser();
  if (auth instanceof NextResponse) return auth;

  const body = await readSmallJson(req);
  if (body instanceof NextResponse) return body;

  const endpoint =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).endpoint
      : null;
  if (typeof endpoint !== "string" || !endpoint.trim()) {
    return pushError("Missing endpoint.", 400, PUSH_ERROR_CODES.INVALID_SUBSCRIPTION);
  }

  const db = createServiceClient();
  await db
    .from("push_subscriptions")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("endpoint", endpoint.trim())
    .eq("user_id", auth.user.id);

  return pushJson({ ok: true, subscribed: false });
}
