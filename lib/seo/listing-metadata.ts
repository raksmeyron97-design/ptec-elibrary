import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site";

/**
 * Metadata for paginated listing pages (/books, /theses, /posts, …).
 *
 * - Page 1 and deeper pages each get a self-referencing canonical
 *   (`/books`, `/books?page=2`, …) so Google can crawl and index the full
 *   collection instead of collapsing everything onto page 1.
 * - Filtered / searched variants (?q=, ?dept=, ?sort=, …) are kept out of the
 *   index (`noindex, follow`): the links are still crawled, but the
 *   near-duplicate filter permutations don't pollute search results.
 */
export function buildListingMetadata({
  path,
  title,
  description,
  page,
  hasFilters,
  ogType = "website",
}: {
  /** Route path starting with "/", e.g. "/books". */
  path: string;
  title: string;
  description: string;
  /** Current 1-based page number (from ?page=). */
  page: number;
  /** True when any filter/search/sort param other than `page` is active. */
  hasFilters: boolean;
  ogType?: "website";
}): Metadata {
  const canonical =
    page > 1 ? `${SITE_URL}${path}?page=${page}` : `${SITE_URL}${path}`;
  const pagedTitle = page > 1 ? `${title} — Page ${page}` : title;

  return {
    title: pagedTitle,
    description,
    alternates: { canonical },
    robots: hasFilters ? { index: false, follow: true } : undefined,
    openGraph: {
      title: `${pagedTitle} | PTEC Library`,
      description,
      url: canonical,
      type: ogType,
    },
    twitter: {
      card: "summary_large_image",
      title: `${pagedTitle} | PTEC Library`,
      description,
    },
  };
}

/** Parse a ?page= value into a sane 1-based page number. */
export function parsePageParam(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
