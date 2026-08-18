// lib/seo/open-graph.ts
//
// The Open Graph fields every public page shares, in one place.
//
// ── Why this exists ──────────────────────────────────────────────────────────
// Next.js metadata does NOT deep-merge `openGraph`. A page that declares one
// REPLACES the object the layout declared, field for field. So every page that
// wanted its own og:title silently dropped og:site_name, og:locale and the
// alternate-locale signal along with it.
//
// That was eight public routes — the homepage, /about, /contact, /policy,
// /privacy, /posts/[slug], /catalogs/[slug] and /about/committee — sharing to
// Facebook and Telegram (this library's two main sharing channels) with no
// site attribution at all, while their siblings had it. Nothing warned: the
// tags were simply absent, and only a side-by-side diff of two routes showed it.
//
// Spreading `await openGraphBase(locale)` first makes the omission impossible
// to reintroduce by accident, and lib/seo/open-graph.test.ts fails the build if
// a public page declares `openGraph` without either this helper or an explicit
// siteName.

import { getSiteConfig } from "@/lib/system-settings/config";
import { SITE_URL } from "@/lib/seo/site";

/** OG locale codes for the two locales this site publishes in. */
const OG_LOCALE: Record<string, string> = { en: "en_US", km: "km_KH" };

export type OpenGraphBase = {
  siteName: string;
  locale: string;
  alternateLocale: string[];
  images: { url: string }[];
};

/**
 * Site-wide Open Graph defaults for `locale`.
 *
 * `siteName` comes from the PUBLISHED system settings (System Settings → SEO),
 * never a compiled-in constant — that is the site's one identity field, and a
 * second copy in code is how it drifted from the wordmark in the first place.
 *
 * Spread it FIRST so a page's own title/description/type/images win:
 *
 *     openGraph: { ...(await openGraphBase(locale)), title, description }
 */
export async function openGraphBase(locale: string): Promise<OpenGraphBase> {
  const cfg = await getSiteConfig();
  const primary = OG_LOCALE[locale] ?? OG_LOCALE.en;
  return {
    siteName: cfg.seo.siteName,
    locale: primary,
    // The page exists in both locales. og:locale alone tells a share preview
    // only about the one its crawler happened to fetch.
    alternateLocale: Object.values(OG_LOCALE).filter((l) => l !== primary),
    images: [{ url: `${SITE_URL}/og-default.png` }],
  };
}
