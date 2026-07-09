import { SITE_URL } from "@/lib/seo/site";

/**
 * Reciprocal canonical + hreflang alternates for a locale-prefixed route.
 * `path` is the locale-agnostic path (and query string, if any), e.g.
 * "/theses/foo" or "/books?page=2" — English is unprefixed, Khmer gets /km.
 */
export function localeAlternates(path: string, locale: string) {
  const en = `${SITE_URL}${path}`;
  const km = `${SITE_URL}/km${path}`;
  return {
    canonical: locale === "km" ? km : en,
    languages: { en, km, "x-default": en },
  };
}
