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
import { contributorNames } from "@/lib/resources/contributor-view";
import { citationNames } from "@/lib/resources/contributor-identity";
import { getKeywords, getReferences, getDoi, getDepartment, getLanguageLabel } from "@/lib/theses/report-fields";
import { SITE_URL } from "@/lib/seo/site";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { thesisScholarMeta, type ThesisCitationRow } from "@/lib/seo/citation";
import { buildThesisMetadata, thesisJsonLd, type ThesisSeoInput } from "@/lib/seo/thesis-seo";
import JsonLd from "@/components/seo/JsonLd";
import ResourceConnections from "@/components/seo/ResourceConnections";
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
  const metaAuthorNames = contributorNames(metaContributors.contributors);
  const reportForMeta =
    metaAuthorNames.length > 0 ? { ...report, author_names: metaAuthorNames.join(", ") } : report;

  const seoInput: ThesisSeoInput = {
    slug: report.slug,
    title: report.title,
    abstract: report.abstract,
    authors: metaAuthorNames.length > 0 ? metaAuthorNames : splitAuthors(reportForMeta.author_names),
    contributors: metaContributors.contributors,
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

  return {
    ...base,
    // Google Scholar citation_* meta tags — see lib/seo/citation.ts
    other: {
      ...thesisScholarMeta(reportForMeta as ThesisCitationRow, org),
      "dc.publisher": org.institutionName,
      "dc.type": "ScholarlyArticle",
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
  const canonicalAuthors = contributorNames(contributorRead.contributors);
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

  // Validated, sanitized ScholarlyArticle JSON-LD — see lib/seo/thesis-seo.ts.
  const thesisArticleSchema = thesisJsonLd(
    {
      slug: record.slug,
      title: report.title,
      alternativeTitle: report.title_km ?? null,
      abstract: report.abstract,
      authors: canonicalAuthors.length > 0 ? canonicalAuthors : splitAuthors(displayAuthorNames),
      contributors: contributorRead.contributors,
      coverUrl: report.cover_url,
      datePublished: report.published_at,
      dateModified: report.verified_at ?? report.updated_at ?? null,
      keywords: record.keywords,
      doi: getDoi(report),
      department: getDepartment(report),
      program: report.program,
      language: getLanguageLabel(report),
      references: getReferences(report),
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
          <JsonLd data={thesisArticleSchema} />
          <JsonLd data={thesisBreadcrumbSchema} />
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
