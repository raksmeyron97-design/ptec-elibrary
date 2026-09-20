// lib/seo/open-graph.ts
//
// THE Open Graph contract. One builder, used by every public surface.
//
// ── Why this exists ──────────────────────────────────────────────────────────
// Next.js metadata does NOT deep-merge `openGraph`. A page that declares one
// REPLACES the object the layout declared, field for field. So every page that
// wanted its own og:title silently dropped og:site_name, og:locale and the
// alternate-locale signal along with it.
//
// The first version of this module fixed that with `openGraphBase(locale)` — a
// spread of the shared defaults. It removed the whole-object loss but not the
// FIELD-LEVEL drift, because a spread only supplies what nobody overwrites and
// a hand-written block was still free to supply its own. Measured on
// production 2026-09-20, five shapes were in circulation at once:
//
//   /                       siteName + locale + alternate, image with NO alt
//   /about/rules            siteName + locale, NO alternate       (hand-written)
//   /about/team/<slug>      siteName + locale, NO alternate, image with NO alt
//   /authors/<slug>         siteName only — NO locale, NO alternate, and when
//                           the person has no portrait, NO og:image AT ALL
//   /journals/<j>/issues    siteName + image + alt, NO locale, NO alternate
//
// A spread cannot prevent that; only a builder that OWNS the fields can. So
// `openGraphBase` is gone and `buildOpenGraph()` replaces it: it returns the
// complete object, page fields included, and there is nothing left for a call
// site to half-declare. lib/seo/open-graph.test.ts fails the build if a public
// page hand-writes an `openGraph` block instead of calling it.
//
// ── The contract ─────────────────────────────────────────────────────────────
// Every indexable public page emits og:title, og:type, og:url, og:image,
// og:image:alt, og:site_name, og:locale and og:locale:alternate, plus
// og:description wherever a factual description exists.
//
// og:url is the CALLER's canonical URL — the same string it puts in
// `alternates.canonical`, never reconstructed here. Reconstructing it is how a
// canonical and an og:url come to disagree, and this file has no way to know
// whether a listing page carries `?page=2`.

import { SITE_URL } from "@/lib/seo/site";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

/** OG locale codes for the two locales this site publishes in. */
export const OG_LOCALE = { en: "en_US", km: "km_KH" } as const;

/** The shared social card. One constant; every builder's fallback. */
export const OG_FALLBACK_IMAGE_PATH = "/og-default.png";
export const OG_FALLBACK_IMAGE = `${SITE_URL}${OG_FALLBACK_IMAGE_PATH}`;
/** Dimensions of the asset scripts/generate-og-image.mjs emits. Verified by
 *  lib/seo/open-graph.test.ts against the committed file, so a regenerated
 *  card that changed shape fails the build rather than lying to a crawler. */
export const OG_FALLBACK_IMAGE_WIDTH = 1200;
export const OG_FALLBACK_IMAGE_HEIGHT = 630;
export const OG_FALLBACK_IMAGE_TYPE = "image/png";

export type OgImage = {
  url: string;
  alt: string;
  width?: number;
  height?: number;
  type?: string;
};

export type OpenGraphType = "website" | "article" | "profile" | "book";

/** The og:locale for a request locale. Unknown locales read as English. */
export function ogLocale(locale: string): string {
  return locale === "km" ? OG_LOCALE.km : OG_LOCALE.en;
}

/**
 * The OTHER published locale, as a one-element array.
 *
 * Every public page exists in both locales (English unprefixed, Khmer under
 * /km — CLAUDE.md § Internationalisation), so this is a fact about the route,
 * not a guess. og:locale alone tells a share preview only about the language
 * whichever crawler happened to fetch it.
 */
export function ogAlternateLocale(locale: string): string[] {
  return [locale === "km" ? OG_LOCALE.en : OG_LOCALE.km];
}

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

/**
 * The ONE image-selection rule: the caller's image when it has one, the shared
 * site card otherwise — and always with alt text.
 *
 * Width and height are declared ONLY for the fallback, whose dimensions this
 * repository controls. They are deliberately OMITTED for a record cover, an
 * author portrait or a journal cover, because nothing here knows them:
 * lib/seo/book-seo.ts used to declare every cover `800 × 1200`, and of eight
 * covers sampled from production on 2026-09-20 exactly ONE was that size. The
 * others were 406×608, 525×601, 800×1034, 922×1200, 520×691, 800×1164 — and
 * one was 1200×672, LANDSCAPE, published to crawlers as a portrait. Facebook
 * and LinkedIn size and crop a card from the declared dimensions before they
 * fetch the bytes, so a wrong declaration is worse than none: an absent
 * width/height makes the crawler measure the image itself.
 */
export function ogImages(
  image: string | null | undefined,
  { alt, fallbackAlt }: { alt?: string | null; fallbackAlt: string },
): [OgImage] {
  const url = clean(image);
  if (!url) {
    return [
      {
        url: OG_FALLBACK_IMAGE,
        alt: clean(fallbackAlt) || OG_FALLBACK_IMAGE_PATH,
        width: OG_FALLBACK_IMAGE_WIDTH,
        height: OG_FALLBACK_IMAGE_HEIGHT,
        type: OG_FALLBACK_IMAGE_TYPE,
      },
    ];
  }
  return [{ url, alt: clean(alt) || clean(fallbackAlt) }];
}

export type BuildOpenGraphInput<T extends OpenGraphType> = {
  /** Request locale ("en" | "km"). Drives og:locale + og:locale:alternate. */
  locale: string;
  /** Resolved published identity — `await getOrgIdentity()`. Owns og:site_name. */
  org: OrgIdentity;
  title: string;
  /** Omitted from the output when blank: an empty og:description is worse
   *  than none, and nothing here may invent one. */
  description?: string | null;
  type: T;
  /** The page's canonical URL — pass `alternates.canonical`, never rebuild it. */
  url: string;
  /** Record cover / portrait / journal cover. Blank falls back to the site card. */
  image?: string | null;
  /** Alt for `image`. When `image` is blank this is ignored and the fallback's
   *  own alt is used, so a page cannot label the site card "Book cover: X". */
  imageAlt?: string | null;
  /** Alt for the FALLBACK card. Defaults to the published site name. */
  fallbackImageAlt?: string | null;
};

export type OpenGraphCore<T extends OpenGraphType> = {
  title: string;
  description?: string;
  type: T;
  url: string;
  siteName: string;
  locale: string;
  alternateLocale: string[];
  images: [OgImage];
};

/**
 * The shared Open Graph object for any public page.
 *
 * Type-specific fields (article `authors`/`publishedTime`/`section`/`tags`,
 * book `isbn`, profile names) are spread on by the caller AFTER this, which is
 * what keeps the `type` literal discriminating Next's OpenGraph union:
 *
 *     openGraph: {
 *       ...buildOpenGraph({ locale, org, title, description, type: "article", url, image, imageAlt }),
 *       authors, publishedTime, section,
 *     }
 */
export function buildOpenGraph<T extends OpenGraphType>({
  locale,
  org,
  title,
  description,
  type,
  url,
  image,
  imageAlt,
  fallbackImageAlt,
}: BuildOpenGraphInput<T>): OpenGraphCore<T> {
  const desc = clean(description);
  return {
    title: clean(title),
    ...(desc ? { description: desc } : {}),
    type,
    url,
    siteName: org.siteName,
    locale: ogLocale(locale),
    alternateLocale: ogAlternateLocale(locale),
    images: ogImages(image, { alt: imageAlt, fallbackAlt: fallbackImageAlt ?? org.siteName }),
  };
}

export type TwitterCard = "summary" | "summary_large_image";

/**
 * The Twitter/X card that goes WITH an Open Graph object.
 *
 * It exists for the same reason `buildOpenGraph` does: `twitter` is replaced
 * wholesale too, and the homepage proved it. It declared
 * `twitter: { title, description }` with no `card`, which replaced the root
 * layout's `summary_large_image` — so the site's most-shared URL published a
 * 1200 × 630 landscape card under `twitter:card = summary`, a small square
 * crop, verified live on 2026-09-20.
 *
 * `card` stays the caller's choice: /authors and /about/team deliberately use
 * `summary` for a portrait, and that is a real editorial decision, not drift.
 */
export function buildTwitter({
  card,
  title,
  description,
  images,
}: {
  card: TwitterCard;
  title: string;
  description?: string | null;
  /** Pass the OG images array so the two can never name different files. */
  images: readonly OgImage[];
}) {
  const desc = clean(description);
  return {
    card,
    title: clean(title),
    ...(desc ? { description: desc } : {}),
    images: images.map((i) => ({ url: i.url, alt: i.alt })),
  };
}
