import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getResearchReportById } from "@/app/actions/research";
import ResearchViewPing from "@/components/ui/research/ResearchViewPing";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import Icon from "@/components/ui/core/Icon";
import ShareButton from "@/components/ui/books/ShareButton";
import RelatedReports from "@/components/ui/research/RelatedReports";
import ResearchTabs, { type ResearchTab } from "@/components/ui/research/ResearchTabs";
import ReferenceList from "@/components/ui/research/ReferenceList";
import CiteThis from "@/components/ui/research/CiteThis";
import JsonLd from "@/components/seo/JsonLd";
import { createClient } from "@/lib/supabase/server";
import {
  getKeywords,
  getReferences,
  getDoi,
  getDepartment,
  formatPublicationDate,
} from "@/lib/research/report-fields";
import { SITE_URL } from "@/lib/seo/site";
import {
  Download,
  Eye,
  Pencil,
  Building2,
  CalendarDays,
  Layers,
  GraduationCap,
} from "lucide-react";

export const revalidate = 3600;

type PageProps = { params: Promise<{ id: string }> };

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function formatCitationDate(dateStr: string | null | undefined, fallback: string | null | undefined): string | null {
  const raw = dateStr ?? fallback;
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: report } = await supabase
    .from('research_reports')
    .select('id, title, abstract, author_names, cover_url, file_url, published_at, created_at, keywords, doi, is_published')
    .eq('id', id)
    .eq('is_published', true)
    .single();

  if (!report) {
    return { title: 'Report not found' };
  }

  const canonicalUrl = `${SITE_URL}/research/${id}`;
  const description = truncate(report.abstract, 160) || 'Research report from Phnom Penh Teacher Education College.';

  // Split "Sok San, Chan Dara" → ['Sok San', 'Chan Dara']
  const authors: string[] = report.author_names
    ? report.author_names.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  const keywords: string[] = Array.isArray(report.keywords)
    ? report.keywords
    : typeof report.keywords === 'string' && report.keywords
      ? report.keywords.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

  const citationDate = formatCitationDate(report.published_at, report.created_at);
  const pdfUrl = `${SITE_URL}/api/research/${id}/file.pdf`;
  const doi = report.doi as string | null | undefined;

  // Build citation_ meta tags — Google Scholar requires these for indexing
  const citationOther: Record<string, string | string[]> = {
    citation_title: report.title,
    citation_publication_date: citationDate ?? String(new Date(report.created_at).getFullYear()),
    citation_technical_report_institution: 'Phnom Penh Teacher Education College',
    citation_pdf_url: pdfUrl,
  };

  if (authors.length > 0) citationOther.citation_author = authors;
  if (report.abstract) citationOther.citation_abstract = report.abstract;
  if (keywords.length > 0) citationOther.citation_keywords = keywords.join('; ');
  if (doi) citationOther.citation_doi = doi;

  return {
    title: report.title,
    description,
    keywords: keywords.length > 0 ? keywords : undefined,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: report.title,
      description,
      type: 'article',
      url: canonicalUrl,
      images: report.cover_url ? [{ url: report.cover_url, alt: report.title }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: report.title,
      description,
      images: report.cover_url ? [report.cover_url] : undefined,
    },
    other: citationOther,
  };
}

export default async function ResearchReportDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { data: report, error } = await getResearchReportById(id);

  if (error || !report || !report.is_published) {
    notFound();
  }

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
      isAdmin = profile?.role === "admin";
    }
  } catch { /* non-fatal */ }

  // ── Derived metadata ──────────────────────────────────────────────────────
  const keywords = getKeywords(report);
  const references = getReferences(report);
  const doi = getDoi(report);
  const department = getDepartment(report);
  const publishedOn = formatPublicationDate(report);
  const fileHref = `/api/research/${id}/file`;
  const shareUrl = `${SITE_URL}/research/${id}`;

  // ── Tab content ───────────────────────────────────────────────────────────
  const abstractPanel = (
    <div className="max-w-3xl">
      <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
        Abstract
      </h2>
      <p className="font-sans text-[15px] leading-8 text-text-body sm:text-[15.5px]">
        {report.abstract || "No abstract provided."}
      </p>

      {keywords.length > 0 && (
        <div className="mt-7 border-t border-divider pt-5">
          <h3 className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
            Keywords
          </h3>
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <Link
                key={kw}
                href={`/research?q=${encodeURIComponent(kw)}`}
                className="rounded-full border border-divider bg-paper px-3 py-1 text-[12.5px] font-medium text-text-body transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
              >
                {kw}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const tabs: ResearchTab[] = [{ id: "abstract", label: "Abstract", content: abstractPanel }];

  if (report.file_url) {
    tabs.push({
      id: "fulltext",
      label: "Full Text",
      lazy: true,
      content: (
        <div className="-m-1">
          <PDFViewer
            title={report.title}
            pdfUrl={fileHref}
            bookId={id}
            totalPages={100}
            initialProgressPct={0}
            initialMaxProgressPct={0}
            allowDownload={true}
          />
        </div>
      ),
    });
  }

  tabs.push({
    id: "references",
    label: "References",
    badge: references.length || undefined,
    content: <ReferenceList references={references} />,
  });


  const reportAuthors = report.author_names
    ? (report.author_names as string).split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  const reportUrl = `${SITE_URL}/research/${id}`;
  const scholarlyArticleSchema = {
    '@context': 'https://schema.org',
    '@type': 'ScholarlyArticle',
    headline: report.title,
    abstract: report.abstract || undefined,
    author: reportAuthors.length > 0
      ? reportAuthors.map((name: string) => ({ '@type': 'Person', name }))
      : { '@type': 'Organization', name: 'Unknown Author' },
    datePublished: report.published_at ?? report.created_at ?? undefined,
    keywords: keywords.length > 0 ? keywords.join(', ') : undefined,
    image: report.cover_url || `${SITE_URL}/og-image.jpg`,
    url: reportUrl,
    isAccessibleForFree: true,
    publisher: {
      '@type': 'EducationalOrganization',
      name: 'Phnom Penh Teacher Education College',
      url: SITE_URL,
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/OnlineOnly',
    },
    ...(doi ? {
      identifier: {
        '@type': 'PropertyValue',
        propertyID: 'DOI',
        value: doi,
      },
    } : {}),
  };

  return (
    <section className="min-h-screen bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12">
      <JsonLd data={scholarlyArticleSchema} />
      <ResearchViewPing id={id} />
      <div className="mx-auto max-w-[1200px]">
        {/* ── Breadcrumb + admin ── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-1.5 overflow-hidden text-[13px] font-medium text-text-muted sm:gap-2 sm:text-[14.5px]"
          >
            <Link href="/" className="transition-colors hover:text-brand">Home</Link>
            <Icon name="chevron-right" className="text-[16px] text-divider" />
            <Link href="/research" className="transition-colors hover:text-brand">Research Reports</Link>
            <Icon name="chevron-right" className="text-[16px] text-divider" />
            <span className="max-w-[200px] truncate font-semibold text-text-heading sm:max-w-[340px]" title={report.title}>
              {report.title}
            </span>
          </nav>
          {isAdmin && (
            <Link
              href={`/admin/research-reports/edit/${id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-brand hover:text-brand"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit report
            </Link>
          )}
        </div>

        {/* ── Article header ── */}
        <header className="gradient-top-border mb-7 overflow-hidden rounded-[28px] border border-divider bg-bg-surface p-5 shadow-sm sm:p-7 md:p-9">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand/60" />
              Research Report
            </span>
            {doi && (
              <a
                href={doi.startsWith("http") ? doi : `https://doi.org/${doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11.5px] text-text-muted transition-colors hover:text-brand"
              >
                DOI: {doi.replace(/^https?:\/\/doi\.org\//, "")}
              </a>
            )}
          </div>

          <h1 className="mt-3 font-khmer-serif text-[clamp(24px,4vw,36px)] font-bold leading-[1.28] text-text-heading">
            {report.title}
          </h1>

          {report.author_names && (
            <p className="mt-4 text-[15px] text-text-body sm:text-[16.5px]">
              <span className="text-text-muted">Author(s): </span>
              <span className="font-semibold text-text-heading">{report.author_names}</span>
            </p>
          )}
          {report.advisor_name && (
            <p className="mt-1 text-[14px] text-text-muted sm:text-[15px]">
              Advisor: <span className="font-medium text-text-heading">{report.advisor_name}</span>
            </p>
          )}

          {/* Meta chips */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {report.cohort && (
              <MetaChip icon={<Layers className="h-3.5 w-3.5" />}>Cohort {report.cohort}</MetaChip>
            )}
            {report.academic_year && (
              <MetaChip icon={<GraduationCap className="h-3.5 w-3.5" />}>{report.academic_year}</MetaChip>
            )}
            {department && (
              <MetaChip icon={<Building2 className="h-3.5 w-3.5" />}>{department}</MetaChip>
            )}
            {publishedOn && (
              <MetaChip icon={<CalendarDays className="h-3.5 w-3.5" />}>{publishedOn}</MetaChip>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href={fileHref}
              className="btn-brand-gradient inline-flex items-center justify-center gap-2 rounded-[14px] px-6 py-3 text-[15px] font-bold text-white"
            >
              <Download className="h-[18px] w-[18px]" />
              Download PDF
            </a>
            <ShareButton url={shareUrl} />
          </div>
        </header>

        {/* ── Body: sections + sidebar ── */}
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* Main */}
          <div className="min-w-0">
            <ResearchTabs tabs={tabs} defaultTab="abstract" />
          </div>

          {/* Sidebar */}
          <aside className="space-y-5">
            {/* Cover */}
            <div className="overflow-hidden rounded-2xl border border-divider/60 bg-paper shadow-sm">
              <div className="relative aspect-[3/4] w-full">
                {report.cover_url ? (
                  <Image src={report.cover_url} alt={report.title} fill sizes="(max-width: 768px) 100vw, 240px" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-brand/5 to-brand/10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14 text-brand/25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <span className="text-[11px] font-medium text-brand/30">No Cover</span>
                  </div>
                )}
              </div>
            </div>

            {/* Cite this */}
            <CiteThis report={report} reportId={id} />

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center shadow-sm dark:border-emerald-800/30 dark:bg-emerald-950/20">
                <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <Eye className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                </div>
                <div className="text-[20px] font-bold text-emerald-800 dark:text-emerald-300">{(report.view_count || 0) + 1}</div>
                <div className="text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-500">Views</div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center shadow-sm dark:border-amber-800/30 dark:bg-amber-950/20">
                <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <Download className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                </div>
                <div className="text-[20px] font-bold text-amber-800 dark:text-amber-300">{report.download_count || 0}</div>
                <div className="text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-500">Downloads</div>
              </div>
            </div>

            {/* Article information */}
            <div className="gradient-top-border overflow-hidden rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
              <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-text-heading">
                Article information
              </h3>
              <dl className="space-y-2.5 text-[13px]">
                <InfoRow label="Type" value="Research report" />
                {report.cohort && <InfoRow label="Cohort" value={`Cohort ${report.cohort}`} />}
                {report.academic_year && <InfoRow label="Academic year" value={report.academic_year} />}
                {department && <InfoRow label="Department" value={department} />}
                {publishedOn && <InfoRow label="Published" value={publishedOn} />}
                {doi && (
                  <InfoRow
                    label="DOI"
                    value={
                      <a
                        href={doi.startsWith("http") ? doi : `https://doi.org/${doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-mono text-brand hover:underline"
                      >
                        {doi.replace(/^https?:\/\/doi\.org\//, "")}
                      </a>
                    }
                  />
                )}
              </dl>
            </div>
          </aside>
        </div>

        {/* ── Related ── */}
        <RelatedReports
          currentId={id}
          cohort={report.cohort}
          academicYear={report.academic_year}
          department={department ?? undefined}
        />
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-text-muted">{label}</dt>
    </div>
  );
}

function MetaChip({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-paper px-2.5 py-1.5 text-[12.5px] font-medium text-text-body">
      <span className="text-text-muted">{icon}</span>
      {children}
    </span>
  );
}