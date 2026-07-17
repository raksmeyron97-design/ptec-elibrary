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
