import type { Metadata } from "next";
import { localeAlternates } from "@/lib/seo/alternates";
import { SITE_URL } from "@/lib/seo/site";
import {
  resolveOrgIdentity,
  type OrgIdentity,
} from "@/lib/system-settings/org-identity";

/** The shared social card, same asset every detail-page builder falls back to. */
export const LISTING_FALLBACK_OG_IMAGE = `${SITE_URL}/og-default.png`;

/**
 * Metadata for paginated listing pages (/books, /theses, /posts, …).
 *
 * - Page 1 and deeper pages each get a self-referencing canonical
 *   (`/books`, `/books?page=2`, …) so Google can crawl and index the full
 *   collection instead of collapsing everything onto page 1.
 * - Filtered / searched variants (?q=, ?dept=, ?sort=, …) are kept out of the
 *   index (`noindex, follow`): the links are still crawled, but the
 *   near-duplicate filter permutations don't pollute search results.
 * - Pages beyond the last result page (?page=999) are `noindex, follow` too —
 *   an empty grid is not a useful index entry (pass `outOfRange`).
 * - Every listing gets a social image. `image` is optional, but its DEFAULT is
 *   the site card rather than nothing: /theses, /theses/summary, /catalogs,
 *   /publications and /paths were each shipping with no og:image at all
 *   (verified live 2026-09-07) purely because they did not pass one, so a
 *   share of any of them rendered as a bare link. Detail pages have used this
 *   same fallback since book-seo.ts; a listing had no reason to differ.
 */
export function buildListingMetadata({
  path,
  locale,
  title,
  description,
  page,
  hasFilters,
  ogType = "website",
  image,
  imageAlt,
  pageLabel = "Page",
  outOfRange = false,
  org: orgArg,
}: {
  /** Route path starting with "/", e.g. "/books". */
  path: string;
  /** Current request locale ("en" | "km") — drives canonical + hreflang. */
  locale: string;
  /** Localized title for the current locale. */
  title: string;
  /** Localized description for the current locale. */
  description: string;
  /** Current 1-based page number (from ?page=). */
  page: number;
  /** True when any filter/search/sort param other than `page` is active. */
  hasFilters: boolean;
  ogType?: "website";
  /** Social-sharing image URL (absolute or /public path). */
  image?: string;
  imageAlt?: string;
  /** Localized "Page" label for paginated titles (e.g. "ទំព័រ"). */
  pageLabel?: string;
  /** True when the requested page is past the last page of results. */
  outOfRange?: boolean;
  /** Resolved published identity — `await getOrgIdentity()`. Drives the
   *  Open Graph site name and the "| <library>" title suffix. */
  org?: OrgIdentity;
}): Metadata {
  const org = resolveOrgIdentity(orgArg);
  const pathWithQuery = page > 1 ? `${path}?page=${page}` : path;
  const alternates = localeAlternates(pathWithQuery, locale);
  const pagedTitle = page > 1 ? `${title} — ${pageLabel} ${page}` : title;
  const social = image ?? LISTING_FALLBACK_OG_IMAGE;
  const images = [{ url: social, alt: imageAlt ?? org.siteName }];

  return {
    title: pagedTitle,
    description,
    alternates,
    robots: hasFilters || outOfRange ? { index: false, follow: true } : undefined,
    openGraph: {
      title: `${pagedTitle} | ${org.libraryName}`,
      description,
      url: alternates.canonical,
      type: ogType,
      siteName: org.siteName,
      locale: locale === "km" ? "km_KH" : "en_US",
      alternateLocale: locale === "km" ? "en_US" : "km_KH",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: `${pagedTitle} | ${org.libraryName}`,
      description,
      images: [social],
    },
  };
}

/** Parse a ?page= value into a sane 1-based page number. */
export function parsePageParam(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
