import type { Metadata } from "next";

/**
 * Environment-aware indexing policy — the single decision point for whether
 * this deployment may be indexed by search engines. Consumed by:
 *   - middleware.ts            → X-Robots-Tag response header
 *   - next.config.ts           → build-level X-Robots-Tag on static assets
 *   - app/robots.ts            → crawl rules + sitemap reference
 *   - app/sitemap.ts           → empty sitemap off-production
 *   - app/root-metadata.ts     → <meta name="robots"> baseline
 *
 * Indexing is OPT-IN: only a real Vercel production deployment (or an
 * explicit SEO_INDEXING=on) is indexable. Previews, branch deploys, local
 * dev, CI, and self-hosted staging all default to noindex — demo/testing
 * content must never leak into search results.
 *
 * SEO_INDEXING (server-only env var):
 *   "on"  — force indexable  (self-hosted production, CI e2e asserting
 *            production behavior)
 *   "off" — force noindex    (emergency kill switch, works even on prod)
 *   unset — VERCEL_ENV === "production" decides
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
  // Without an explicit SEO_INDEXING=on this still resolves non-indexable.
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function isIndexableEnvironment(): boolean {
  const override = (process.env.SEO_INDEXING ?? "").trim().toLowerCase();
  if (override === "on" || override === "true" || override === "1") return true;
  if (override === "off" || override === "false" || override === "0") return false;
  return process.env.VERCEL_ENV === "production" && process.env.NODE_ENV === "production";
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
] as const;

export function isPrivateSurfacePath(localeStrippedPath: string): boolean {
  return PRIVATE_PATH_PREFIXES.some(
    (prefix) =>
      localeStrippedPath === prefix || localeStrippedPath.startsWith(`${prefix}/`),
  );
}
