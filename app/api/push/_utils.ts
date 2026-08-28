import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { PUSH_ERROR_CODES, type PushErrorCode } from "@/lib/push-utils";
import { PRODUCTION_SITE_HOST } from "@/lib/seo/production-origin";

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
 * Why not `new URL(origin).origin === req.nextUrl.origin`:
 *   Behind Cloudflare Tunnel / Nginx the app runs over plain HTTP internally
 *   while the browser sends `Origin: https://…`. The protocol mismatch makes
 *   the strict string comparison always fail, producing the "Invalid origin /
 *   UNAUTHORIZED" error the user sees on the profile page.
 *
 * Resolution order (first match wins):
 *   1. x-forwarded-host header (set by the proxy) matches the request origin host.
 *   2. The plain `host` header matches.
 *   3. The origin hostname is the canonical production domain.
 *   4. The origin hostname matches NEXT_PUBLIC_SITE_URL (custom deployment).
 *   5. Development: localhost / 127.0.0.1 / *.local are always allowed.
 */
export function requireSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;

  let originHostname: string;
  try {
    originHostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return pushError("Invalid origin.", 403, PUSH_ERROR_CODES.UNAUTHORIZED);
  }

  // Build the set of allowed hostnames for this deployment.
  const allowed = new Set<string>([PRODUCTION_SITE_HOST.toLowerCase()]);

  // Any host explicitly configured via the site URL env var.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      const h = new URL(
        /^[a-z][a-z0-9+.-]*:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`,
      ).hostname.toLowerCase();
      if (h) allowed.add(h);
    } catch {
      // malformed env — ignore, fall through to other checks
    }
  }

  // Check the effective public host the proxy is serving (preferred).
  const forwardedHost = (
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? ""
  )
    .split(",")[0]  // x-forwarded-host can be a comma list; take the first
    .trim()
    .split(":")[0]  // strip any port
    .toLowerCase();

  if (forwardedHost && originHostname === forwardedHost) return null;

  // Match against the explicit allow-list (canonical domain + site URL).
  if (allowed.has(originHostname)) return null;

  // Development convenience: allow localhost variants without env configuration.
  if (process.env.NODE_ENV !== "production") {
    if (
      originHostname === "localhost" ||
      originHostname === "127.0.0.1" ||
      originHostname.endsWith(".local") ||
      originHostname.endsWith(".localhost")
    ) {
      return null;
    }
  }

  return pushError("Invalid origin.", 403, PUSH_ERROR_CODES.UNAUTHORIZED);
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
