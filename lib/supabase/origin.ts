/**
 * The ONE place that knows where Supabase is.
 *
 * Pure and dependency-free on purpose: imported by lib/csp.ts (edge), by the
 * service worker (app/sw.ts, bundled separately by Serwist), by the server
 * client factories and by the unit tests. Nothing here may throw — a missing
 * or malformed NEXT_PUBLIC_SUPABASE_URL must degrade to "no origin", never take
 * the middleware or the worker down with it.
 *
 * Two URLs, deliberately distinct (docs/SELF_HOSTED_SUPABASE_MIGRATION_AUDIT.md §1):
 *
 *   NEXT_PUBLIC_SUPABASE_URL  what the BROWSER reaches — compiled into the client
 *                             bundle, so it must resolve from the public Internet
 *                             (https://supabase.storage-ptec.online through the
 *                             tunnel, or https://<ref>.supabase.co on Cloud).
 *   SUPABASE_INTERNAL_URL     optional, server-only — what THIS PROCESS should
 *                             call instead. On the ZimaOS box that is
 *                             http://kong:8000 over the private Docker network,
 *                             so every PostgREST/GoTrue call the server makes
 *                             skips Cloudflare → tunnel → back into the same box.
 *                             Unset, the public URL is used and behaviour is
 *                             exactly what it was on Cloud.
 *
 * JWTs are not affected by which URL the server uses: GoTrue signs with the
 * shared secret and stamps `iss` from its own API_EXTERNAL_URL, and PostgREST
 * verifies the signature only.
 */

export type SupabaseOrigins = {
  /** e.g. "https://supabase.storage-ptec.online" */
  http: string;
  /** Same host, ws(s) scheme — Realtime's websocket origin for connect-src. */
  ws: string;
  /** Bare hostname, for host-based matching (service worker). */
  host: string;
};

/** Parse a Supabase URL into the origins the CSP and the worker need, or null. */
export function supabaseOrigins(
  raw: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): SupabaseOrigins | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const ws = url.protocol === "https:" ? "wss:" : "ws:";
    return { http: url.origin, ws: `${ws}//${url.host}`, host: url.hostname };
  } catch {
    return null;
  }
}

/**
 * URL for server-side Supabase clients: the internal override when set,
 * otherwise the public URL. Client-side code must keep reading
 * NEXT_PUBLIC_SUPABASE_URL directly — the internal address is meaningless (and
 * unreachable) from a browser.
 */
export function serverSupabaseUrl(): string {
  return (
    process.env.SUPABASE_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  );
}

/**
 * True when `hostname` is the configured Supabase host, or — while nothing is
 * configured, or during the migration window — a Supabase Cloud host. The
 * legacy suffix stays until the Cloud project is retired.
 */
export function isSupabaseHost(hostname: string, configured: string | null | undefined): boolean {
  if (configured && hostname === configured) return true;
  return hostname.endsWith(".supabase.co");
}

/**
 * The auth cookie's name, derived from the PUBLIC URL only.
 *
 * @supabase/ssr defaults the name to `sb-<first hostname label>-auth-token` of
 * whatever URL each client was built with. The browser client is built with
 * NEXT_PUBLIC_SUPABASE_URL and the server clients with SUPABASE_INTERNAL_URL
 * when it is set — so on the box the browser wrote `sb-supabase-auth-token`
 * while the server looked for `sb-kong-auth-token`, every server-side
 * `getUser()` saw no session, and MFA enrolment failed with "missing sub
 * claim". Naming the cookie from the public URL on every client makes the
 * internal URL what it was meant to be: a transport detail. Deriving rather
 * than hard-coding keeps local and CI stacks (ref "127") and Cloud (ref
 * "<project>") on the same rule, which e2e/utils/auth.ts also relies on.
 */
export function authCookieName(
  publicUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string {
  let ref = "supabase";
  try {
    const host = new URL(publicUrl ?? "").hostname;
    ref = host.split(".")[0] || ref;
  } catch {
    // no/malformed URL: a stable fallback beats a throw here (see file header)
  }
  return `sb-${ref}-auth-token`;
}

