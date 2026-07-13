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
import { SITE_URL, PTEC_NAME, PTEC_LIBRARY_NAME } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";

export const FALLBACK_OG_IMAGE = `${SITE_URL}/og-default.png`;

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
  pages?: number | null;
  /** Verified author names only — pass [] when the author is unknown. */
  authors?: string[];
  department?: string | null;
  category?: string | null;
  tags?: string[] | null;
};

// ── Language codes ───────────────────────────────────────────────────────────

/** BCP-47 code for the human-readable language names stored in books.language.
 *  Returns undefined for unrecognized values — omitting inLanguage is better
 *  than emitting a wrong "en". */
export function languageCode(language: string | null | undefined): string | undefined {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) return undefined;
  const map: Record<string, string> = {
    khmer: "km",
    km: "km",
    english: "en",
    en: "en",
    french: "fr",
    fr: "fr",
  };
  return map[normalized];
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
  if (locale === "km") {
    const byline = authors.length > 0 ? ` ដោយ ${authors.join(", ")}` : "";
    return `${clean(book.title)}${byline} — សៀវភៅឌីជីថលឥតគិតថ្លៃក្នុងបណ្ណាល័យឌីជីថល វ.គ.ភ។ អានតាមអ៊ីនធឺណិត ឬទាញយកជា PDF ដោយឥតគិតថ្លៃ។`;
  }
  const byline = authors.length > 0 ? ` by ${authors.join(", ")}` : "";
  const subjectPart = subject && subject !== "General" ? ` ${subject}` : "";
  const languagePart = book.language ? ` (${clean(book.language)})` : "";
  return `${clean(book.title)}${byline} — a free${subjectPart} e-book in the PTEC Digital Library. Read online or download the PDF${languagePart}.`;
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

export function buildBookMetadata(book: BookSeoInput, locale: string): Metadata {
  const description = bookMetaDescription(book, locale);
  const authors = (book.authors ?? []).map(clean).filter(Boolean);
  const alternates = localeAlternates(`/books/${book.slug}`, locale);
  const canonicalUrl = alternates.canonical;
  const tags = (book.tags ?? []).filter(Boolean);
  const section = clean(book.department) || clean(book.category) || "Books";
  const image = book.coverUrl || FALLBACK_OG_IMAGE;
  const imageAlt =
    book.coverUrl
      ? (locale === "km" ? `ក្របសៀវភៅ៖ ${book.title}` : `Book cover: ${book.title}`)
      : PTEC_LIBRARY_NAME;

  return {
    title: book.title,
    description,
    keywords: tags.length > 0 ? tags : undefined,
    authors: authors.length > 0 ? authors.map((name) => ({ name })) : undefined,
    // Only the record's real publisher — PTEC is the provider, not the
    // publisher, and must not be claimed as one.
    publisher: clean(book.publisher) || undefined,
    category: section,
    alternates,
    openGraph: {
      title: book.title,
      description,
      type: "article",
      url: canonicalUrl,
      siteName: PTEC_LIBRARY_NAME,
      locale: locale === "km" ? "km_KH" : "en_US",
      alternateLocale: locale === "km" ? "en_US" : "km_KH",
      authors: authors.length > 0 ? authors : undefined,
      publishedTime: book.publishedAt ?? undefined,
      section,
      tags: tags.length > 0 ? tags : undefined,
      images: [
        book.coverUrl
          ? { url: book.coverUrl, width: 800, height: 1200, alt: imageAlt }
          : { url: FALLBACK_OG_IMAGE, width: 1200, height: 630, alt: imageAlt },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: book.title,
      description,
      images: [image],
    },
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

const ptecOrganization = {
  "@type": "EducationalOrganization",
  name: PTEC_NAME,
  url: SITE_URL,
};

const libraryProvider = {
  "@type": "Library",
  name: PTEC_LIBRARY_NAME,
  url: SITE_URL,
  parentOrganization: ptecOrganization,
};

export type BookAggregateRating = {
  ratingValue: number | string;
  reviewCount: number;
} | null;

export function bookJsonLd(
  book: BookSeoInput,
  locale: string,
  aggregateRating: BookAggregateRating = null,
): Record<string, unknown> {
  const url = bookCanonicalUrl(book.slug, locale);
  const authors = (book.authors ?? []).map(clean).filter(Boolean);
  const publisher = clean(book.publisher);
  const isbn = clean(book.isbn);
  const tags = (book.tags ?? []).filter(Boolean);
  const subjects = [clean(book.department), clean(book.category)].filter(
    (s) => s && s !== "General",
  );
  const pages = book.pages ?? 0;

  return compact({
    "@context": "https://schema.org",
    "@type": "Book",
    "@id": `${url}#book`,
    name: book.title,
    url,
    mainEntityOfPage: url,
    // Authors only when actually known — an "Unknown Author" node is
    // fabricated data, not markup.
    author: authors.length > 0 ? authors.map((name) => ({ "@type": "Person", name })) : undefined,
    // The real publisher only. PTEC hosts the file; that role is `provider`.
    publisher: publisher ? { "@type": "Organization", name: publisher } : undefined,
    provider: libraryProvider,
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
    isAccessibleForFree: true,
    potentialAction: {
      "@type": "ReadAction",
      target: { "@type": "EntryPoint", urlTemplate: url },
    },
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
}: {
  locale: string;
  page: number;
  pageSize: number;
  total: number;
  name: string;
  description: string;
  books: CollectionBookItem[];
}): Record<string, unknown> {
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
    provider: libraryProvider,
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
