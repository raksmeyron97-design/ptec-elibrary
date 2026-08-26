import { PRODUCTION_SITE_HOST } from "@/lib/seo/production-origin";

/**
 * Should this request be sent to the canonical host?
 *
 * The tunnel publishes the app on more than one public hostname — the
 * canonical `library.ptec.edu.kh` and the fallback `library.storage-ptec.online`
 * that the connector itself is configured with — and both resolve the very
 * same container. Left alone that is three separate problems:
 *
 *   - session: cookies set on one host are not sent to the other, so a
 *     student who starts on the fallback host and is redirected to a
 *     canonical URL (or vice versa) appears logged out;
 *   - SEO: two hostnames serving identical content compete for the same
 *     pages, and the fallback one carries the wrong brand;
 *   - support: a link copied from the fallback host and shared with a class
 *     keeps working until it doesn't.
 *
 * A 308 at the edge of the app collapses all three. It is deliberately narrow:
 *
 *   - production only — dev servers keep whatever host they are given;
 *   - named hosts only — an IP or a bare/.local name is LAN or container
 *     debugging (including the Dockerfile's own HEALTHCHECK against
 *     127.0.0.1) and must NOT be bounced to the public domain;
 *   - never when the canonical host is unknown, so a missing/garbled
 *     NEXT_PUBLIC_SITE_URL degrades to "serve normally" rather than to a
 *     redirect loop or an outage.
 *
 * `CANONICAL_HOST_REDIRECT=off` disables it — the escape hatch for a DNS
 * cutover window where the canonical name is not yet resolving.
 */

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function isDebugHost(hostname: string): boolean {
  return (
    IPV4_RE.test(hostname) ||
    hostname.startsWith("[") || // bracketed IPv6
    !hostname.includes(".") || // "localhost", a bare container name
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal")
  );
}

/**
 * @param host  the request's Host header (may include a port)
 * @returns the canonical hostname to redirect to, or null to serve as-is
 */
export function canonicalHostRedirect(
  host: string | null | undefined,
  env: {
    nodeEnv?: string;
    siteUrl?: string;
    disabled?: string;
  } = {},
): string | null {
  const nodeEnv = env.nodeEnv ?? process.env.NODE_ENV;
  if (nodeEnv !== "production") return null;

  const disabled = (env.disabled ?? process.env.CANONICAL_HOST_REDIRECT ?? "")
    .trim()
    .toLowerCase();
  if (disabled === "off" || disabled === "false" || disabled === "0") return null;

  const raw = host?.trim();
  if (!raw) return null;
  // Strip the port; leave a bracketed IPv6 literal recognisable as a debug host.
  const hostname = (raw.startsWith("[") ? raw : (raw.split(":")[0] ?? raw)).toLowerCase();
  if (!hostname || isDebugHost(hostname)) return null;

  const siteUrl = env.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL;
  let canonical = PRODUCTION_SITE_HOST;
  if (siteUrl?.trim()) {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(siteUrl.trim())
      ? siteUrl.trim()
      : `https://${siteUrl.trim()}`;
    try {
      const parsed = new URL(candidate).hostname.toLowerCase();
      if (isDebugHost(parsed)) return null; // site URL points somewhere local
      canonical = parsed;
    } catch {
      return null;
    }
  }

  return hostname === canonical ? null : canonical;
}
