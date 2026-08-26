import { canonicalOrigin } from "@/lib/site-origin";

/**
 * Absolute URL to hand Supabase Auth as `redirectTo` / `emailRedirectTo`.
 *
 * These values are (a) matched against Supabase's redirect allow-list and
 * (b) baked into the verification/reset links that get emailed to students.
 * Both make the origin load-bearing, and `location.origin` is the wrong
 * source for it now that production sits behind Cloudflare Tunnel: a visitor
 * who arrives on the tunnel's fallback hostname (library.storage-ptec.online)
 * would generate a callback URL on that host, so Supabase would reject it —
 * or, once allow-listed, mail out links pointing away from the college's
 * domain and land the user on an origin that does not hold their session.
 *
 * In production this is always the canonical origin. In development it
 * follows the browser, so localhost and LAN testing keep working.
 *
 * @param path internal path, leading slash included (query string allowed).
 */
export function authRedirect(path: string): string {
  const origin = canonicalOrigin(
    typeof window === "undefined" ? null : window.location.origin,
  );
  return path.startsWith("/") ? `${origin}${path}` : `${origin}/${path}`;
}
