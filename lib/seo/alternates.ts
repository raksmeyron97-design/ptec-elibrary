import { SITE_URL } from "@/lib/seo/site";

/** Absolute English + Khmer URLs for a locale-agnostic path. The root is
 *  special: English is the bare origin and Khmer is /km — never "/km/"
 *  (Next redirects /km/ → /km, so a /km/ canonical would point at a
 *  redirect). No trailing slash matches how Next itself serializes metadata
 *  URLs under trailingSlash:false, keeping canonical, hreflang, and sitemap
 *  byte-identical for the homepage. */
export function localeUrls(path: string) {
  if (path === "/" || path === "") {
    return { en: SITE_URL, km: `${SITE_URL}/km` };
  }
  return { en: `${SITE_URL}${path}`, km: `${SITE_URL}/km${path}` };
}

/**
 * Reciprocal canonical + hreflang alternates for a locale-prefixed route.
 * `path` is the locale-agnostic path (and query string, if any), e.g.
 * "/theses/foo" or "/books?page=2" — English is unprefixed, Khmer gets /km.
 */
export function localeAlternates(path: string, locale: string) {
  const { en, km } = localeUrls(path);
  return {
    canonical: locale === "km" ? km : en,
    languages: { en, km, "x-default": en },
  };
}

type RobotsLike = string | { index?: boolean | null } | null | undefined;
type WithAlternates = { robots?: unknown; alternates?: { canonical?: unknown; languages?: unknown } | null };

/** Does a Metadata `robots` value keep the page out of the index? */
export function robotsSaysNoindex(robots: RobotsLike): boolean {
  if (!robots) return false;
  if (typeof robots === "string") return /\b(noindex|none)\b/i.test(robots);
  return robots.index === false;
}

/**
 * A noindex page carries its canonical but no hreflang.
 *
 * Hreflang asks a search engine to swap one INDEXED page for its translation;
 * on a page that asked not to be indexed it is a contradiction search engines
 * ignore at best. Six noindex templates carried it (filtered and out-of-range
 * listings, search, the reader, catalogue records — docs/seo/AUDIT-VERIFICATION.md
 * F5). Every builder that can answer noindex passes its result through here,
 * so the rule is decided once.
 */
export function dropHreflangWhenNoindex<T extends WithAlternates>(metadata: T): T {
  if (!robotsSaysNoindex(metadata.robots as RobotsLike) || !metadata.alternates?.languages) return metadata;
  const { languages: _languages, ...rest } = metadata.alternates;
  void _languages;
  return { ...metadata, alternates: rest };
}
