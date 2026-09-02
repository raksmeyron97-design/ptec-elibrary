import type { Metadata } from "next";
// Relative, NOT "@/...": next.config.ts imports this module directly and path
// aliases are not resolved inside it (see the note at the top of that file).
import { PRODUCTION_SITE_HOST } from "./production-origin";

/**
 * Environment-aware indexing policy — the single decision point for whether
 * this deployment may be indexed by search engines. Consumed by:
 *   - middleware.ts            → X-Robots-Tag response header
 *   - next.config.ts           → build-level X-Robots-Tag on static assets
 *   - app/robots.ts            → crawl rules + sitemap reference
 *   - app/sitemap.ts           → empty sitemap off-production
 *   - app/root-metadata.ts     → <meta name="robots"> baseline
 *
 * Indexing is OPT-IN. A deployment is indexable when it is one of:
 *   - a real Vercel production deployment, or
 *   - the self-hosted production container: NODE_ENV=production AND
 *     NEXT_PUBLIC_SITE_URL pointing at the canonical public origin
 *     (https://library.ptec.edu.kh), or
 *   - anything with an explicit SEO_INDEXING=on.
 * Previews, branch deploys, local dev, CI, and staging hostnames (including
 * the tunnel's fallback origin on *.storage-ptec.online) all default to
 * noindex — demo/testing content must never leak into search results, and the
 * fallback origin must never compete with the canonical one.
 *
 * The self-hosted clause exists because production moved off Vercel to a
 * Docker container on ZimaOS behind Cloudflare Tunnel: VERCEL_ENV is simply
 * absent there, so the old rule left the live site noindex unless someone
 * remembered SEO_INDEXING=on. The site URL is a signal that is already
 * required to be correct (canonicals, sitemap, OAuth redirects all read it),
 * so tying indexability to it cannot drift on its own.
 *
 * SEO_INDEXING (server-only env var) still overrides both directions:
 *   "on"  — force indexable  (staging hostname, CI e2e asserting production
 *            behavior)
 *   "off" — force noindex    (emergency kill switch, works even on prod)
 *   unset — the platform/site-URL rules above decide
 *
 * A second, admin-managed kill switch lives in system settings
 * (seo.indexingEnabled) and is applied by the rendered layer on top of this
 * environment gate — see app/[locale]/layout.tsx, app/robots.ts.
 */

export type SeoEnvironment = "production" | "preview" | "development" | "test";

export function seoEnvironment(): SeoEnvironment {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return "test";
  switch (process.env.VERCEL_ENV) {
    case "production":
      return "production";
    case "preview":
      return "preview";
    case "development":
      return "development";
  }
  // No platform signal (bare `next build && next start`, CI, self-hosted).
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

/**
 * True when NEXT_PUBLIC_SITE_URL names the canonical public origin. Parsed
 * rather than string-compared so a trailing slash, an added path, or a
 * missing scheme cannot silently flip the site to noindex.
 *
 * Deliberately host-only: the tunnel's fallback origin
 * (library.storage-ptec.online) and any LAN/IP access are NOT the canonical
 * site and must not be indexed.
 */
function isCanonicalSiteUrl(): boolean {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return false;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(candidate).hostname.toLowerCase() === PRODUCTION_SITE_HOST;
  } catch {
    return false;
  }
}

export function isIndexableEnvironment(): boolean {
  const override = (process.env.SEO_INDEXING ?? "").trim().toLowerCase();
  if (override === "on" || override === "true" || override === "1") return true;
  if (override === "off" || override === "false" || override === "0") return false;
  if (process.env.NODE_ENV !== "production") return false;
  // Vercel production, or the self-hosted container serving the canonical
  // origin. Both require NODE_ENV=production, so a dev server pointed at the
  // production URL stays noindex.
  return process.env.VERCEL_ENV === "production" || isCanonicalSiteUrl();
}

/** Header value for blanket non-production noindex (belt — metadata is the
 *  suspenders). Also used by next.config.ts so static files (PDFs, images)
 *  that middleware never sees are covered on non-production deployments. */
export const NOINDEX_HEADER_VALUE = "noindex, nofollow, noarchive, nosnippet";

/** Header value for private surfaces (/admin, /auth, /api, account pages) —
 *  applied in every environment, production included. */
export const PRIVATE_SURFACE_HEADER_VALUE = "noindex, nofollow";

/** Metadata robots for pages that must never be indexed (any environment). */
export const NOINDEX_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  noarchive: true,
  nosnippet: true,
};

/**
 * Baseline robots metadata for public pages: indexable only when both the
 * environment gate and the admin kill switch allow it. Pages layer their own
 * refinements (e.g. filtered listings are noindex,follow) on top.
 */
export function defaultRobots(opts?: { indexingEnabled?: boolean }): NonNullable<Metadata["robots"]> {
  const adminEnabled = opts?.indexingEnabled ?? true;
  if (isIndexableEnvironment() && adminEnabled) {
    return { index: true, follow: true };
  }
  return NOINDEX_ROBOTS;
}

/**
 * Locale-stripped path prefixes that are private surfaces: never indexable,
 * excluded from the sitemap, disallowed in robots.txt, and served with an
 * X-Robots-Tag by middleware. `/search` is deliberately NOT here — internal
 * search results are `noindex, follow` at the metadata level but stay
 * crawlable so link equity flows through them.
 */
export const PRIVATE_PATH_PREFIXES = [
  "/admin",
  "/auth",
  "/api",
  "/dashboard",
  "/profile",
  "/lists",
  "/offline-books",
  "/offline-reader",
] as const;

export function isPrivateSurfacePath(localeStrippedPath: string): boolean {
  return PRIVATE_PATH_PREFIXES.some(
    (prefix) =>
      localeStrippedPath === prefix || localeStrippedPath.startsWith(`${prefix}/`),
  );
}

/**
 * Locale prefixes that appear in real URLs. English is unprefixed
 * (`localePrefix: "as-needed"` in i18n/routing.ts), so only Khmer contributes
 * a prefix.
 *
 * Hard-coded rather than imported from i18n/routing.ts on purpose: this module
 * is imported by next.config.ts through a RELATIVE path, and everything it
 * pulls in is loaded by the Next config transpiler — which must not be made to
 * resolve next-intl. lib/seo/indexing.test.ts pins this list against
 * `routing.locales` so the two cannot drift.
 */
export const URL_LOCALE_PREFIXES = ["/km"] as const;

/**
 * Every private path prefix, locale-stripped — the same list the runtime
 * `X-Robots-Tag` and the metadata robots decide from.
 *
 * This is the ONE source of truth brief §7 asks for. `app/robots.ts` used to
 * hand-maintain a second copy, and the two had already drifted: robots.txt
 * disallowed a `/login` route that does not exist while omitting the Khmer
 * `/km/auth` and `/km/admin` prefixes entirely.
 */
export function getPrivateSeoPaths(): string[] {
  return [...PRIVATE_PATH_PREFIXES];
}

/**
 * `getPrivateSeoPaths()` expanded across every locale prefix, formatted as
 * robots.txt `Disallow` values.
 *
 * Both the bare prefix and its trailing-slash form are emitted: the bare form
 * covers the segment root under every robots.txt parser, and the slash form
 * states the descendant intent explicitly rather than relying on prefix
 * matching that would also catch an unrelated sibling.
 *
 * The locale cross-product mirrors middleware exactly. Middleware strips a
 * `/km` prefix from ANY path before calling isPrivateSurfacePath(), so
 * `/km/admin` really is served with a private-surface `X-Robots-Tag` even
 * though no such page exists — the two layers agreeing is the point.
 */
export function getLocalizedPrivateSeoPaths(): string[] {
  const out: string[] = [];
  for (const prefix of getPrivateSeoPaths()) {
    for (const locale of ["", ...URL_LOCALE_PREFIXES]) {
      out.push(`${locale}${prefix}`, `${locale}${prefix}/`);
    }
  }
  return out;
}
