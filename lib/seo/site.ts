import { isIndexableEnvironment } from "@/lib/seo/indexing";

/**
 * Canonical production origin. Used as the fallback whenever
 * NEXT_PUBLIC_SITE_URL is unset or fails validation — canonical URLs,
 * hreflang alternates, JSON-LD ids, and sitemap entries must never point at
 * localhost, a malformed value, or a typo'd domain.
 */
export const PRODUCTION_SITE_URL = "https://library.ptec.edu.kh";

/**
 * The Khmer short wordmark, exactly as the navbar prints it.
 *
 * The site's IDENTITY lives in published System Settings (`libraryName`,
 * `seo.siteName`) and this is deliberately not a second copy of it: settings
 * hold the long Khmer form ("បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ"), while
 * this is the abbreviation that actually appears in the header lockup. It was
 * a bare literal inside Navbar.tsx; it lives here so the wordmark and the
 * JSON-LD `alternateName` cannot drift apart.
 */
export const BRAND_NAME_KM_SHORT = "បណ្ណាល័យ វ.គ.ភ";

/**
 * Other names this library is referred to by, for entity reconciliation.
 *
 * Google's site-names feature reads `WebSite.name` and cross-checks it against
 * og:site_name; `alternateName` is where the forms that are NOT the canonical
 * name belong. Two of them matter here:
 *   • the Khmer wordmark, which is what Khmer readers and inbound Khmer links
 *     call the site
 *   • "PTEC Digital Library", the retired variant — years of existing links and
 *     references use it, and listing it lets Google reconcile them with the
 *     current name rather than treating them as a separate entity
 */
export const BRAND_ALTERNATE_NAMES = [BRAND_NAME_KM_SHORT, "PTEC Digital Library"] as const;

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  );
}

/**
 * Normalize + validate a configured site URL down to a bare origin:
 * - scheme defaults to https:// when missing; only http(s) is accepted
 * - any path/query/hash is dropped (origins only — no trailing slash)
 * - unparseable values fall back to the production origin
 * - loopback hosts are rejected in indexable (production) environments so a
 *   leaked local .env can never emit localhost canonicals to crawlers
 */
export function normalizeSiteUrl(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return PRODUCTION_SITE_URL;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return PRODUCTION_SITE_URL;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return PRODUCTION_SITE_URL;
  }
  if (isLoopbackHost(parsed.hostname) && isIndexableEnvironment()) {
    return PRODUCTION_SITE_URL;
  }
  return parsed.origin;
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

/**
 * Absolute URL for a site path. The homepage is `${SITE_URL}/` (the only
 * path where the trailing slash is canonical); everything else joins with a
 * single slash and no trailing slash.
 */
export function absoluteUrl(path = "/"): string {
  if (!path || path === "/") return `${SITE_URL}/`;
  return path.startsWith("/") ? `${SITE_URL}${path}` : `${SITE_URL}/${path}`;
}

// NOTE: the institution / library names used to live here as two exported
// constants. They were a second source of truth that publishing in
// /admin/system-settings could not reach (and had already drifted apart from
// each other). They now come from the published settings — resolve them with
// `await getOrgIdentity()` from lib/system-settings/config.ts and pass the
// result into the builder you are calling. See lib/system-settings/org-identity.ts.
