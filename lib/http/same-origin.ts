import type { NextRequest } from "next/server";
import { PRODUCTION_SITE_HOST } from "@/lib/seo/production-origin";

/**
 * CSRF origin guard for state-changing route handlers.
 *
 * Server Actions carry their own origin check; a plain route handler does not,
 * so every POST/PUT/DELETE handler that writes on behalf of the session has to
 * make this check itself.
 *
 * Why not `new URL(origin).origin === req.nextUrl.origin`:
 *   Behind Cloudflare Tunnel / Nginx the app runs over plain HTTP internally
 *   while the browser sends `Origin: https://…`. The protocol mismatch makes
 *   the strict string comparison always fail, which is how the push routes
 *   once rejected every legitimate request from the profile page.
 *
 * Resolution order (first match wins):
 *   1. x-forwarded-host header (set by the proxy) matches the request origin host.
 *   2. The plain `host` header matches.
 *   3. The origin hostname is the canonical production domain.
 *   4. The origin hostname matches NEXT_PUBLIC_SITE_URL (custom deployment).
 *   5. Development: localhost / 127.0.0.1 / *.local are always allowed.
 *
 * A request with NO `Origin` header is allowed: browsers omit it on same-origin
 * GET/HEAD, and non-browser callers (curl, a health probe) are authenticated by
 * session cookie anyway. Browsers DO send it on cross-origin POST, which is the
 * case this exists to refuse.
 */
export function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  let originHostname: string;
  try {
    originHostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
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
    .split(",")[0] // x-forwarded-host can be a comma list; take the first
    .trim()
    .split(":")[0] // strip any port
    .toLowerCase();

  if (forwardedHost && originHostname === forwardedHost) return true;

  // Match against the explicit allow-list (canonical domain + site URL).
  if (allowed.has(originHostname)) return true;

  // Development convenience: allow localhost variants without env configuration.
  if (process.env.NODE_ENV !== "production") {
    if (
      originHostname === "localhost" ||
      originHostname === "127.0.0.1" ||
      originHostname.endsWith(".local") ||
      originHostname.endsWith(".localhost")
    ) {
      return true;
    }
  }

  return false;
}
