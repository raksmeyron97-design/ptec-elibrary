import { notFound, permanentRedirect } from "next/navigation";
import { decodeSlugParam } from "@/lib/slug";
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";
import type { Metadata } from "next";
import { getThesisById, getThesisBySlug } from "@/app/actions/theses";
import { getThesisRank, TOP_N_PROTECTED } from "@/lib/theses/download-permission";
import ThesisViewPing from "@/components/ui/theses/ThesisViewPing";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import Icon from "@/components/ui/core/Icon";
import RelatedTheses from "@/components/ui/theses/RelatedTheses";
import ThesisTabs, { type ThesisTab } from "@/components/ui/theses/ThesisTabs";
import ReferenceList from "@/components/ui/theses/ReferenceList";
import PublicationHero from "@/components/ui/theses/detail/PublicationHero";
import PublicationMetadata from "@/components/ui/theses/detail/PublicationMetadata";
import StickySidebar from "@/components/ui/theses/detail/StickySidebar";
import ThesisAbstractReader from "@/components/ui/theses/ThesisAbstractReader";
import AuthorCard from "@/components/ui/theses/detail/AuthorCard";
import ReadingProgress from "@/components/ui/detail/ReadingProgress";
import { getTranslations } from "next-intl/server";
import JsonLd from "@/components/seo/JsonLd";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPublicResourceAuthors } from "@/lib/resources/public-contributors";
import {
  getKeywords,
  getReferences,
  getDoi,
  getDepartment,
  getLanguageLabel,
} from "@/lib/theses/report-fields";
import { SITE_URL } from "@/lib/seo/site";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { thesisScholarMeta } from "@/lib/seo/citation";
import { buildThesisMetadata, thesisJsonLd, type ThesisSeoInput } from "@/lib/seo/thesis-seo";
import { Pencil, FileX2 } from "lucide-react";

/** Split "Sok San, Chan Dara" → ["Sok San", "Chan Dara"]. */
function splitAuthors(authorNames: string | null | undefined): string[] {
  return authorNames
    ? authorNames.split(",").flatMap((s: string) => {
        const name = s.trim();
        return name ? [name] : [];
      })
    : [];
}

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string; locale: string }> };

// Legacy /theses/[uuid] URLs. Middleware already issues the 301 for these;
// this page-level lookup is the fallback for anything that slips past the
// middleware matcher, and produces the 404 when the id doesn't exist.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [{ slug, locale }, supabase, org] = await Promise.all([
    params,
    createClient(),
    getOrgIdentity(),
  ]);
  const { data: report } = await supabase
    .from('research_reports')
    .select('id, slug, title, abstract, author_names, cover_url, file_url, published_at, created_at, updated_at, keywords, doi, is_published, program, faculty, subject, language, department_id, verified_at, departments(name)')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  if (!report) {
    // Legacy UUID URLs are handled in the page component (301 or 404); for
    // everything else, throwing here (before the shell streams) makes the
    // response a genuine HTTP 404 instead of a soft 200+noindex.
    if (!UUID_RE.test(slug)) notFound();
    return { title: 'Thesis not found' };
  }

  // SEO overrides (migration 0076) fetched separately from the required
  // columns above — until that migration is applied, this query errors
  // harmlessly and every field below just falls back to the pre-existing
  // title/abstract/cover-derived defaults instead of 404ing the whole page.
  // Both reads depend only on report.id and not on each other, so run them
  // together. Canonical authors feed the citation_* meta tags + JSON-LD,
  // consistent with the visible page; defensive fallback to the legacy string
  // pre-migration.
  const [{ data: seoRow }, canonicalMetaAuthors] = await Promise.all([
    supabase
      .from('research_reports')
      .select('seo_title, seo_description, og_image')
      .eq('id', report.id)
      .maybeSingle(),
    getPublicResourceAuthors("thesis", report.id),
  ]);
  const reportForMeta =
    canonicalMetaAuthors.length > 0
      ? { ...report, author_names: canonicalMetaAuthors.join(", ") }
      : report;

  const seoInput: ThesisSeoInput = {
    slug: report.slug,
    title: report.title,
    abstract: report.abstract,
    authors: splitAuthors(reportForMeta.author_names),
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
    {
      seoTitle: seoRow?.seo_title,
      seoDescription: seoRow?.seo_description,
      ogImage: seoRow?.og_image,
    },
    org,
  );

  return {
    ...base,
    // Google Scholar citation_* meta tags — see lib/seo/citation.ts
    other: {
      ...thesisScholarMeta(reportForMeta, org),
      'dc.publisher': org.institutionName,
      'dc.type': 'ScholarlyArticle',
    },
  };
}

export default async function ThesisDetailPage({ params }: PageProps) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  let { data: report } = await getThesisBySlug(slug);

  if (!report && UUID_RE.test(slug)) {
    // Legacy ID URL: 301 to the canonical slug URL, 404 if the id is unknown.
    const { data: bySlugId } = await getThesisById(slug);
    if (bySlugId?.slug && bySlugId.is_published) {
      permanentRedirect(locale === "km" ? `/km/theses/${bySlugId.slug}` : `/theses/${bySlugId.slug}`);
    }
    report = bySlugId;
  }

  if (!report || !report.is_published) {
    notFound();
  }

  const id: string = report.id;
  const canonicalSlug: string = report.slug ?? report.id;

  // Canonical author credits (migrations 0104–0109). DEFENSIVE read-switch:
  // structured contributors replace the free-text `author_names` on the display
  // surfaces and JSON-LD when present, falling back to the legacy string when
  // absent (pre-migration) or empty. `report` itself is left untouched because
  // AuthorCard matches sibling theses by the exact legacy `author_names` string;
  // only `displayReport` carries the canonical form.
  const canonicalAuthors = await getPublicResourceAuthors("thesis", id);
  const displayReport =
    canonicalAuthors.length > 0
      ? { ...report, author_names: canonicalAuthors.join(", ") }
      : report;

  // Admin-only edit link — best-effort, non-blocking
  let isAdmin = false;
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (user) {
      const { data: profile } = await authClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      isAdmin = ADMIN_PANEL_ROLES.includes((profile?.role ?? "reader") as AppRole);
    }
  } catch { /* non-fatal */ }

  // ── Derived metadata ──────────────────────────────────────────────────────
  const keywords = getKeywords(report);
  const references = getReferences(report);
  const doi = getDoi(report);
  const department = getDepartment(report);
  const fileHref = `/api/theses/${id}/file`;
  const shareUrl = `${SITE_URL}/theses/${canonicalSlug}`;
  // Localized internal path — carried as returnTo / login callback by the
  // gated download flow (validated by safeReturnTo before use).
  const thesisPath = locale === "km" ? `/km/theses/${canonicalSlug}` : `/theses/${canonicalSlug}`;

  // Global Top-N rank (service-role read of the ranking view). Drives the
  // subtle "Top 10 · Most Downloaded" badge; the actual download gate is
  // enforced server-side by the permission engine, never by this badge.
  let thesisRank: number | null = null;
  try {
    thesisRank = await getThesisRank(createServiceClient(), id);
  } catch { /* non-fatal — badge simply hidden */ }
  const isTopTen = thesisRank != null && thesisRank <= TOP_N_PROTECTED;

  // ── Tab content ───────────────────────────────────────────────────────────
  const tabs: ThesisTab[] = [
    {
      id: "abstract",
      label: "Abstract",
      content: (
        <ThesisAbstractReader
          abstract={report.abstract || ""}
          keywords={keywords}
          basePath="/theses"
          title={report.title}
          locale={locale}
        />
      ),
    },
  ];

  tabs.push({
    id: "fulltext",
    label: "Full Text",
    lazy: true,
    content: report.file_url ? (
      <div className="-m-1">
        <PDFViewer
          title={report.title}
          pdfUrl={fileHref}
          bookId={id}
          totalPages={100}
          initialProgressPct={0}
          initialMaxProgressPct={0}
          // In-reader "download" would fetch the public preview route and bypass
          // the download-permission gate. Reading/preview stays available; the
          // gated Download button (ThesisDownloadButton) is the only save path.
          allowDownload={false}
          reportEmail={(await getSiteConfig()).email}
        />
      </div>
    ) : (
      <div className="fade-rise-in flex flex-col items-center gap-3 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-app">
          <FileX2 className="h-7 w-7 text-text-muted/50" />
        </span>
        <p className="text-[14px] font-medium text-text-heading">No PDF available yet</p>
        <p className="max-w-xs text-[13px] text-text-muted">
          The full text for this thesis hasn&apos;t been uploaded to the repository.
        </p>
      </div>
    ),
  });

  tabs.push({
    id: "references",
    label: "References",
    badge: references.length || undefined,
    content: <ReferenceList references={references} />,
  });

  const tNav = await getTranslations("nav");

  // Validated, sanitized ScholarlyArticle JSON-LD — see lib/seo/thesis-seo.ts.
  const thesisArticleSchema = thesisJsonLd(
    {
      slug: canonicalSlug,
      title: report.title,
      abstract: report.abstract,
      authors: splitAuthors(displayReport.author_names),
      coverUrl: report.cover_url,
      datePublished: report.published_at,
      dateModified: report.verified_at ?? report.updated_at ?? null,
      keywords,
      doi,
      department,
      program: report.program,
      language: getLanguageLabel(report),
      references,
    },
    locale,
    await getOrgIdentity(),
  );
  const thesisBreadcrumbSchema = breadcrumbSchema([
    { name: tNav("home"), path: "/" },
    { name: tNav("theses"), path: "/theses" },
    { name: report.title },
  ]);

  return (
    <article className="min-h-screen bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12">
      <JsonLd data={thesisArticleSchema} />
      <JsonLd data={thesisBreadcrumbSchema} />
      <ThesisViewPing id={id} />
      <ReadingProgress />
      <div className="mx-auto max-w-[1200px]">
        {/* ── Breadcrumb + admin ── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-1.5 overflow-hidden text-[13px] font-medium text-text-muted sm:gap-2 sm:text-[14.5px]"
          >
            <Link href="/" className="rounded-sm transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50">{tNav("home")}</Link>
            <Icon name="chevron-right" className="text-[16px] text-divider" />
            <Link href="/theses" className="rounded-sm transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50">{tNav("theses")}</Link>
            <Icon name="chevron-right" className="text-[16px] text-divider" />
            <span className="max-w-[200px] truncate font-semibold text-text-heading sm:max-w-[340px]" title={report.title}>
              {report.title}
            </span>
          </nav>
          {isAdmin && (
            <NextLink
              href={`/admin/theses/edit/${id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition-colors duration-150 hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit thesis
            </NextLink>
          )}
        </div>

        {/* ── Hero ── */}
        <PublicationHero report={displayReport} reportId={id} fileHref={fileHref} shareUrl={shareUrl} thesisPath={thesisPath} rank={isTopTen ? thesisRank : null} />

        {/* ── Body: tabs + sidebar ── */}
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-5">
            <PublicationMetadata report={displayReport} />
            <ThesisTabs tabs={tabs} defaultTab="abstract" />
          </div>
          <StickySidebar
            report={displayReport}
            reportId={id}
            fileHref={fileHref}
            shareUrl={shareUrl}
            thesisPath={thesisPath}
            institution={(await getOrgIdentity()).institutionName}
          />
        </div>

        {/* ── Related ── */}
        <RelatedTheses
          currentId={id}
          cohort={report.cohort}
          academicYear={report.academic_year}
          department={department ?? undefined}
        />

        {/* ── More from this author ── */}
        {report.author_names && (
          <AuthorCard currentId={id} authorNames={report.author_names} />
        )}
      </div>
    </article>
  );
}
