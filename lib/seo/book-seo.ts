// Pure, typed SEO builders for the public book catalog (/books, /books/[slug]
// and their /km equivalents). Browser-safe — no server-only imports — so every
// builder is unit-testable without a database (lib/seo/book-seo.test.ts).
//
// Accuracy rules (do not weaken):
//   * Never fabricate bibliographic facts. Unknown publisher/ISBN/page count/
//     date are OMITTED, not defaulted — PTEC hosts most books but publishes
//     almost none of them, so PTEC appears as `provider`, never as `publisher`
//     unless the record's own publisher column says so.
//   * `pages <= 1` is the legacy "unknown" sentinel (mapRowToBook defaults to
//     1), so numberOfPages is only emitted for pages > 1.
//   * Schema URLs always match the page's canonical URL for the current
//     locale, including the ?page=N query on paginated collection pages.

import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { resolveContributorNodes } from "@/lib/seo/contributor";
import { bookLanguageCode } from "@/lib/books/language";
import { resolveBookDownloadAccess } from "@/lib/books/access";
import type { ResourceContributorView } from "@/lib/resources/contributor-view";
import { localeAlternates } from "@/lib/seo/alternates";
import { buildOpenGraph, buildTwitter, OG_FALLBACK_IMAGE } from "@/lib/seo/open-graph";
import { libraryNode } from "@/lib/seo/org-nodes";
import {
  resolveOrgIdentity,
  type OrgIdentity,
} from "@/lib/system-settings/org-identity";

/** Re-exported so existing importers keep one constant, not a second copy. */
export const FALLBACK_OG_IMAGE = OG_FALLBACK_IMAGE;

export type BookSeoInput = {
  slug: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  /** Human-readable language name from the DB ("English", "Khmer", …). */
  language?: string | null;
  /** The book's ACTUAL publisher — never PTEC-as-host. */
  publisher?: string | null;
  isbn?: string | null;
  /** Real publication date (books.published_at). Null = unknown. */
  publishedAt?: string | null;
  /**
   * The book's file policy (books.file_access, 0151). Absent reads as
   * "public", the column default — so a caller that does not select the
   * column keeps today's markup exactly.
   */
  fileAccess?: string | null;
  /**
   * Whether the reader may actually be handed the PDF.
   *
   * Separate from `fileAccess` on purpose: this is what the DESCRIPTION
   * promises, and the caller resolves it through the one access rule
   * (`bookDownloadAllowed`) rather than this module re-deriving it. Absent
   * keeps the pre-5.0 wording, which is what every existing test asserts.
   */
  downloadable?: boolean;
  pages?: number | null;
  /** Verified author names only — pass [] when the author is unknown. */
  authors?: string[];
  /**
   * Resolved contributor credits (SEO 3.2). When present these are used
   * VERBATIM — already separated, already typed by the canonical graph — and
   * `authors` is left to the human-readable text (meta description, byline).
   * Absent, the builder falls back to classifying `authors` itself, which is
   * what every pre-3.2 caller still does.
   */
  contributors?: readonly ResourceContributorView[] | null;
  department?: string | null;
  category?: string | null;
  tags?: string[] | null;
};

// ── Language codes ───────────────────────────────────────────────────────────

/**
 * BCP-47 code for the value stored in `books.language`, or undefined when this
 * library cannot say.
 *
 * The table itself lives in `lib/books/language.ts`, with the canonical
 * spellings the upload form offers — because the same vocabulary decides what a
 * reader sees, what the facet chips group by, and what this emits. Keeping a
 * private copy here is what let `kh` fall through and strip `inLanguage` from
 * 35 published books while `khmer` and `km` were both handled.
 *
 * Returning undefined for an unrecognised value is deliberate: omitting
 * `inLanguage` is honest, guessing is a false claim about the book.
 */
export function languageCode(language: string | null | undefined): string | undefined {
  return bookLanguageCode(language);
}

// ── Canonical URLs ───────────────────────────────────────────────────────────

export function bookCanonicalUrl(slug: string, locale: string): string {
  return locale === "km" ? `${SITE_URL}/km/books/${slug}` : `${SITE_URL}/books/${slug}`;
}

export function booksCollectionUrl(locale: string, page = 1): string {
  const base = locale === "km" ? `${SITE_URL}/km/books` : `${SITE_URL}/books`;
  return page > 1 ? `${base}?page=${page}` : base;
}

// ── Description fallbacks ────────────────────────────────────────────────────

const MAX_META_DESCRIPTION = 157;

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function truncate(text: string): string {
  return text.length > MAX_META_DESCRIPTION ? `${text.slice(0, MAX_META_DESCRIPTION)}...` : text;
}

/** Factual one-liner built ONLY from verified fields (title, authors,
 *  category/department, language). Localized; never invents facts. */
export function bookFallbackDescription(book: BookSeoInput, locale: string): string {
  const authors = (book.authors ?? []).map(clean).filter(Boolean);
  const subject = clean(book.category) || clean(book.department);
  // The description promised a download on EVERY book, including the ones
  // the library has switched downloads off for — a sentence a reader sees in
  // the search result, believes, clicks, and finds is not true. `undefined`
  // keeps the original wording, so a caller that does not know about the
  // policy is unchanged.
  const downloadable = book.downloadable !== false;

  if (locale === "km") {
    const byline = authors.length > 0 ? ` ដោយ ${authors.join(", ")}` : "";
    const access = downloadable
      ? "អានតាមអ៊ីនធឺណិត ឬទាញយកជា PDF ដោយឥតគិតថ្លៃ។"
      : "អានតាមអ៊ីនធឺណិតដោយឥតគិតថ្លៃ។";
    return `${clean(book.title)}${byline} — សៀវភៅឌីជីថលឥតគិតថ្លៃក្នុងបណ្ណាល័យ វ.គ.ភ។ ${access}`;
  }
  const byline = authors.length > 0 ? ` by ${authors.join(", ")}` : "";
  const subjectPart = subject && subject !== "General" ? ` ${subject}` : "";
  const languagePart = book.language ? ` (${clean(book.language)})` : "";
  const access = downloadable ? "Read online or download the PDF" : "Read online";
  return `${clean(book.title)}${byline} — a free${subjectPart} e-book in the PTEC Library. ${access}${languagePart}.`;
}

/** Meta description: the record's own description when present (enriched with
 *  the factual fallback when very short), otherwise the fallback. Always
 *  truncated to a search-snippet-safe length; never empty. */
export function bookMetaDescription(book: BookSeoInput, locale: string): string {
  const own = clean(book.description);
  if (!own) return truncate(bookFallbackDescription(book, locale));
  if (own.length < 70) {
    return truncate(`${own.replace(/[.。។]\s*$/, "")}. ${bookFallbackDescription(book, locale)}`);
  }
  return truncate(own);
}

// ── Metadata (generateMetadata) ──────────────────────────────────────────────

export function buildBookMetadata(
  book: BookSeoInput,
  locale: string,
  overrides?: { seoTitle?: string | null; seoDescription?: string | null; ogImage?: string | null },
  orgArg?: OrgIdentity,
): Metadata {
  const org = resolveOrgIdentity(orgArg);
  // Admin overrides win; blank/whitespace overrides fall back to auto-generated
  // values so an empty field never blanks the tag.
  const title = clean(overrides?.seoTitle) || book.title;
  const description = clean(overrides?.seoDescription) || bookMetaDescription(book, locale);
  const authors = (book.authors ?? []).map(clean).filter(Boolean);
  const alternates = localeAlternates(`/books/${book.slug}`, locale);
  const canonicalUrl = alternates.canonical;
  const tags = (book.tags ?? []).filter(Boolean);
  const section = clean(book.department) || clean(book.category) || "Books";
  const ogImage = clean(overrides?.ogImage) || book.coverUrl;
  const imageAlt = locale === "km" ? `ក្របសៀវភៅ៖ ${title}` : `Book cover: ${title}`;

  const openGraph = {
    ...buildOpenGraph({
      locale,
      org,
      title,
      description,
      type: "article" as const,
      url: canonicalUrl,
      // A record cover when there is one, the shared site card otherwise. The
      // alt describes the image ACTUALLY used: buildOpenGraph ignores
      // `imageAlt` on the fallback, so the site card is never labelled
      // "Book cover: <title>".
      image: ogImage,
      imageAlt,
    }),
    authors: authors.length > 0 ? authors : undefined,
    publishedTime: book.publishedAt ?? undefined,
    section,
    tags: tags.length > 0 ? tags : undefined,
  };

  return {
    title,
    description,
    keywords: tags.length > 0 ? tags : undefined,
    authors: authors.length > 0 ? authors.map((name) => ({ name })) : undefined,
    // Only the record's real publisher — PTEC is the provider, not the
    // publisher, and must not be claimed as one.
    publisher: clean(book.publisher) || undefined,
    category: section,
    alternates,
    openGraph,
    twitter: buildTwitter({ card: "summary_large_image", title, description, images: openGraph.images }),
  };
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────

function compact(schema: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema).filter(([, value]) => {
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );
}

export type BookAggregateRating = {
  ratingValue: number | string;
  reviewCount: number;
} | null;

export function bookJsonLd(
  book: BookSeoInput,
  locale: string,
  aggregateRating: BookAggregateRating = null,
  orgArg?: OrgIdentity,
): Record<string, unknown> {
  const org = resolveOrgIdentity(orgArg);
  const url = bookCanonicalUrl(book.slug, locale);
  const authors = (book.authors ?? []).map(clean).filter(Boolean);
  const contributorNodes = resolveContributorNodes(book.contributors, authors, org);
  const publisher = clean(book.publisher);
  const isbn = clean(book.isbn);
  const tags = (book.tags ?? []).filter(Boolean);
  const subjects = [clean(book.department), clean(book.category)].filter(
    (s) => s && s !== "General",
  );
  const pages = book.pages ?? 0;
  // `fileUrl: "present"` because this builder is asked about a book whose
  // page is being rendered; whether a FILE row exists is the page's question,
  // not the markup's. What is being decided here is the POLICY.
  const readableOnline = resolveBookDownloadAccess({
    file_access: book.fileAccess,
    fileUrl: "present",
  }).canReadOnline;

  return compact({
    "@context": "https://schema.org",
    "@type": "Book",
    "@id": `${url}#book`,
    name: book.title,
    url,
    mainEntityOfPage: url,
    // Authors only when actually known — an "Unknown Author" node is
    // fabricated data, not markup.
    author: contributorNodes.length > 0 ? contributorNodes : undefined,
    // The real publisher only. PTEC hosts the file; that role is `provider`.
    publisher: publisher ? { "@type": "Organization", name: publisher } : undefined,
    provider: libraryNode(org),
    inLanguage: languageCode(book.language),
    description: bookMetaDescription(book, locale),
    image: book.coverUrl || FALLBACK_OG_IMAGE,
    isbn: isbn && isbn !== "N/A" ? isbn : undefined,
    // pages <= 1 is the legacy "unknown" default — never emit it as a fact.
    numberOfPages: pages > 1 ? pages : undefined,
    datePublished: book.publishedAt || undefined,
    about: subjects.length > 0 ? subjects : undefined,
    keywords: tags.length > 0 ? tags.join(", ") : undefined,
    bookFormat: "https://schema.org/EBook",
    // A catalogue-record-only book (0151) is one the library holds a record
    // for and distributes no file for, so BOTH of these claims would be
    // false: it cannot be read here, free or otherwise.
    //
    // They are DROPPED rather than negated. `isAccessibleForFree: false` says
    // "there is a paywall", and a ReadAction pointing at a page with no
    // reader is an entry point to nothing — both are assertions this library
    // cannot support, and omitting an unknown beats defaulting it (skill
    // rule 5). Every descriptive field stays, so the record is still fully
    // indexed as metadata.
    ...(readableOnline
      ? {
          isAccessibleForFree: true,
          potentialAction: {
            "@type": "ReadAction",
            target: { "@type": "EntryPoint", urlTemplate: url },
          },
        }
      : {}),
    aggregateRating:
      aggregateRating && aggregateRating.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: String(aggregateRating.ratingValue),
            reviewCount: aggregateRating.reviewCount,
          }
        : undefined,
  });
}

export type CollectionBookItem = { slug: string; title: string };

/** CollectionPage + ItemList for /books (any page, any locale).
 *  The schema URL equals the page's canonical URL (including ?page=N), the
 *  ItemList covers exactly the books visible on this page with absolute
 *  positions across the pagination, and numberOfItems is the full collection
 *  (result) count. */
export function booksCollectionJsonLd({
  locale,
  page,
  pageSize,
  total,
  name,
  description,
  books,
  org: orgArg,
}: {
  locale: string;
  page: number;
  pageSize: number;
  total: number;
  name: string;
  description: string;
  books: CollectionBookItem[];
  /** Resolved published identity — `await getOrgIdentity()`. */
  org?: OrgIdentity;
}): Record<string, unknown> {
  const org = resolveOrgIdentity(orgArg);
  const url = booksCollectionUrl(locale, page);
  const offset = (Math.max(1, page) - 1) * pageSize;

  return compact({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    name,
    description,
    url,
    isAccessibleForFree: true,
    inLanguage: locale === "km" ? "km" : "en",
    provider: libraryNode(org),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListElement: books.map((book, i) => ({
        "@type": "ListItem",
        position: offset + i + 1,
        name: book.title,
        url: bookCanonicalUrl(book.slug, locale),
      })),
    },
  });
}

// ── Sitemap helpers ──────────────────────────────────────────────────────────

/** First parseable date among the candidates, or undefined when none is
 *  trustworthy — untruthful `lastmod` values (deploy time, publication year)
 *  are worse for crawlers than no lastmod at all. */
export function sitemapLastmod(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const raw of candidates) {
    if (!raw) continue;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return raw;
  }
  return undefined;
}
