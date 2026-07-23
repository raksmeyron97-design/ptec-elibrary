// Pure, typed, browser-safe SEO builders for the theses collection (/theses,
// /theses/[slug] and their /km equivalents). Mirrors lib/seo/book-seo.ts.
// Unit-tested in thesis-seo.test.ts — no server-only imports.
//
// Accuracy rules (do not weaken):
//   * PTEC IS the degree-granting institution for these student theses, so it
//     is a legitimate `publisher`/`sourceOrganization` here (unlike books).
//   * Never fabricate authors — an "Unknown Author" node is data, not markup.
//   * DOIs are validated before entering schema (lib/seo/identifiers.ts).
//   * References are completeness-filtered (lib/seo/references.ts) so PDF-wrap
//     fragments never become schema.org citations.
//   * Schema URLs always match the page's canonical URL for the current locale.

import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { libraryNode, organizationNode } from "@/lib/seo/org-nodes";
import {
  resolveOrgIdentity,
  type OrgIdentity,
} from "@/lib/system-settings/org-identity";
import { localeAlternates } from "@/lib/seo/alternates";
import { normalizeDoi } from "@/lib/seo/identifiers";
import { schemaCitations } from "@/lib/seo/references";
import { languageCode } from "@/lib/seo/book-seo";

export const FALLBACK_OG_IMAGE = `${SITE_URL}/og-default.png`;

// ── Generic-title detection ──────────────────────────────────────────────────

/** Titles too generic to publish as an academic record's canonical title.
 *  Compared case-insensitively after trimming trailing punctuation. Covers the
 *  live English + Khmer offenders ("Report" / "របាយការណ៍"). */
const GENERIC_TITLES = new Set([
  "report",
  "reports",
  "thesis",
  "theses",
  "dissertation",
  "research",
  "research report",
  "research paper",
  "final report",
  "final thesis",
  "capstone",
  "capstone project",
  "project",
  "untitled",
  "no title",
  "document",
  "paper",
  // Khmer
  "របាយការណ៍",
  "និក្ខេបបទ",
  "ការស្រាវជ្រាវ",
  "គម្រោង",
  "ឯកសារ",
  "អត្ថបទ",
]);

/**
 * True when a thesis title is too generic to be an acceptable canonical title
 * for academic discovery. Used to warn admins and block publication of new
 * records with placeholder titles (an authorized exception can override).
 */
export function isGenericThesisTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  const normalized = title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.。？?！!]+$/u, "")
    .toLowerCase();
  if (!normalized) return true;
  if (GENERIC_TITLES.has(normalized)) return true;
  // A single short Latin word ("Report", "Untitled") is almost never a real
  // academic title; Khmer generic words are covered by the set above.
  if (/^[a-z]+$/.test(normalized) && normalized.length <= 12) return true;
  return false;
}

// ── Canonical URLs ───────────────────────────────────────────────────────────

export function thesisCanonicalUrl(slug: string, locale: string): string {
  return locale === "km" ? `${SITE_URL}/km/theses/${slug}` : `${SITE_URL}/theses/${slug}`;
}

export function thesesCollectionUrl(locale: string, page = 1): string {
  const base = locale === "km" ? `${SITE_URL}/km/theses` : `${SITE_URL}/theses`;
  return page > 1 ? `${base}?page=${page}` : base;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type ThesisSeoInput = {
  slug: string;
  title: string;
  abstract?: string | null;
  authors?: string[];
  coverUrl?: string | null;
  /** Real thesis publication/completion date. */
  datePublished?: string | null;
  /** Original work creation date, when distinct from deposit. */
  dateCreated?: string | null;
  /** Last significant metadata/content update. */
  dateModified?: string | null;
  keywords?: string[];
  doi?: string | null;
  department?: string | null;
  program?: string | null;
  /** Human-readable language name ("Khmer" / "English" / …). */
  language?: string | null;
  references?: string[];
};

// ── Description fallbacks (localized, factual) ────────────────────────────────

const MAX_META_DESCRIPTION = 157;

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function truncate(text: string): string {
  return text.length > MAX_META_DESCRIPTION ? `${text.slice(0, MAX_META_DESCRIPTION)}...` : text;
}

/** Factual one-liner built only from verified fields — localized, no invention. */
export function thesisFallbackDescription(
  thesis: ThesisSeoInput,
  locale: string,
  orgArg?: OrgIdentity,
): string {
  const org = resolveOrgIdentity(orgArg);
  const authors = (thesis.authors ?? []).map(clean).filter(Boolean);
  const subject = clean(thesis.department) || clean(thesis.program);
  if (locale === "km") {
    const byline = authors.length > 0 ? ` ដោយ ${authors.join(", ")}` : "";
    const subjectPart = subject ? `ក្នុងវិស័យ${subject} ` : "";
    return `${clean(thesis.title)}${byline} — និក្ខេបបទ${subjectPart}របស់និស្សិត វិទ្យាល័យគរុកោសល្យភ្នំពេញ (វ.គ.ភ)។ អានអត្ថបទសង្ខេប និងទាញយកជា PDF ដោយឥតគិតថ្លៃ។`;
  }
  const byline = authors.length > 0 ? ` by ${authors.join(", ")}` : "";
  const subjectPart = subject ? ` in ${subject}` : "";
  return `${clean(thesis.title)}${byline} — a student thesis${subjectPart} from ${org.institutionName} (${org.abbreviation}). Read the abstract and download the full PDF for free.`;
}

/** Meta description: the abstract when substantial, else the factual fallback. */
export function thesisMetaDescription(
  thesis: ThesisSeoInput,
  locale: string,
  org?: OrgIdentity,
): string {
  const abstract = clean(thesis.abstract);
  if (abstract.length >= 70) return truncate(abstract);
  if (abstract) {
    return truncate(
      `${abstract.replace(/[.。។]\s*$/, "")}. ${thesisFallbackDescription(thesis, locale, org)}`,
    );
  }
  return truncate(thesisFallbackDescription(thesis, locale, org));
}

// ── Detail metadata (generateMetadata) ───────────────────────────────────────

export function buildThesisMetadata(
  thesis: ThesisSeoInput,
  locale: string,
  overrides?: { seoTitle?: string | null; seoDescription?: string | null; ogImage?: string | null },
  orgArg?: OrgIdentity,
): Metadata {
  const org = resolveOrgIdentity(orgArg);
  const alternates = localeAlternates(`/theses/${thesis.slug}`, locale);
  const canonicalUrl = alternates.canonical;
  const title = clean(overrides?.seoTitle) || thesis.title;
  const description =
    clean(overrides?.seoDescription) || thesisMetaDescription(thesis, locale, org);
  const authors = (thesis.authors ?? []).map(clean).filter(Boolean);
  const keywords = (thesis.keywords ?? []).filter(Boolean);
  const section = clean(thesis.department) || clean(thesis.program) || "Theses";
  const image = clean(overrides?.ogImage) || thesis.coverUrl || FALLBACK_OG_IMAGE;
  const imageAlt =
    locale === "km" ? `ក្របនិក្ខេបបទ៖ ${title}` : `Thesis cover: ${title}`;

  return {
    title,
    description,
    keywords: keywords.length > 0 ? keywords : undefined,
    // Only real authors — never a fabricated "Unknown Author".
    authors: authors.length > 0 ? authors.map((name) => ({ name })) : undefined,
    publisher: org.institutionName,
    category: section,
    alternates,
    openGraph: {
      title,
      description,
      type: "article",
      url: canonicalUrl,
      siteName: org.siteName,
      locale: locale === "km" ? "km_KH" : "en_US",
      alternateLocale: locale === "km" ? "en_US" : "km_KH",
      authors: authors.length > 0 ? authors : undefined,
      publishedTime: thesis.datePublished ?? undefined,
      modifiedTime: thesis.dateModified ?? undefined,
      section,
      tags: keywords.length > 0 ? keywords : undefined,
      images: [{ url: image, alt: imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

// ── Detail JSON-LD (ScholarlyArticle) ────────────────────────────────────────

function compact(schema: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema).filter(([, value]) => {
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );
}

export type ThesisAggregateRating = { ratingValue: number | string; reviewCount: number } | null;

/**
 * ScholarlyArticle JSON-LD for a thesis detail page. DOI is validated,
 * references are completeness-filtered, dates are kept distinct, and PTEC is
 * the (legitimate) degree-granting publisher.
 */
export function thesisJsonLd(
  thesis: ThesisSeoInput,
  locale: string,
  orgArg?: OrgIdentity,
): Record<string, unknown> {
  const org = resolveOrgIdentity(orgArg);
  const url = thesisCanonicalUrl(thesis.slug, locale);
  const authors = (thesis.authors ?? []).map(clean).filter(Boolean);
  const keywords = (thesis.keywords ?? []).filter(Boolean);
  const department = clean(thesis.department) || clean(thesis.program);
  const doi = normalizeDoi(thesis.doi);
  const citations = schemaCitations(thesis.references);
  const abstract = clean(thesis.abstract);

  return compact({
    "@context": "https://schema.org",
    "@type": "ScholarlyArticle",
    "@id": `${url}#thesis`,
    headline: thesis.title,
    name: thesis.title,
    url,
    mainEntityOfPage: url,
    author: authors.length > 0 ? authors.map((name) => ({ "@type": "Person", name })) : undefined,
    publisher: organizationNode(org),
    provider: libraryNode(org),
    isPartOf: {
      "@type": "CreativeWorkSeries",
      name: `${org.abbreviation} Student Theses`,
      publisher: organizationNode(org),
    },
    about: department ? { "@type": "Thing", name: department } : undefined,
    inLanguage: languageCode(thesis.language),
    abstract: abstract || undefined,
    description: abstract || thesisFallbackDescription(thesis, locale, org),
    image: thesis.coverUrl || FALLBACK_OG_IMAGE,
    // Distinct, truthful dates — the website upload time is NOT datePublished.
    datePublished: thesis.datePublished || undefined,
    dateCreated: thesis.dateCreated || undefined,
    dateModified: thesis.dateModified || undefined,
    keywords: keywords.length > 0 ? keywords.join(", ") : undefined,
    citation: citations.length > 0 ? citations : undefined,
    identifier: doi ? { "@type": "PropertyValue", propertyID: "DOI", value: doi } : undefined,
    isAccessibleForFree: true,
    potentialAction: { "@type": "ReadAction", target: { "@type": "EntryPoint", urlTemplate: url } },
  });
}

// ── Collection JSON-LD (CollectionPage + ItemList) ───────────────────────────

export type CollectionThesisItem = {
  slug: string;
  title: string;
  authors?: string[];
  year?: string | null;
  program?: string | null;
};

/** Locale-aware CollectionPage + ItemList for /theses (and /km/theses).
 *  Schema URL === the page's canonical URL for the locale; item URLs are
 *  locale-correct; positions are absolute across pagination. */
export function thesesCollectionJsonLd({
  locale,
  page = 1,
  pageSize,
  total,
  name,
  description,
  theses,
  org: orgArg,
}: {
  locale: string;
  page?: number;
  pageSize: number;
  total: number;
  name: string;
  description: string;
  theses: CollectionThesisItem[];
  /** Resolved published identity — `await getOrgIdentity()`. */
  org?: OrgIdentity;
}): Record<string, unknown> {
  const org = resolveOrgIdentity(orgArg);
  const url = thesesCollectionUrl(locale, page);
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
      itemListElement: theses.map((thesis, i) => {
        const authors = (thesis.authors ?? []).map(clean).filter(Boolean);
        return compact({
          "@type": "ListItem",
          position: offset + i + 1,
          url: thesisCanonicalUrl(thesis.slug, locale),
          item: compact({
            "@type": "ScholarlyArticle",
            "@id": `${thesisCanonicalUrl(thesis.slug, locale)}#thesis`,
            headline: thesis.title,
            name: thesis.title,
            url: thesisCanonicalUrl(thesis.slug, locale),
            author: authors.length > 0 ? authors.map((n) => ({ "@type": "Person", name: n })) : undefined,
            datePublished: thesis.year || undefined,
            about: thesis.program ? { "@type": "Thing", name: thesis.program } : undefined,
            isPartOf: { "@type": "CreativeWorkSeries", name: "PTEC Student Theses" },
          }),
        });
      }),
    },
  });
}
