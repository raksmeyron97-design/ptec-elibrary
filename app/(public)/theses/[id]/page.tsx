import { notFound } from "next/navigation";
import Link from "next/link";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";
import type { Metadata } from "next";
import { getThesisById } from "@/app/actions/theses";
import ThesisViewPing from "@/components/ui/theses/ThesisViewPing";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import Icon from "@/components/ui/core/Icon";
import RelatedTheses from "@/components/ui/theses/RelatedTheses";
import ThesisTabs, { type ThesisTab } from "@/components/ui/theses/ThesisTabs";
import ReferenceList from "@/components/ui/theses/ReferenceList";
import PublicationHero from "@/components/ui/theses/detail/PublicationHero";
import PublicationMetadata from "@/components/ui/theses/detail/PublicationMetadata";
import StickySidebar from "@/components/ui/theses/detail/StickySidebar";
import AbstractSection from "@/components/ui/theses/detail/AbstractSection";
import AuthorCard from "@/components/ui/theses/detail/AuthorCard";
import ReadingProgress from "@/components/ui/theses/detail/ReadingProgress";
import JsonLd from "@/components/seo/JsonLd";
import { createClient } from "@/lib/supabase/server";
import {
  getKeywords,
  getReferences,
  getDoi,
  getDepartment,
} from "@/lib/theses/report-fields";
import { SITE_URL } from "@/lib/seo/site";
import { Pencil, FileX2 } from "lucide-react";

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
    return { title: 'Thesis not found' };
  }

  const canonicalUrl = `${SITE_URL}/theses/${id}`;
  const description = truncate(report.abstract, 160) || 'Thesis from Phnom Penh Teacher Education College.';

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
  const pdfUrl = `${SITE_URL}/api/theses/${id}/file.pdf`;
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

export default async function ThesisDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { data: report, error } = await getThesisById(id);

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
      isAdmin = ADMIN_PANEL_ROLES.includes((profile?.role ?? "reader") as AppRole);
    }
  } catch { /* non-fatal */ }

  // ── Derived metadata ──────────────────────────────────────────────────────
  const keywords = getKeywords(report);
  const references = getReferences(report);
  const doi = getDoi(report);
  const department = getDepartment(report);
  const fileHref = `/api/theses/${id}/file`;
  const shareUrl = `${SITE_URL}/theses/${id}`;

  // ── Tab content ───────────────────────────────────────────────────────────
  const tabs: ThesisTab[] = [
    {
      id: "abstract",
      label: "Abstract",
      content: <AbstractSection abstract={report.abstract || ""} keywords={keywords} />,
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
          allowDownload={true}
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

  const reportAuthors = report.author_names
    ? (report.author_names as string).split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  const reportUrl = `${SITE_URL}/theses/${id}`;
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
      <ThesisViewPing id={id} />
      <ReadingProgress />
      <div className="mx-auto max-w-[1200px]">
        {/* ── Breadcrumb + admin ── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-1.5 overflow-hidden text-[13px] font-medium text-text-muted sm:gap-2 sm:text-[14.5px]"
          >
            <Link href="/" className="rounded-sm transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50">Home</Link>
            <Icon name="chevron-right" className="text-[16px] text-divider" />
            <Link href="/theses" className="rounded-sm transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50">Theses</Link>
            <Icon name="chevron-right" className="text-[16px] text-divider" />
            <span className="max-w-[200px] truncate font-semibold text-text-heading sm:max-w-[340px]" title={report.title}>
              {report.title}
            </span>
          </nav>
          {isAdmin && (
            <Link
              href={`/admin/theses/edit/${id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition-colors duration-150 hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit thesis
            </Link>
          )}
        </div>

        {/* ── Hero ── */}
        <PublicationHero report={report} reportId={id} fileHref={fileHref} shareUrl={shareUrl} />

        {/* ── Body: tabs + sidebar ── */}
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-5">
            <PublicationMetadata report={report} />
            <ThesisTabs tabs={tabs} defaultTab="abstract" />
          </div>
          <StickySidebar report={report} reportId={id} fileHref={fileHref} shareUrl={shareUrl} />
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
    </section>
  );
}
