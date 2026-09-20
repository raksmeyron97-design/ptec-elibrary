// Pure, typed, browser-safe SEO builders for the scholarly-article collection
// (/journals, /journals/articles/[slug] and their /km equivalents). The
// collection was /publications until 0148 — see docs/JOURNALS-ARCHITECTURE.md;
// the builder keeps its name because `publications` is still the table.
// Unit-tested in publication-seo.test.ts — no server-only imports.
//
// Accuracy rules (do not weaken):
//   * DOI / ISSN / license are VALIDATED (lib/seo/identifiers.ts) before they
//     reach schema — a placeholder like `10.1234/eds`, `001` or `CC BY 44` is
//     omitted entirely, never published.
//   * A reviewed book's ISBN is NOT the article's own identifier: this builder
//     never asserts a book ISBN as a ScholarlyArticle identifier.
//   * `isAccessibleForFree`/`license` are emitted only when a redistributable
//     license is verified, or the publisher is PTEC's own institutional output.
//     Third-party ©content with no verified open license is NOT claimed as
//     open access.

import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { resolveContributorNodes } from "@/lib/seo/contributor";
import type { ResourceContributorView } from "@/lib/resources/contributor-view";
import { libraryNode, organizationNode } from "@/lib/seo/org-nodes";
import {
  resolveOrgIdentity,
  type OrgIdentity,
} from "@/lib/system-settings/org-identity";
import { localeAlternates } from "@/lib/seo/alternates";
import { buildOpenGraph, buildTwitter, OG_FALLBACK_IMAGE } from "@/lib/seo/open-graph";
import { normalizeDoi, doiUrl, normalizeIssn, normalizeLicense } from "@/lib/seo/identifiers";
import { languageCode } from "@/lib/seo/book-seo";
import { articlePath, JOURNALS_PATH } from "@/lib/journals/urls";
import { partOfChain, type IssueSeoRef, type JournalSeoRef } from "@/lib/seo/journal-seo";

/** Re-exported so existing importers keep one constant, not a second copy. */
export const FALLBACK_OG_IMAGE = OG_FALLBACK_IMAGE;

// ── Types ────────────────────────────────────────────────────────────────────

export type PublicationSeoInput = {
  slug: string;
  title: string;
  titleKm?: string | null;
  /** Plain-text abstract (already stripped of markup/citation markers). */
  abstractText?: string | null;
  authors?: string[];
  /**
   * Resolved contributor credits (SEO 3.2). When present these are used
   * VERBATIM — already separated, already typed by the canonical graph — and
   * `authors` is left to the human-readable text (meta description, byline).
   * Absent, the builder falls back to classifying `authors` itself, which is
   * what every pre-3.2 caller still does.
   */
  contributors?: readonly ResourceContributorView[] | null;
  journalName?: string | null;
  volume?: string | null;
  issue?: string | null;
  pageStart?: string | null;
  pageEnd?: string | null;
  doi?: string | null;
  issn?: string | null;
  /** The article's OWN publication date (not the repository import date). */
  publicationDate?: string | null;
  dateModified?: string | null;
  keywords?: string[];
  subjects?: string[];
  publisher?: string | null;
  license?: string | null;
  copyright?: string | null;
  language?: string | null;
  coverUrl?: string | null;
  /**
   * The canonical journal (and issue) the article belongs to (0148), when it
   * is mapped to a PUBLIC journal. Present → `isPartOf` is the full
   * Issue → Volume → Periodical chain with the same @ids the journal and
   * issue pages declare. Absent → the pre-0148 Periodical built from the
   * article's own journal text, exactly as before.
   */
  journalRef?: (JournalSeoRef & { issue?: IssueSeoRef | null }) | null;
};

// ── Canonical URLs ───────────────────────────────────────────────────────────

export function publicationCanonicalUrl(slug: string, locale: string): string {
  return locale === "km"
    ? `${SITE_URL}/km${articlePath(slug)}`
    : `${SITE_URL}${articlePath(slug)}`;
}

export function publicationsCollectionUrl(locale: string, page = 1): string {
  const base = locale === "km" ? `${SITE_URL}/km${JOURNALS_PATH}` : `${SITE_URL}${JOURNALS_PATH}`;
  return page > 1 ? `${base}?page=${page}` : base;
}

// ── Rights helpers ───────────────────────────────────────────────────────────

/** True when the publisher is PTEC's own institutional output (or unknown, which
 *  in this repository means PTEC-hosted own content), vs a third-party ©holder. */
export function isInstitutionalPublisher(publisher: string | null | undefined): boolean {
  const p = publisher?.trim();
  if (!p) return true;
  return /ptec|phnom penh teacher/i.test(p);
}

/** Whether the full text may be presented as free-to-access. Only true when a
 *  redistributable license is verified OR the work is PTEC's own output. */
export function isFreelyAccessible(pub: PublicationSeoInput): boolean {
  const license = normalizeLicense(pub.license);
  if (license?.redistributable) return true;
  if (license && !license.redistributable) return false;
  return isInstitutionalPublisher(pub.publisher);
}

// ── Description fallbacks (localized, factual) ────────────────────────────────

const MAX_META_DESCRIPTION = 157;

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function truncate(text: string): string {
  return text.length > MAX_META_DESCRIPTION ? `${text.slice(0, MAX_META_DESCRIPTION)}...` : text;
}

// Journal article titles routinely exceed 100 chars; the <title> tag (plus the
// "· PTEC Library" template suffix) gets a word-boundary cut. og/twitter/JSON-LD
// keep the full title.
const MAX_TITLE_TAG = 60;

export function truncateTitleTag(text: string): string {
  if (text.length <= MAX_TITLE_TAG) return text;
  const cut = text.slice(0, MAX_TITLE_TAG + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : MAX_TITLE_TAG).trimEnd()}…`;
}

export function publicationFallbackDescription(pub: PublicationSeoInput, locale: string): string {
  const title = locale === "km" && pub.titleKm ? clean(pub.titleKm) : clean(pub.title);
  const authors = (pub.authors ?? []).map(clean).filter(Boolean);
  const journal = clean(pub.journalName);
  if (locale === "km") {
    const byline = authors.length > 0 ? ` ដោយ ${authors.join(", ")}` : "";
    const journalPart = journal ? ` បោះពុម្ពក្នុងទស្សនាវដ្តី ${journal}។` : "";
    return `${title}${byline} — អត្ថបទសិក្សាក្នុងបណ្ណាល័យ វ.គ.ភ។${journalPart} អានអត្ថបទសង្ខេប ឯកសារយោង និងវិធីស្រង់សម្រង់។`;
  }
  const byline = authors.length > 0 ? ` by ${authors.join(", ")}` : "";
  const journalPart = journal ? ` Published in ${journal}.` : "";
  return `${title}${byline} — an academic article in the PTEC Library.${journalPart} Read the abstract, references, and citation details.`;
}

export function publicationMetaDescription(pub: PublicationSeoInput, locale: string): string {
  const abstract = clean(pub.abstractText);
  if (abstract.length >= 70) return truncate(abstract);
  if (abstract) {
    return truncate(`${abstract.replace(/[.。។]\s*$/, "")}. ${publicationFallbackDescription(pub, locale)}`);
  }
  return truncate(publicationFallbackDescription(pub, locale));
}

// ── Detail metadata (generateMetadata) ───────────────────────────────────────

export function buildPublicationMetadata(
  pub: PublicationSeoInput,
  locale: string,
  overrides?: { seoTitle?: string | null; seoDescription?: string | null; ogImage?: string | null },
  orgArg?: OrgIdentity,
): Metadata {
  const org = resolveOrgIdentity(orgArg);
  const alternates = localeAlternates(articlePath(pub.slug), locale);
  const canonicalUrl = alternates.canonical;
  // Admin override wins; otherwise the localized article title. A blank
  // override falls back so an empty field never blanks the tag.
  const autoTitle = locale === "km" && pub.titleKm ? clean(pub.titleKm) : pub.title;
  const title = clean(overrides?.seoTitle) || autoTitle;
  const description = clean(overrides?.seoDescription) || publicationMetaDescription(pub, locale);
  const authors = (pub.authors ?? []).map(clean).filter(Boolean);
  const keywords = [...new Set([...(pub.keywords ?? []), ...(pub.subjects ?? [])])].filter(Boolean);
  // No `|| FALLBACK_OG_IMAGE` here — buildOpenGraph owns the fallback, so the
  // "Article cover" alt can never end up labelling the shared site card.
  const cover = clean(overrides?.ogImage) || clean(pub.coverUrl);
  const imageAlt = locale === "km" ? `គម្របអត្ថបទ៖ ${title}` : `Article cover: ${title}`;

  const openGraph = {
    ...buildOpenGraph({
      locale,
      org,
      title,
      description,
      type: "article" as const,
      url: canonicalUrl,
      image: cover,
      imageAlt,
    }),
    authors: authors.length > 0 ? authors : undefined,
    publishedTime: pub.publicationDate ?? undefined,
    modifiedTime: pub.dateModified ?? undefined,
    tags: keywords.length > 0 ? keywords : undefined,
  };

  return {
    // The override is already the admin's final choice — only the auto title
    // gets length-clamped for the <title> tag.
    title: clean(overrides?.seoTitle) || truncateTitleTag(autoTitle),
    description,
    keywords: keywords.length > 0 ? keywords : undefined,
    authors: authors.length > 0 ? authors.map((name) => ({ name })) : undefined,
    // The article's REAL publisher only — never PTEC-as-host for a third-party
    // journal article.
    publisher: clean(pub.publisher) || undefined,
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

export type PublicationAggregateRating = { ratingValue: number | string; reviewCount: number } | null;

/**
 * ScholarlyArticle JSON-LD for a publication detail page, with every academic
 * identifier validated. Placeholder DOI/ISSN/license values never reach the
 * output. The reviewed-book ISBN is deliberately NOT asserted as the article's
 * identifier.
 */
export function publicationJsonLd(
  pub: PublicationSeoInput,
  locale: string,
  aggregateRating: PublicationAggregateRating = null,
  orgArg?: OrgIdentity,
): Record<string, unknown> {
  const org = resolveOrgIdentity(orgArg);
  const url = publicationCanonicalUrl(pub.slug, locale);
  const authors = (pub.authors ?? []).map(clean).filter(Boolean);
  const contributorNodes = resolveContributorNodes(pub.contributors, authors, org);
  const keywords = [...new Set([...(pub.keywords ?? []), ...(pub.subjects ?? [])])].filter(Boolean);
  const doi = normalizeDoi(pub.doi);
  const issn = normalizeIssn(pub.issn);
  const license = normalizeLicense(pub.license);
  const freelyAccessible = isFreelyAccessible(pub);
  const title = pub.title;

  const identifiers: Record<string, unknown>[] = [];
  if (doi) identifiers.push({ "@type": "PropertyValue", propertyID: "DOI", value: doi });

  return compact({
    "@context": "https://schema.org",
    "@type": "ScholarlyArticle",
    "@id": `${url}#article`,
    headline: title,
    name: title,
    url,
    mainEntityOfPage: url,
    author: contributorNodes.length > 0 ? contributorNodes : undefined,
    // Third-party journal article → its real publisher; PTEC is only the provider.
    publisher: clean(pub.publisher)
      ? { "@type": "Organization", name: clean(pub.publisher) }
      : organizationNode(org),
    provider: libraryNode(org),
    inLanguage: languageCode(pub.language) ?? (pub.language || undefined),
    abstract: clean(pub.abstractText) || undefined,
    description: clean(pub.abstractText) || publicationFallbackDescription(pub, locale),
    image: pub.coverUrl || FALLBACK_OG_IMAGE,
    // The article's OWN date — never the repository import timestamp.
    datePublished: pub.publicationDate || undefined,
    dateModified: pub.dateModified || undefined,
    keywords: keywords.length > 0 ? keywords.join(", ") : undefined,
    isPartOf: pub.journalRef
      ? partOfChain(pub.journalRef, locale, {
          issue: pub.journalRef.issue ?? null,
          volumeNumber: pub.volume,
          fallbackIssn: pub.issn,
        })
      : pub.journalName
        ? compact({
            "@type": "Periodical",
            name: clean(pub.journalName),
            issn: issn ?? undefined,
          })
        : undefined,
    volumeNumber: clean(pub.volume) || undefined,
    issueNumber: clean(pub.issue) || undefined,
    pagination:
      pub.pageStart && pub.pageEnd
        ? `${clean(pub.pageStart)}-${clean(pub.pageEnd)}`
        : clean(pub.pageStart) || undefined,
    identifier: identifiers.length > 0 ? identifiers : undefined,
    sameAs: doiUrl(pub.doi) ?? undefined,
    // Only a VERIFIED redistributable license — never `CC BY 44`.
    license: license?.redistributable ? license.url : undefined,
    copyrightNotice: clean(pub.copyright) || undefined,
    // Do NOT claim open access for third-party ©content without a verified license.
    isAccessibleForFree: freelyAccessible,
    aggregateRating:
      aggregateRating && aggregateRating.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: String(aggregateRating.ratingValue),
            reviewCount: aggregateRating.reviewCount,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
  });
}

// ── Collection JSON-LD (CollectionPage + ItemList) ───────────────────────────

export type CollectionPublicationItem = {
  slug: string;
  title: string;
  authors?: string[];
  journalName?: string | null;
  year?: string | null;
  doi?: string | null;
};

export function publicationsCollectionJsonLd({
  locale,
  page = 1,
  pageSize,
  total,
  name,
  description,
  publications,
  org: orgArg,
}: {
  locale: string;
  page?: number;
  pageSize: number;
  total: number;
  name: string;
  description: string;
  publications: CollectionPublicationItem[];
  /** Resolved published identity — `await getOrgIdentity()`. */
  org?: OrgIdentity;
}): Record<string, unknown> {
  const org = resolveOrgIdentity(orgArg);
  const url = publicationsCollectionUrl(locale, page);
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
      itemListElement: publications.map((pub, i) => {
        const authors = (pub.authors ?? []).map(clean).filter(Boolean);
        // A LISTING item is deliberately not wired to the graph: resolving
        // credits per row is one query per result (§36 N+1). The page's own
        // detail URL carries the canonical answer; the list carries the byline.
        const contributorNodes = resolveContributorNodes(null, authors, org);
        const doi = normalizeDoi(pub.doi);
        const itemUrl = publicationCanonicalUrl(pub.slug, locale);
        return compact({
          "@type": "ListItem",
          position: offset + i + 1,
          url: itemUrl,
          item: compact({
            "@type": "ScholarlyArticle",
            "@id": `${itemUrl}#article`,
            headline: pub.title,
            name: pub.title,
            url: itemUrl,
            author: contributorNodes.length > 0 ? contributorNodes : undefined,
            datePublished: pub.year || undefined,
            isPartOf: pub.journalName ? { "@type": "Periodical", name: clean(pub.journalName) } : undefined,
            identifier: doi ? { "@type": "PropertyValue", propertyID: "DOI", value: doi } : undefined,
          }),
        });
      }),
    },
  });
}
