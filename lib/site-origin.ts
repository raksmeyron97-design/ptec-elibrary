import { SITE_URL } from "@/lib/seo/site";

/**
 * The origin that server-issued redirects and auth callback URLs must use.
 *
 * ── Why not just use the request's own origin ─────────────────────────────
 * Production is a Docker container reached only through Cloudflare Tunnel, and
 * the app can legitimately see three different origins for the same request:
 *
 *   https://library.ptec.edu.kh        the canonical public domain
 *   https://library.storage-ptec.online the tunnel's fallback hostname, which
 *                                      resolves the very same container
 *   http://10.1.1.146:13000            the LAN address / the container's own
 *                                      http origin when a forwarded header is
 *                                      missing or a proxy hop is misconfigured
 *
 * `new URL(request.url).origin` returns whichever of those the caller happened
 * to arrive on. For an OAuth or email-verification callback that is not a
 * cosmetic difference: the user finishes sign-in on a *different* origin from
 * the one holding their Supabase session cookies, so they land logged out —
 * and on plain http the browser refuses to keep Secure cookies at all. It also
 * means a link mailed from the app can point a student at an origin that is
 * not the college's domain.
 *
 * So in production the canonical origin wins unconditionally. It is the same
 * value that must already be on Supabase's redirect allow-list, so anything
 * that disagrees with it would have been rejected there anyway.
 *
 * In development the request's own origin is honoured, so http://localhost:3000
 * and a LAN address both keep working without touching env vars.
 */
export function canonicalOrigin(requestUrl?: string | URL | null): string {
  if (process.env.NODE_ENV === "production") return SITE_URL;
  if (!requestUrl) return SITE_URL;
  try {
    return new URL(requestUrl).origin;
  } catch {
    return SITE_URL;
  }
}

/**
 * Absolute URL on {@link canonicalOrigin} for an internal path.
 * `path` must already be a validated internal path (see `safeReturnTo`).
 */
export function canonicalRedirectUrl(
  path: string,
  requestUrl?: string | URL | null,
): string {
  const origin = canonicalOrigin(requestUrl);
  if (!path) return `${origin}/`;
  return path.startsWith("/") ? `${origin}${path}` : `${origin}/${path}`;
}
