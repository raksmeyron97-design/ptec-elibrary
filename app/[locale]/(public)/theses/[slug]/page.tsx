import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { decodeSlugParam } from "@/lib/slug";
import { getThesisPrograms, getThesisFaculties } from "@/app/actions/theses";
import {
  anonymousThesisDecision,
  readRelatedTheses,
  readThesisById,
  readThesisBySlug,
  readThesisContributors,
} from "@/lib/theses/record.server";
import { buildThesisRecord, type RecordLocale, type Translate } from "@/lib/theses/record";
import {
  authorRoleContributors,
  contributorNames,
  type ResourceContributorView,
} from "@/lib/resources/contributor-view";
import { citationNames } from "@/lib/resources/contributor-identity";
import { getKeywords, getReferences, getDoi, getDepartment, getLanguageLabel } from "@/lib/theses/report-fields";
import { SITE_URL } from "@/lib/seo/site";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { isCohortLabel, thesisScholarMeta, type ThesisCitationRow } from "@/lib/seo/citation";
import { thesisIsOpenAccess } from "@/lib/theses/open-access";
import { thesisLicense } from "@/lib/theses/license";

/**
 * A thesis's AUTHORS (SEO Phase 3.3): author-role credits, without a cohort
 * label that rode in on the byline. The 0105 backfill credited the advisor
 * and every comma-separated piece of the byline, so the unfiltered list put
 * advisors and "គរុនិស្សិត ១២+៤ ជំនាន់ទី២" in the byline, the JSON-LD and
 * Google Scholar's citation_author.
 */
function thesisAuthorCredits(views: readonly ResourceContributorView[]): ResourceContributorView[] {
  return authorRoleContributors(views).filter((v) => !isCohortLabel(v.name));
}
import { buildThesisMetadata, thesisJsonLd, type ThesisSeoInput } from "@/lib/seo/thesis-seo";
import PageJsonLd from "@/components/seo/PageJsonLd";
import ResourceConnections from "@/components/seo/ResourceConnections";
import { resolveAuthorLinks } from "@/lib/resources/connections";
import ThesisRecordView from "@/components/ui/theses/record/ThesisRecordView";

/**
 * The LEGACY-byline fallback, used only when the canonical graph has no
 * credits for this thesis. It is the library's one splitter rather than a
 * local `.split(",")`, which cited a single inverted name as two people.
 */
const splitAuthors = citationNames;

// Shared-cached: nothing below reads the session. The viewer's half of the
// access decision and the staff Edit link are resolved in the browser against
// /api/theses/[id]/download-status (components/ui/theses/record/useThesisAccess).
export const revalidate = 3600;

// `revalidate` alone does not cache a dynamic segment: Next 16 renders such a
// path per request unless the page opts into runtime ISR, either with
// generateStaticParams (an empty list builds nothing and caches each thesis
// on its first visit) or with force-static. Without this the page answered
// `private, no-store` in production. An admin edit still reaches it: the row
// read is tagged TAGS.theses, which revalidateThesis() fires.
export function generateStaticParams() {
  return [];
}

type PageProps = { params: Promise<{ slug: string; locale: string }> };

// Legacy /theses/[uuid] URLs. Middleware already issues the 301 for these;
// this page-level lookup is the fallback for anything that slips past the
// middleware matcher, and produces the 404 when the id doesn't exist.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [{ slug: rawSlug, locale }, org] = await Promise.all([params, getOrgIdentity()]);
  // decodeSlugParam is idempotent — normalize in both entry points so the
  // metadata and the body can never resolve to different records.
  const slug = decodeSlugParam(rawSlug);
  // The SAME request-cached row read as the page (lib/theses/record.server.ts),
  // carrying seo_title/seo_description/og_image. A second round-trip here is
  // what once pushed this route's metadata past the shell: Next streams late
  // metadata into <body>, where Lighthouse and head-only crawlers miss it.
  const report = await readThesisBySlug(slug);

  if (!report) {
    // Legacy UUID URLs are handled in the page component (301 or 404); for
    // everything else, throwing here (before the shell streams) makes the
    // response a genuine HTTP 404 instead of a soft 200+noindex.
    if (!UUID_RE.test(slug)) notFound();
    return { title: "Thesis not found" };
  }

  // Canonical credits feed the citation_* meta tags + JSON-LD, consistent with
  // the visible page — the same request-cached read the page makes.
  const metaContributors = await readThesisContributors(report.id, report.author_names ?? null);
  // AUTHORS only (Phase 3.3): the 0105 backfill credited the advisor and
  // every comma-separated piece of the byline, so the full list carried the
  // advisors and a cohort label into citation_author and the JSON-LD author.
  const authorCredits = thesisAuthorCredits(metaContributors.contributors);
  const metaAuthorNames = contributorNames(authorCredits);
  const reportForMeta =
    metaAuthorNames.length > 0 ? { ...report, author_names: metaAuthorNames.join(", ") } : report;

  const seoInput: ThesisSeoInput = {
    slug: report.slug,
    title: report.title,
    abstract: report.abstract,
    authors: metaAuthorNames.length > 0 ? metaAuthorNames : splitAuthors(reportForMeta.author_names),
    contributors: authorCredits,
    coverUrl: report.cover_url,
    // published_at is the academic publication date; the website deposit time
    // (created_at) is NOT used as datePublished. verified_at/updated_at is the
    // last significant metadata change.
    datePublished: report.published_at,
    dateModified: report.verified_at ?? report.updated_at ?? null,
    keywords: getKeywords(report),
    doi: report.doi,
    department: getDepartment(report),
    program: report.program,
    language: getLanguageLabel(report),
  };

  // Admin-set SEO overrides (migration 0076) win when present.
  const base = buildThesisMetadata(
    seoInput,
    locale,
    { seoTitle: report.seo_title, seoDescription: report.seo_description, ogImage: report.og_image },
    org,
  );

  // Google Scholar sees one record per work: the tags go on the page in the
  // work's language only, name this page as the abstract, and name a PDF
  // only when its full text is public (lib/theses/open-access.ts).
  const abstractUrl = typeof base.alternates?.canonical === "string" ? base.alternates.canonical : undefined;
  const scholar = thesisScholarMeta(reportForMeta as ThesisCitationRow, org, {
    locale,
    abstractUrl,
    pdfUrl: abstractUrl && thesisIsOpenAccess(report) ? `${abstractUrl}/fulltext.pdf` : null,
  });

  return {
    ...base,
    // Google Scholar citation_* meta tags — see lib/seo/citation.ts
    other: {
      ...scholar,
      "dc.publisher": org.institutionName,
      "dc.type": "Thesis",
    },
  };
}

export default async function ThesisDetailPage({ params }: PageProps) {
  const { slug: rawSlug, locale: rawLocale } = await params;
  const locale: RecordLocale = rawLocale === "km" ? "km" : "en";
  const slug = decodeSlugParam(rawSlug);
  let report = await readThesisBySlug(slug);

  if (!report && UUID_RE.test(slug)) {
    // Legacy ID URL: 301 to the canonical slug URL, 404 if the id is unknown.
    const byId = await readThesisById(slug);
    if (byId?.slug) permanentRedirect(locale === "km" ? `/km/theses/${byId.slug}` : `/theses/${byId.slug}`);
    report = byId;
  }
  if (!report) notFound();

  const [contributorRead, decision, { data: programs }, { data: faculties }, related, siteConfig, org, tDetail, tTrust, tNav] =
    await Promise.all([
      readThesisContributors(report.id, report.author_names ?? null),
      anonymousThesisDecision(report),
      getThesisPrograms(),
      getThesisFaculties(),
      readRelatedTheses(report),
      getSiteConfig(),
      getOrgIdentity(),
      getTranslations({ locale, namespace: "thesisDetail" }),
      getTranslations({ locale, namespace: "trust" }),
      getTranslations({ locale, namespace: "nav" }),
    ]);

  // Canonical credits (migrations 0104–0109) replace the free-text byline when
  // the graph has them; otherwise the byline is shown as stored.
  // Authors only — the same rule as the metadata above (Phase 3.3); the
  // advisors have their own line in the title block.
  const authorCredits = thesisAuthorCredits(contributorRead.contributors);
  const canonicalAuthors = contributorNames(authorCredits);
  const byline = typeof report.author_names === "string" ? report.author_names.trim() : "";
  const displayAuthorNames = canonicalAuthors.length > 0 ? canonicalAuthors.join(", ") : byline;

  // Every label and fact on the page is resolved here, once (lib/theses/record.ts).
  const t: Translate = (key, values) => tDetail(key as never, values as never);
  const tLicence: Translate = (key, values) => tTrust(key as never, values as never);
  const record = buildThesisRecord({
    row: report,
    locale,
    authors: canonicalAuthors.length > 0 ? canonicalAuthors : byline ? [byline] : [],
    canonicalAuthors,
    programs,
    faculties,
    decision,
    institution: org.institutionName,
    siteUrl: SITE_URL,
    t,
    tTrust: tLicence,
  });

  // Author pages for the authors and advisors printed on the title page
  // (Phase 3.2) — exact-name matches only, from the cached directory.
  const peopleNames = [...record.authors, record.advisor, record.coAdvisor].filter((n): n is string => Boolean(n));
  // One lookup per printed name: the resolver answers with the directory's
  // spelling, and the map must be keyed by the name as this page prints it.
  const personLinks = await Promise.all(
    peopleNames.map(async (name) => [name, (await resolveAuthorLinks([name]))[0]?.href] as const),
  );
  record.personLinks = Object.fromEntries(personLinks.filter(([, href]) => Boolean(href)));

  // Validated, sanitized Thesis JSON-LD — see lib/seo/thesis-seo.ts.
  const thesisArticleSchema = thesisJsonLd(
    {
      slug: record.slug,
      title: report.title,
      alternativeTitle: report.title_km ?? null,
      abstract: report.abstract,
      authors: canonicalAuthors.length > 0 ? canonicalAuthors : splitAuthors(displayAuthorNames),
      contributors: authorCredits,
      coverUrl: report.cover_url,
      datePublished: report.published_at,
      dateModified: report.verified_at ?? report.updated_at ?? null,
      keywords: record.keywords,
      doi: getDoi(report),
      department: getDepartment(report),
      program: report.program,
      language: getLanguageLabel(report),
      references: getReferences(report),
      advisors: [record.advisor, record.coAdvisor],
      degree: record.degree,
      openPdfUrl: thesisIsOpenAccess(report)
        ? `${SITE_URL}${locale === "km" ? "/km" : ""}/theses/${encodeURIComponent(record.slug)}/fulltext.pdf`
        : null,
      licenseUrl: thesisIsOpenAccess(report) ? (thesisLicense(report.license)?.url ?? null) : null,
    },
    locale,
    org,
  );
  const thesisBreadcrumbSchema = breadcrumbSchema(
    [{ name: tNav("home"), path: "/" }, { name: tNav("theses"), path: "/theses" }, { name: report.title }],
    { locale },
  );

  return (
    <ThesisRecordView
      record={record}
      related={related}
      locale={locale}
      reportEmail={siteConfig.email}
      seo={
        <>
          <PageJsonLd nodes={[thesisArticleSchema, thesisBreadcrumbSchema]} />
        </>
      }
      connections={
        // Subject + author hubs. `subject` is the thesis's own taxonomy
        // column; the byline is the display author list, so a thesis credits
        // the same people its citation does.
        <ResourceConnections
          locale={locale}
          subjectNames={[report.subject]}
          authorNames={splitAuthors(displayAuthorNames)}
        />
      }
    />
  );
}
