// Pure, typed SEO builders for the journal surfaces (0148):
//   /journals/<journal>                 Periodical
//   /journals/<journal>/issues          CollectionPage over PublicationIssue
//   /journals/<journal>/issues/<issue>  PublicationIssue → PublicationVolume → Periodical
// and the `isPartOf` chain an article's ScholarlyArticle points into.
//
// Accuracy rules — the same ones lib/seo/publication-seo.ts states, applied
// one level up:
//   * Only what the database holds is asserted. A journal with no publisher
//     has no `publisher`; no ISSN is emitted unless it passes its check digit
//     (lib/seo/identifiers.ts). Nothing is inferred from the articles.
//   * Node ids are LOCALE-FREE (the English canonical URL + a fragment). A
//     journal is one entity whichever language the page is read in; the
//     /km page's own URL is still its `url` and canonical.
//   * The article page and the journal/issue pages build these nodes through
//     the SAME functions, so their @ids agree by construction.

import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates, localeUrls } from "@/lib/seo/alternates";
import { normalizeDoi, normalizeIssn } from "@/lib/seo/identifiers";
import { libraryNode } from "@/lib/seo/org-nodes";
import { buildOpenGraph, buildTwitter, OG_FALLBACK_IMAGE } from "@/lib/seo/open-graph";
import { resolveOrgIdentity, type OrgIdentity } from "@/lib/system-settings/org-identity";
import { issuePath, journalIssuesPath, journalPath, articlePath } from "@/lib/journals/urls";

/** Re-exported so existing importers keep one constant, not a second copy. */
export const FALLBACK_JOURNAL_OG_IMAGE = OG_FALLBACK_IMAGE;
const MAX_META_DESCRIPTION = 157;

// ── Inputs ───────────────────────────────────────────────────────────────────

export type JournalSeoRef = {
  slug: string;
  title: string;
  titleKm?: string | null;
  issn?: string | null;
  eIssn?: string | null;
  printIssn?: string | null;
  publisher?: string | null;
};

export type IssueSeoRef = {
  slug: string;
  issueNumber?: string | null;
  volumeNumber?: string | null;
  title?: string | null;
  datePublished?: string | null;
};

// ── URLs / ids ───────────────────────────────────────────────────────────────

const pageUrl = (path: string, locale: string) => (locale === "km" ? localeUrls(path).km : localeUrls(path).en);

export const journalCanonicalUrl = (slug: string, locale: string) => pageUrl(journalPath(slug), locale);
export const issuesCanonicalUrl = (slug: string, locale: string) => pageUrl(journalIssuesPath(slug), locale);
export const issueCanonicalUrl = (journalSlug: string, issueSlug: string, locale: string) =>
  pageUrl(issuePath(journalSlug, issueSlug), locale);

export const periodicalId = (journalSlug: string) => `${SITE_URL}${journalPath(journalSlug)}#periodical`;
export const volumeNodeId = (journalSlug: string, volumeNumber: string) =>
  `${SITE_URL}${journalPath(journalSlug)}#volume-${encodeURIComponent(volumeNumber)}`;
export const issueNodeId = (journalSlug: string, issueSlug: string) =>
  `${SITE_URL}${issuePath(journalSlug, issueSlug)}#issue`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function compact(schema: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema).filter(([, v]) => {
      if (v === undefined || v === null || v === "") return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    }),
  );
}

function truncate(text: string): string {
  return text.length > MAX_META_DESCRIPTION ? `${text.slice(0, MAX_META_DESCRIPTION)}...` : text;
}

/** Every valid, distinct ISSN a journal carries, linking ISSN first. */
export function journalIssns(ref: Pick<JournalSeoRef, "issn" | "eIssn" | "printIssn">): string[] {
  const out: string[] = [];
  for (const raw of [ref.issn, ref.printIssn, ref.eIssn]) {
    const n = normalizeIssn(raw);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

// ── Nodes ────────────────────────────────────────────────────────────────────

/** The Periodical node. `fallbackIssn` is the article's own ISSN, used only when the journal record holds none. */
export function periodicalNode(ref: JournalSeoRef, locale: string, fallbackIssn?: string | null) {
  const issns = journalIssns(ref);
  const fallback = issns.length === 0 ? normalizeIssn(fallbackIssn) : null;
  const all = fallback ? [fallback] : issns;
  return compact({
    "@type": "Periodical",
    "@id": periodicalId(ref.slug),
    name: clean(ref.title),
    alternateName: clean(ref.titleKm) || undefined,
    url: journalCanonicalUrl(ref.slug, locale),
    issn: all.length === 0 ? undefined : all.length === 1 ? all[0] : all,
    publisher: clean(ref.publisher) ? { "@type": "Organization", name: clean(ref.publisher) } : undefined,
  });
}

/**
 * PublicationIssue → PublicationVolume → Periodical, as far as the data goes.
 * An issue with no volume points straight at the Periodical; an article with
 * a volume but no issue gets Volume → Periodical.
 */
export function partOfChain(
  journal: JournalSeoRef,
  locale: string,
  opts: { issue?: IssueSeoRef | null; volumeNumber?: string | null; fallbackIssn?: string | null } = {},
): Record<string, unknown> {
  const periodical = periodicalNode(journal, locale, opts.fallbackIssn);
  const volumeNumber = clean(opts.issue?.volumeNumber ?? opts.volumeNumber);
  const volume = volumeNumber
    ? compact({
        "@type": "PublicationVolume",
        "@id": volumeNodeId(journal.slug, volumeNumber),
        volumeNumber,
        isPartOf: periodical,
      })
    : null;
  if (!opts.issue) return volume ?? periodical;
  return compact({
    "@type": "PublicationIssue",
    "@id": issueNodeId(journal.slug, opts.issue.slug),
    issueNumber: clean(opts.issue.issueNumber) || undefined,
    name: clean(opts.issue.title) || undefined,
    datePublished: opts.issue.datePublished || undefined,
    url: issueCanonicalUrl(journal.slug, opts.issue.slug, locale),
    isPartOf: volume ?? periodical,
  });
}

// ── Journal page ─────────────────────────────────────────────────────────────

export type JournalPageSeoInput = JournalSeoRef & {
  description?: string | null;
  descriptionKm?: string | null;
  language?: string | null;
  coverUrl?: string | null;
  articleCount: number;
  isIndexable: boolean;
};

export function journalDescription(j: JournalPageSeoInput, locale: string): string {
  const own = clean(locale === "km" ? j.descriptionKm || j.description : j.description);
  if (own) return truncate(own);
  const title = clean(locale === "km" && j.titleKm ? j.titleKm : j.title);
  return truncate(
    locale === "km"
      ? `${title} — ទស្សនាវដ្ដីក្នុងបណ្ណាល័យ វ.គ.ភ។ អានអត្ថបទ លេខផ្សាយ និងព័ត៌មានបោះពុម្ព។`
      : `${title} — a scholarly journal in the PTEC Library. Browse its issues and articles.`,
  );
}

export function buildJournalMetadata(j: JournalPageSeoInput, locale: string, orgArg?: OrgIdentity): Metadata {
  const org = resolveOrgIdentity(orgArg);
  const alternates = localeAlternates(journalPath(j.slug), locale);
  const title = clean(locale === "km" && j.titleKm ? j.titleKm : j.title);
  const description = journalDescription(j, locale);
  const openGraph = buildOpenGraph({
    locale,
    org,
    title,
    description,
    type: "website" as const,
    url: alternates.canonical,
    image: j.coverUrl,
    imageAlt: title,
  });
  return {
    title,
    description,
    alternates,
    // A journal page with no public article is an empty shell; one that asked
    // not to be indexed says so. Both still let crawlers follow the links.
    robots: !j.isIndexable || j.articleCount === 0 ? { index: false, follow: true } : undefined,
    openGraph,
    twitter: buildTwitter({ card: "summary_large_image", title, description, images: openGraph.images }),
  };
}

export function journalJsonLd(j: JournalPageSeoInput, locale: string, orgArg?: OrgIdentity): Record<string, unknown> {
  const org = resolveOrgIdentity(orgArg);
  return compact({
    "@context": "https://schema.org",
    ...periodicalNode(j, locale),
    description: clean(locale === "km" ? j.descriptionKm || j.description : j.description) || undefined,
    inLanguage: clean(j.language) || undefined,
    image: j.coverUrl || undefined,
    provider: libraryNode(org),
  });
}

// ── Issues list page ─────────────────────────────────────────────────────────

export function buildIssuesListMetadata(
  j: JournalPageSeoInput,
  locale: string,
  labels: { title: string; description: string },
  issueCount: number,
  orgArg?: OrgIdentity,
): Metadata {
  const org = resolveOrgIdentity(orgArg);
  const alternates = localeAlternates(journalIssuesPath(j.slug), locale);
  // Same card as the journal itself: an issue list IS that journal, so its
  // cover is the honest image. buildJournalMetadata has carried one since the
  // 0148 rework; these two builders in the same file simply never did, so a
  // share of /journals/<j>/issues or of an issue rendered as a bare link.
  //
  // They also never carried og:locale or og:locale:alternate — verified absent
  // on production 2026-09-20 while the journal page one path segment up had
  // both. buildOpenGraph owns all three now, so the three builders in this file
  // cannot drift from each other again.
  const description = truncate(labels.description);
  const openGraph = buildOpenGraph({
    locale,
    org,
    title: labels.title,
    description,
    type: "website" as const,
    url: alternates.canonical,
    image: j.coverUrl,
    imageAlt: labels.title,
  });
  return {
    title: labels.title,
    description,
    alternates,
    robots: !j.isIndexable || issueCount === 0 ? { index: false, follow: true } : undefined,
    openGraph,
    twitter: buildTwitter({
      card: "summary_large_image",
      title: labels.title,
      description,
      images: openGraph.images,
    }),
  };
}

export function issuesListJsonLd(
  j: JournalPageSeoInput,
  locale: string,
  issues: (IssueSeoRef & { label: string })[],
  name: string,
): Record<string, unknown> {
  const url = issuesCanonicalUrl(j.slug, locale);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    name,
    url,
    isPartOf: { "@id": periodicalId(j.slug) },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: issues.length,
      itemListElement: issues.map((issue, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: issueCanonicalUrl(j.slug, issue.slug, locale),
        name: issue.label,
      })),
    },
  };
}

// ── Issue page ───────────────────────────────────────────────────────────────

export type IssueArticleSeoItem = { slug: string; title: string; doi?: string | null; pageStart?: string | null; pageEnd?: string | null };

export function buildIssueMetadata(
  j: JournalPageSeoInput,
  issue: IssueSeoRef & { label: string; description?: string | null },
  locale: string,
  orgArg?: OrgIdentity,
): Metadata {
  const org = resolveOrgIdentity(orgArg);
  const alternates = localeAlternates(issuePath(j.slug, issue.slug), locale);
  const journalTitle = clean(locale === "km" && j.titleKm ? j.titleKm : j.title);
  const title = `${journalTitle} — ${issue.label}`;
  const description = truncate(
    clean(issue.description) ||
      (locale === "km"
        ? `${issue.label} នៃ ${journalTitle}៖ បញ្ជីអត្ថបទ និងព័ត៌មានលេខផ្សាយ។`
        : `${issue.label} of ${journalTitle}: table of contents and issue details.`),
  );
  const openGraph = buildOpenGraph({
    locale,
    org,
    title,
    description,
    type: "website" as const,
    url: alternates.canonical,
    image: j.coverUrl,
    imageAlt: title,
  });
  return {
    title,
    description,
    alternates,
    robots: !j.isIndexable ? { index: false, follow: true } : undefined,
    openGraph,
    twitter: buildTwitter({ card: "summary_large_image", title, description, images: openGraph.images }),
  };
}

export function issueJsonLd(
  j: JournalPageSeoInput,
  issue: IssueSeoRef & { description?: string | null },
  articles: IssueArticleSeoItem[],
  locale: string,
): Record<string, unknown> {
  const chain = partOfChain(j, locale, { issue });
  return compact({
    "@context": "https://schema.org",
    ...chain,
    description: clean(issue.description) || undefined,
    hasPart: articles.map((a) => {
      const url = pageUrl(articlePath(a.slug), locale);
      const doi = normalizeDoi(a.doi);
      return compact({
        "@type": "ScholarlyArticle",
        "@id": `${url}#article`,
        headline: a.title,
        name: a.title,
        url,
        pageStart: clean(a.pageStart) || undefined,
        pageEnd: clean(a.pageEnd) || undefined,
        identifier: doi ? { "@type": "PropertyValue", propertyID: "DOI", value: doi } : undefined,
      });
    }),
  });
}
