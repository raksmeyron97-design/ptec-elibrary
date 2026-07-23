// Pure, typed, browser-safe SEO builders for the learning-paths collection
// (/paths, /paths/[slug] and their /km equivalents).
// Unit-tested in learning-path-seo.test.ts — no server-only imports.
//
// Accuracy rules (do not weaken):
//   * Khmer pages use title_km/description_km when present — NEVER the English
//     string with a /km URL.
//   * No invented course facts: timeRequired is emitted only when real step
//     durations exist; educationalLevel only from the record's audience.

import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { libraryNode, organizationNode } from "@/lib/seo/org-nodes";
import {
  resolveOrgIdentity,
  type OrgIdentity,
} from "@/lib/system-settings/org-identity";
import { localeAlternates } from "@/lib/seo/alternates";

export const FALLBACK_OG_IMAGE = `${SITE_URL}/og-default.png`;

// ── Types ────────────────────────────────────────────────────────────────────

export type LearningPathStepSeoInput = {
  title?: string | null;
  url?: string | null;
  estMinutes?: number | null;
};

export type LearningPathModuleSeoInput = {
  title: string;
  titleKm?: string | null;
  steps?: LearningPathStepSeoInput[];
};

export type LearningPathSeoInput = {
  slug: string;
  title: string;
  titleKm?: string | null;
  description?: string | null;
  descriptionKm?: string | null;
  audience?: string | null;
  coverUrl?: string | null;
  language?: string | null;
  dateCreated?: string | null;
  dateModified?: string | null;
  modules?: LearningPathModuleSeoInput[];
};

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

// ── Localized fields ─────────────────────────────────────────────────────────

export function pathLocalizedTitle(path: LearningPathSeoInput, locale: string): string {
  return (locale === "km" && clean(path.titleKm)) || clean(path.title);
}

export function pathLocalizedDescription(path: LearningPathSeoInput, locale: string): string {
  // Use the description for THIS locale only. A Khmer page must never fall back
  // to the English description just because the Khmer one is missing — that is
  // the exact "not really localized" bug; the generated localized sentence below
  // is a better (in-language, factual) fallback.
  const own = locale === "km" ? clean(path.descriptionKm) : clean(path.description);
  if (own) return own;
  const title = pathLocalizedTitle(path, locale);
  return locale === "km"
    ? `${title} — ផ្លូវសិក្សាដែលបានរៀបចំពីធនធានក្នុងបណ្ណាល័យឌីជីថល វ.គ.ភ សម្រាប់គ្រូបង្រៀន និងនិស្សិតគរុកោសល្យ។`
    : `${title} — a curated learning path from the PTEC Digital Library's own collection for teacher trainees and in-service teachers.`;
}

// ── Canonical URLs ───────────────────────────────────────────────────────────

export function pathCanonicalUrl(slug: string, locale: string): string {
  return locale === "km" ? `${SITE_URL}/km/paths/${slug}` : `${SITE_URL}/paths/${slug}`;
}

export function pathsCollectionUrl(locale: string): string {
  return locale === "km" ? `${SITE_URL}/km/paths` : `${SITE_URL}/paths`;
}

// ── Metadata (generateMetadata) ──────────────────────────────────────────────

export function buildPathMetadata(
  path: LearningPathSeoInput,
  locale: string,
  orgArg?: OrgIdentity,
): Metadata {
  const org = resolveOrgIdentity(orgArg);
  const alternates = localeAlternates(`/paths/${path.slug}`, locale);
  const canonicalUrl = alternates.canonical;
  const title = pathLocalizedTitle(path, locale);
  const description = pathLocalizedDescription(path, locale);
  const image = path.coverUrl || FALLBACK_OG_IMAGE;
  const imageAlt = locale === "km" ? `ផ្លូវសិក្សា៖ ${title}` : `Learning path: ${title}`;

  return {
    title,
    description,
    alternates,
    openGraph: {
      title,
      description,
      type: "article",
      url: canonicalUrl,
      siteName: org.siteName,
      locale: locale === "km" ? "km_KH" : "en_US",
      alternateLocale: locale === "km" ? "en_US" : "km_KH",
      modifiedTime: path.dateModified ?? undefined,
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

export function buildPathsListingMetadata(
  locale: string,
  { title, description }: { title: string; description: string },
  orgArg?: OrgIdentity,
): Metadata {
  const org = resolveOrgIdentity(orgArg);
  const alternates = localeAlternates("/paths", locale);
  return {
    title,
    description,
    alternates,
    openGraph: {
      title: `${title} | ${org.libraryName}`,
      description,
      type: "website",
      url: alternates.canonical,
      siteName: org.siteName,
      locale: locale === "km" ? "km_KH" : "en_US",
      alternateLocale: locale === "km" ? "en_US" : "km_KH",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${org.libraryName}`,
      description,
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


/** Sum real step durations → ISO-8601 duration, or undefined when none exist
 *  (never invent a timeRequired). */
function totalDuration(path: LearningPathSeoInput): string | undefined {
  let minutes = 0;
  for (const mod of path.modules ?? []) {
    for (const step of mod.steps ?? []) {
      if (step.estMinutes && step.estMinutes > 0) minutes += step.estMinutes;
    }
  }
  return minutes > 0 ? `PT${minutes}M` : undefined;
}

/** Course JSON-LD for a learning-path detail page. Only truthful facts. */
export function pathCourseJsonLd(
  path: LearningPathSeoInput,
  locale: string,
  orgArg?: OrgIdentity,
): Record<string, unknown> {
  const org = resolveOrgIdentity(orgArg);
  const url = pathCanonicalUrl(path.slug, locale);
  const audience = clean(path.audience);
  const modules = path.modules ?? [];

  return compact({
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": `${url}#course`,
    name: pathLocalizedTitle(path, locale),
    description: pathLocalizedDescription(path, locale),
    url,
    mainEntityOfPage: url,
    provider: organizationNode(org),
    inLanguage: locale === "km" ? "km" : path.language || "en",
    image: path.coverUrl || undefined,
    educationalLevel: audience || undefined,
    audience: audience ? { "@type": "EducationalAudience", educationalRole: audience } : undefined,
    timeRequired: totalDuration(path),
    isAccessibleForFree: true,
    dateCreated: path.dateCreated || undefined,
    dateModified: path.dateModified || undefined,
    numberOfCredits: undefined,
    hasPart: modules.length > 0
      ? modules.map((mod, i) =>
          compact({
            "@type": "Syllabus",
            position: i + 1,
            name: (locale === "km" && clean(mod.titleKm)) || clean(mod.title),
            numberOfItems: (mod.steps ?? []).length || undefined,
          }),
        )
      : undefined,
  });
}

/** CollectionPage + ItemList for /paths (and /km/paths). */
export function pathsCollectionJsonLd({
  locale,
  name,
  description,
  paths,
  org: orgArg,
}: {
  locale: string;
  name: string;
  description: string;
  paths: LearningPathSeoInput[];
  /** Resolved published identity — `await getOrgIdentity()`. */
  org?: OrgIdentity;
}): Record<string, unknown> {
  const org = resolveOrgIdentity(orgArg);
  const url = pathsCollectionUrl(locale);
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
      numberOfItems: paths.length,
      itemListElement: paths.map((path, i) =>
        compact({
          "@type": "ListItem",
          position: i + 1,
          url: pathCanonicalUrl(path.slug, locale),
          item: compact({
            "@type": "Course",
            "@id": `${pathCanonicalUrl(path.slug, locale)}#course`,
            name: pathLocalizedTitle(path, locale),
            description: pathLocalizedDescription(path, locale),
            url: pathCanonicalUrl(path.slug, locale),
            provider: organizationNode(org),
            educationalLevel: clean(path.audience) || undefined,
          }),
        }),
      ),
    },
  });
}
