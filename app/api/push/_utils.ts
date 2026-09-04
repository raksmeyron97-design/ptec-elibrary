import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { PUSH_ERROR_CODES, type PushErrorCode } from "@/lib/push-utils";
import { isSameOriginRequest } from "@/lib/http/same-origin";

const MAX_JSON_BYTES = 8192;

export type PushRouteUser = {
  user: User;
};

export function pushJson(
  body: Record<string, unknown>,
  init?: ResponseInit,
) {
  return NextResponse.json(body, init);
}

export function pushError(
  error: string,
  status: number,
  code: PushErrorCode,
) {
  return pushJson({ ok: false, error, code }, { status });
}

export async function requirePushUser(): Promise<PushRouteUser | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return pushError("Authentication required.", 401, PUSH_ERROR_CODES.UNAUTHORIZED);
  }

  return { user };
}

/**
 * CSRF origin guard for push API routes.
 *
 * The host-resolution rules live in `lib/http/same-origin.ts` because the
 * reader's progress endpoint needs exactly the same ones (in particular the
 * Cloudflare-Tunnel protocol mismatch this had to learn about the hard way).
 * This wrapper only adds the push-shaped error body.
 */
export function requireSameOrigin(req: NextRequest): NextResponse | null {
  return isSameOriginRequest(req)
    ? null
    : pushError("Invalid origin.", 403, PUSH_ERROR_CODES.UNAUTHORIZED);
}

export async function readSmallJson(req: NextRequest): Promise<unknown | NextResponse> {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_JSON_BYTES) {
    return pushError("Payload too large.", 413, PUSH_ERROR_CODES.INVALID_SUBSCRIPTION);
  }

  try {
    return await req.json();
  } catch {
    return pushError("Invalid JSON.", 400, PUSH_ERROR_CODES.INVALID_SUBSCRIPTION);
  }
}

export function clientMetadata(req: NextRequest): {
  platform: string | null;
  browser: string | null;
  userAgent: string | null;
} {
  const userAgent = req.headers.get("user-agent");
  const platformHint = req.headers.get("sec-ch-ua-platform")?.replaceAll('"', "") ?? null;
  const browserHint = req.headers.get("sec-ch-ua") ?? null;

  let browser: string | null = browserHint;
  if (!browser && userAgent) {
    if (/Edg\//.test(userAgent)) browser = "Edge";
    else if (/Chrome\//.test(userAgent)) browser = "Chrome";
    else if (/Safari\//.test(userAgent)) browser = "Safari";
    else if (/Firefox\//.test(userAgent)) browser = "Firefox";
  }

  return {
    platform: platformHint?.slice(0, 80) ?? null,
    browser: browser?.slice(0, 160) ?? null,
    userAgent: userAgent?.slice(0, 500) ?? null,
  };
}
