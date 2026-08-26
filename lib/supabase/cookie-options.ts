import type { CookieOptions } from "@supabase/ssr";

/**
 * Cookie options for every Supabase auth client in the app — the browser
 * client, the server client, and the one middleware builds to refresh a
 * session. They must agree: all three write the same cookie names, so a
 * mismatch means whichever wrote last decides the flags.
 *
 * @supabase/ssr's defaults are `{ path: "/", sameSite: "lax", httpOnly: false,
 * maxAge: 400d }` — note the absence of `secure`. On Vercel that was invisible
 * because nothing ever reached the app over plain http. It is not invisible
 * now: production terminates TLS at Cloudflare and reaches the container over
 * http on the private Docker network, and the same container is also reachable
 * on the LAN at http://10.1.1.146:13000 for debugging. A session cookie
 * without `Secure` is one that a browser is willing to put on a plain-http
 * request, which is the whole class of leak HSTS exists to prevent — belt and
 * suspenders, not either alone.
 *
 * Development stays non-secure so http://localhost:3000 can still log in.
 *
 * `sameSite: "lax"` is load-bearing and deliberately unchanged: the Google
 * OAuth flow returns to /auth/callback as a top-level cross-site navigation,
 * and "strict" would withhold the cookies on exactly that request.
 */
export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};
