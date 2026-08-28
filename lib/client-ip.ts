/**
 * Client IP resolution — one implementation for the whole app.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * Production now runs as a Docker container on ZimaOS, reached only through
 * Cloudflare → cloudflared (Tunnel) → the private Docker network. That path
 * changes which headers carry the visitor's address, and getting it wrong is
 * not a cosmetic bug: every rate limit, quota and abuse counter is keyed on
 * this value, so collapsing all traffic onto the Docker gateway address
 * (172.17.0.1 / 10.1.1.x) would put the entire internet in ONE bucket — the
 * first ten visitors of the minute would 429 everyone else.
 *
 * ── Header precedence, and why ────────────────────────────────────────────
 * 1. `cf-connecting-ip` — written by the Cloudflare edge on every proxied
 *    request and *overwritten* if the client sends it, so it is both always
 *    present on this deployment and unspoofable. cloudflared passes it
 *    through untouched. This is the authoritative source here.
 * 2. `true-client-ip`   — the Cloudflare Enterprise / Akamai spelling of the
 *    same thing; harmless to accept as a second choice.
 * 3. `x-real-ip`        — what Vercel and a classic nginx front-end set. Kept
 *    so the app still behaves correctly if it is ever put back behind one.
 *    NOTE: cloudflared does NOT set this, which is exactly why the previous
 *    "x-real-ip first, else x-forwarded-for" code degraded after the move.
 * 4. `x-forwarded-for`  — last resort. Read RIGHT-to-LEFT (the right-most
 *    entry is appended by the closest trusted hop; the left-most is
 *    client-controlled and must never gate a rate limit) and skipping
 *    private/loopback hops, which is how the Docker gateway gets excluded.
 *
 * If nothing public survives, the right-most raw forwarded value is returned
 * so local development still keys on 127.0.0.1 rather than lumping every
 * developer request into "unknown".
 */

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Loopback, link-local, RFC1918, CGNAT, and the IPv6 equivalents. */
export function isPrivateAddress(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  if (!value) return true;

  // Strip an IPv6 bracket/port form ("[::1]:443") and an IPv4 "host:port".
  const unbracketed = value.startsWith("[") ? value.slice(1, value.indexOf("]")) : value;
  const host = IPV4_RE.test(unbracketed.split(":")[0] ?? "")
    ? (unbracketed.split(":")[0] as string)
    : unbracketed;

  if (host === "unknown" || host === "::" || host === "::1" || host === "localhost") return true;
  // IPv4-mapped IPv6 ("::ffff:10.0.0.1") — classify by the embedded v4 address.
  const mapped = host.startsWith("::ffff:") ? host.slice(7) : host;

  const m = IPV4_RE.exec(mapped);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if ([a, Number(m[2]), Number(m[3]), Number(m[4])].some((n) => Number.isNaN(n) || n > 255)) {
      return true;
    }
    if (a === 10 || a === 127 || a === 0) return true;            // private / loopback / this-host
    if (a === 172 && b >= 16 && b <= 31) return true;             // Docker's default bridge lives here
    if (a === 192 && b === 168) return true;                      // the LAN the ZimaOS box sits on
    if (a === 169 && b === 254) return true;                      // link-local
    if (a === 100 && b >= 64 && b <= 127) return true;            // CGNAT
    return false;
  }

  // IPv6: unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(mapped)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(mapped)) return true;
  return false;
}

type HeaderLike = { get(name: string): string | null };

function forwardedForEntries(headers: HeaderLike): string[] {
  const xff = headers.get("x-forwarded-for");
  if (!xff) return [];
  // One pass, not .map().filter() — this runs on every rate-limited request.
  const entries: string[] = [];
  for (const part of xff.split(",")) {
    const trimmed = part.trim();
    if (trimmed) entries.push(trimmed);
  }
  return entries;
}

/**
 * The visitor's IP, or `null` when no usable value is present.
 * Prefer {@link clientIp} at call sites that want a rate-limit key.
 */
export function getClientIp(headers: HeaderLike): string | null {
  for (const header of ["cf-connecting-ip", "true-client-ip", "x-real-ip"]) {
    const value = headers.get(header)?.trim();
    if (value && !isPrivateAddress(value)) return value;
  }

  const entries = forwardedForEntries(headers);
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as string;
    if (!isPrivateAddress(entry)) return entry;
  }

  // Nothing public. Fall back to the closest hop verbatim (local dev, LAN
  // debugging) rather than throwing every caller into a shared bucket.
  return entries.length ? (entries[entries.length - 1] as string) : null;
}

/** The visitor's IP, or the string "unknown" — the shape most call sites want. */
export function clientIp(headers: HeaderLike): string {
  return getClientIp(headers) ?? "unknown";
}

/** The visitor's IP, or `undefined` — for optional audit/log fields. */
export function clientIpOrUndefined(headers: HeaderLike): string | undefined {
  return getClientIp(headers) ?? undefined;
}
