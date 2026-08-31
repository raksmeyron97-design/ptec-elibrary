import { SITE_URL } from "@/lib/seo/site";

type Crumb = {
  name: string;
  /**
   * Locale-less route path starting with "/", e.g. "/theses". The locale
   * prefix is applied by the builder — do NOT pass "/km/..." or
   * "${localePrefix}/...". Omit for the current page (the last crumb).
   */
  path?: string;
};

type BreadcrumbOptions = {
  /** Locale of the page emitting the breadcrumb. Khmer crumbs get "/km". */
  locale?: string;
  /** Page URL, used as the BreadcrumbList's `@id` anchor (`<url>#breadcrumb`). */
  pageUrl?: string;
};

/**
 * Paths that resolve via a redirect rather than serving content. A breadcrumb
 * item pointing at one advertises a redirect as a navigational waypoint.
 *
 * `/home` is the live case: middleware 308s `/home` → `/` (and `/km/home` →
 * `/km`), and the book detail page still emitted `${localePrefix}/home` as
 * position 1 — verified live on production, docs/SEO-V3-AUDIT.md D-4.
 */
const REDIRECTING_PATHS: Record<string, string> = {
  "/home": "/",
};

/**
 * Normalize one crumb path to an absolute, locale-correct, canonical URL.
 *
 * Three rules, each closing a defect found live (docs/SEO-V3-AUDIT.md D-3/D-4/D-5):
 *
 *  1. **Locale.** Khmer pages must not emit English breadcrumb URLs. Seven of
 *     eight detail routes passed bare "/" and "/theses", so `/km/theses/x`
 *     declared a navigation path that left its own locale. English is
 *     unprefixed (`localePrefix: "as-needed"`), Khmer takes "/km".
 *  2. **Redirects.** A path listed in REDIRECTING_PATHS is replaced by its
 *     destination.
 *  3. **Query strings.** A crumb pointing at a filtered listing
 *     (`/books?dept=…`, `/publications?journal=…`) advertises a URL that this
 *     same site serves as `noindex, follow` and canonicalises to the bare
 *     listing. The query is dropped so the crumb points at the indexable
 *     listing it canonicalises to; when only a hub page would be truthful, the
 *     caller should pass that hub instead (e.g. `/subjects/<slug>`).
 */
function crumbUrl(path: string, locale?: string): string {
  const [rawPath] = path.split("?");
  const redirected = REDIRECTING_PATHS[rawPath] ?? rawPath;
  const prefix = locale === "km" ? "/km" : "";
  // The locale root is "/" (or "/km") — never "/km/".
  const joined = redirected === "/" ? prefix || "/" : `${prefix}${redirected}`;
  return `${SITE_URL}${joined}`;
}

/**
 * schema.org BreadcrumbList for JSON-LD. The last crumb is the current page
 * and per Google's guidance may omit `item`.
 *
 * `@id` is set when `pageUrl` is given so the node is addressable rather than
 * anonymous (SEO V3 §29 / audit D-10). Callers that have the canonical URL to
 * hand should always pass it.
 */
export function breadcrumbSchema(crumbs: Crumb[], options: BreadcrumbOptions = {}) {
  const { locale, pageUrl } = options;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    ...(pageUrl ? { "@id": `${pageUrl}#breadcrumb` } : {}),
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      ...(crumb.path ? { item: crumbUrl(crumb.path, locale) } : {}),
    })),
  };
}
