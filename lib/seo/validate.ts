// lib/seo/validate.ts
//
// Deterministic, dependency-free SEO validators. Pure functions over already-
// built values — they never fetch, so the sitemap route, the unit tests and any
// future admin SEO report all run exactly the same checks.
//
// These exist because the failures they catch are SILENT. A sitemap that lists
// a private URL, repeats a URL, or points at a host that is not the canonical
// one still serves as valid XML and still returns 200; the only symptom is
// weeks of confusing Search Console coverage reports. Ten empty subject URLs
// shipped in the live sitemap for exactly this reason (docs/SEO-V2-AUDIT.md F-1).

import { PRODUCTION_SITE_URL } from "@/lib/seo/production-origin";
import { isPrivateSurfacePath, URL_LOCALE_PREFIXES } from "@/lib/seo/indexing";

export type SeoIssue = {
  /** Machine-readable rule name, e.g. "duplicate-url". */
  rule: string;
  /** The offending value. */
  value: string;
  /** One sentence a human can act on. */
  message: string;
};

/** Strip a URL-visible locale prefix, so `/km/dashboard` classifies as
 *  `/dashboard` the way middleware classifies it. */
export function stripLocalePrefix(pathname: string): string {
  for (const prefix of URL_LOCALE_PREFIXES) {
    if (pathname === prefix) return "/";
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  }
  return pathname;
}

/**
 * A canonical URL is valid when it is absolute, https, on `expectedOrigin`,
 * free of a query string or fragment, and free of a trailing slash (except the
 * bare root, which Next serializes as the origin itself).
 */
export function validateCanonicalUrl(
  url: string,
  expectedOrigin: string = PRODUCTION_SITE_URL,
): SeoIssue[] {
  const issues: SeoIssue[] = [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [{ rule: "unparseable-url", value: url, message: "Canonical is not an absolute URL." }];
  }
  if (parsed.origin !== expectedOrigin) {
    issues.push({
      rule: "wrong-origin",
      value: url,
      message: `Canonical origin is ${parsed.origin}, expected ${expectedOrigin}. A localhost, staging or tunnel-fallback canonical de-indexes the real page.`,
    });
  }
  if (parsed.protocol !== "https:") {
    issues.push({ rule: "insecure-scheme", value: url, message: "Canonical must be https." });
  }
  if (parsed.search) {
    issues.push({
      rule: "canonical-has-query",
      value: url,
      message: "Canonical carries a query string. Only ?page=N is a legitimate canonical parameter (see docs/SEO-V2-URL-POLICY.md).",
    });
  }
  if (parsed.hash) {
    issues.push({ rule: "canonical-has-fragment", value: url, message: "Canonical carries a fragment." });
  }
  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    issues.push({
      rule: "trailing-slash",
      value: url,
      message: "Trailing slash does not match trailingSlash:false — this canonical points at a redirect.",
    });
  }
  return issues;
}

/**
 * hreflang alternates must be reciprocal and complete: `en`, `km` and
 * `x-default` present, `x-default` equal to `en`, the canonical present among
 * them, and no two languages pointing at the same URL (which would declare the
 * two locales to be the same document).
 */
export function validateAlternateUrls(
  canonical: string,
  languages: Record<string, string>,
): SeoIssue[] {
  const issues: SeoIssue[] = [];
  for (const key of ["en", "km", "x-default"]) {
    if (!languages[key]) {
      issues.push({ rule: "missing-hreflang", value: key, message: `hreflang "${key}" is missing.` });
    }
  }
  if (languages.en && languages["x-default"] && languages["x-default"] !== languages.en) {
    issues.push({
      rule: "x-default-mismatch",
      value: languages["x-default"],
      message: "x-default must point at the English URL.",
    });
  }
  if (languages.en && languages.km && languages.en === languages.km) {
    issues.push({
      rule: "identical-alternates",
      value: languages.en,
      message: "en and km resolve to the same URL, which declares one document in two languages.",
    });
  }
  const values = Object.values(languages);
  if (values.length > 0 && !values.includes(canonical)) {
    issues.push({
      rule: "canonical-not-in-alternates",
      value: canonical,
      message: "The canonical URL is not among its own hreflang alternates — the set is not reciprocal.",
    });
  }
  for (const [lang, url] of Object.entries(languages)) {
    for (const issue of validateCanonicalUrl(url)) {
      issues.push({ ...issue, rule: `alternate:${lang}:${issue.rule}` });
    }
  }
  return issues;
}

/** True when a locale-prefixed path may be crawled and indexed. */
export function isIndexableRoute(pathname: string): boolean {
  return !isPrivateSeoRoute(pathname);
}

/** True when a locale-prefixed path is a private surface in every environment. */
export function isPrivateSeoRoute(pathname: string): boolean {
  return isPrivateSurfacePath(stripLocalePrefix(pathname));
}

export type SitemapLikeEntry = {
  url: string;
  lastModified?: string | Date;
  // Values are optional to stay assignable from Next's `Languages<string>`,
  // whose index signature yields `string | undefined`.
  alternates?: { languages?: Record<string, string | undefined> };
};

/**
 * Validate ONE sitemap entry: valid canonical URL, not a private surface, real
 * `lastmod` when present, and alternates covering both locales.
 *
 * `x-default` is not required here — `MetadataRoute.Sitemap` alternates are
 * xhtml:link elements where en/km reciprocity is the requirement.
 */
export function validateSitemapEntry(entry: SitemapLikeEntry): SeoIssue[] {
  const issues: SeoIssue[] = [];

  // ?page=N is legitimate on a listing canonical but never in the sitemap:
  // deep pages are crawled through rel-next chains, not submitted.
  issues.push(...validateCanonicalUrl(entry.url));

  let pathname = "";
  try {
    pathname = new URL(entry.url).pathname;
  } catch {
    return issues;
  }

  if (isPrivateSeoRoute(pathname)) {
    issues.push({
      rule: "private-url-in-sitemap",
      value: entry.url,
      message: "Private surfaces must never be submitted for indexing.",
    });
  }

  if (entry.lastModified != null) {
    const d = entry.lastModified instanceof Date ? entry.lastModified : new Date(entry.lastModified);
    if (Number.isNaN(d.getTime())) {
      issues.push({ rule: "invalid-lastmod", value: String(entry.lastModified), message: "lastmod is not a parseable date." });
    } else if (d.getTime() > Date.now() + 86_400_000) {
      issues.push({
        rule: "future-lastmod",
        value: d.toISOString(),
        message: "lastmod is in the future — crawlers learn to ignore lastmod entirely when it cannot be trusted.",
      });
    }
  }

  const languages = entry.alternates?.languages;
  if (!languages?.en || !languages?.km) {
    issues.push({
      rule: "missing-sitemap-alternates",
      value: entry.url,
      message: "Sitemap entries must carry both en and km alternates.",
    });
  }

  return issues;
}

/**
 * Validate a whole sitemap: every entry, plus the cross-entry rules a single
 * entry cannot see (duplicate URLs).
 */
export function validateSitemap(entries: SitemapLikeEntry[]): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.url)) {
      issues.push({
        rule: "duplicate-url",
        value: entry.url,
        message: "URL appears more than once in the sitemap.",
      });
    }
    seen.add(entry.url);
    issues.push(...validateSitemapEntry(entry));
  }

  return issues;
}

export type MetadataLike = {
  title?: unknown;
  description?: unknown;
  alternates?: { canonical?: unknown; languages?: Record<string, string> };
  openGraph?: { title?: unknown; description?: unknown; siteName?: unknown } | null;
};

/** Every indexable page needs a title, a description, a canonical, hreflang and
 *  Open Graph with site attribution (brief §10). */
export function validateSeoMetadata(meta: MetadataLike): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

  if (!text(meta.title)) {
    issues.push({ rule: "missing-title", value: "", message: "Page has no title." });
  }
  if (!text(meta.description)) {
    issues.push({ rule: "missing-description", value: "", message: "Page has no meta description." });
  }

  const canonical = text(meta.alternates?.canonical);
  if (!canonical) {
    issues.push({ rule: "missing-canonical", value: "", message: "Page has no canonical URL." });
  } else {
    issues.push(...validateCanonicalUrl(canonical));
    issues.push(...validateAlternateUrls(canonical, meta.alternates?.languages ?? {}));
  }

  if (!meta.openGraph) {
    issues.push({ rule: "missing-open-graph", value: "", message: "Page declares no Open Graph tags." });
  } else if (!text(meta.openGraph.siteName)) {
    issues.push({
      rule: "missing-og-site-name",
      value: "",
      message: "openGraph is declared without siteName — Next replaces the layout's object rather than merging it. Spread openGraphBase().",
    });
  }

  return issues;
}

/**
 * Structural JSON-LD validation: a real object, a schema.org context, a
 * declared @type, no null/undefined leaves (which serialize as fabricated
 * empty claims), and every absolute URL on the canonical origin.
 *
 * This checks SHAPE, not truth. Whether a value is factually correct is
 * enforced upstream by the builders in lib/seo/*, which omit unknown fields
 * rather than defaulting them.
 */
export function validateStructuredData(data: unknown, path = "$"): SeoIssue[] {
  const issues: SeoIssue[] = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return [{ rule: "invalid-jsonld-root", value: path, message: "JSON-LD must be an object." }];
  }
  const node = data as Record<string, unknown>;

  if (path === "$") {
    const ctx = node["@context"];
    if (ctx !== "https://schema.org" && ctx !== "http://schema.org") {
      issues.push({ rule: "missing-context", value: String(ctx ?? ""), message: "@context must be https://schema.org." });
    }
  }
  if (!node["@type"]) {
    issues.push({ rule: "missing-type", value: path, message: `${path} declares no @type.` });
  }

  const walk = (value: unknown, at: string) => {
    if (value === null || value === undefined) {
      issues.push({
        rule: "null-value",
        value: at,
        message: `${at} is null/undefined — omit the property instead of asserting an empty value.`,
      });
      return;
    }
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value)) {
        try {
          const origin = new URL(value).origin;
          // Off-site URLs are legitimate in sameAs, identifier and image.
          const offsiteOk = /sameAs|identifier|image|url\b.*sameAs/.test(at);
          if (origin !== PRODUCTION_SITE_URL && !offsiteOk && /(^|\.)(url|@id|mainEntityOfPage)$/.test(at)) {
            issues.push({
              rule: "jsonld-wrong-origin",
              value: value,
              message: `${at} points at ${origin}, not the canonical origin.`,
            });
          }
        } catch {
          issues.push({ rule: "jsonld-bad-url", value, message: `${at} is not a parseable URL.` });
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${at}[${i}]`));
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, `${at}.${k}`);
      }
    }
  };

  for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);

  return issues;
}
