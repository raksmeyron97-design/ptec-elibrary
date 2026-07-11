import { notFound, permanentRedirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";
import type { Metadata } from "next";
import { getThesisById, getThesisBySlug } from "@/app/actions/theses";
import ThesisViewPing from "@/components/ui/theses/ThesisViewPing";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import Icon from "@/components/ui/core/Icon";
import RelatedTheses from "@/components/ui/theses/RelatedTheses";
import ThesisTabs, { type ThesisTab } from "@/components/ui/theses/ThesisTabs";
import ReferenceList from "@/components/ui/theses/ReferenceList";
import PublicationHero from "@/components/ui/theses/detail/PublicationHero";
import PublicationMetadata from "@/components/ui/theses/detail/PublicationMetadata";
import StickySidebar from "@/components/ui/theses/detail/StickySidebar";
import AbstractSection from "@/components/ui/detail/AbstractSection";
import AuthorCard from "@/components/ui/theses/detail/AuthorCard";
import ReadingProgress from "@/components/ui/detail/ReadingProgress";
import JsonLd from "@/components/seo/JsonLd";
import { ScholarlyArticleJsonLd } from "@/components/seo/ResourceJsonLd";
import { createClient } from "@/lib/supabase/server";
import {
  getKeywords,
  getReferences,
  getDoi,
  getDepartment,
} from "@/lib/theses/report-fields";
import { PTEC_LIBRARY_NAME, PTEC_NAME, SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { thesisScholarMeta } from "@/lib/seo/citation";
import { Pencil, FileX2 } from "lucide-react";

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string; locale: string }> };

// Legacy /theses/[uuid] URLs. Middleware already issues the 301 for these;
// this page-level lookup is the fallback for anything that slips past the
// middleware matcher, and produces the 404 when the id doesn't exist.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [{ slug, locale }, supabase] = await Promise.all([
    params,
    createClient(),
  ]);
  const { data: report } = await supabase
    .from('research_reports')
    .select('id, slug, title, abstract, author_names, cover_url, file_url, published_at, created_at, keywords, doi, is_published, program, faculty, subject, department_id, verified_at, departments(name)')
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
  const { data: seoRow } = await supabase
    .from('research_reports')
    .select('seo_title, seo_description, og_image')
    .eq('id', report.id)
    .maybeSingle();

  const alternates = localeAlternates(`/theses/${report.slug}`, locale);
  const canonicalUrl = alternates.canonical;
  // Admin-set SEO overrides (migration 0076) win when present; otherwise
  // fall back to the title/abstract-derived defaults already used below.
  const seoTitle: string = seoRow?.seo_title || report.title;
  const description = seoRow?.seo_description || truncate(report.abstract, 160) || 'Thesis from Phnom Penh Teacher Education College.';
  const ogImage: string | null = seoRow?.og_image || report.cover_url;

  // Split "Sok San, Chan Dara" → ['Sok San', 'Chan Dara']
  const authors: string[] = report.author_names
    ? report.author_names.split(',').flatMap((s: string) => {
        const name = s.trim();
        return name ? [name] : [];
      })
    : [];
  const metadataAuthors = authors.length > 0 ? authors : ['Unknown Author'];

  const keywords: string[] = Array.isArray(report.keywords)
    ? report.keywords
    : typeof report.keywords === 'string' && report.keywords
      ? report.keywords.split(',').flatMap((s: string) => {
          const keyword = s.trim();
          return keyword ? [keyword] : [];
        })
      : [];

  const section = getDepartment(report) || report.program || 'Theses';

  // Google Scholar citation_* meta tags — see lib/seo/citation.ts
  const citationOther = thesisScholarMeta(report);

  return {
    title: seoTitle,
    description,
    keywords: keywords.length > 0 ? keywords : undefined,
    authors: metadataAuthors.map((name) => ({ name })),
    publisher: PTEC_NAME,
    category: section,
    alternates,
    openGraph: {
      title: seoTitle,
      description,
      type: 'article',
      url: canonicalUrl,
      siteName: PTEC_LIBRARY_NAME,
      authors: metadataAuthors,
      publishedTime: report.published_at ?? report.created_at ?? undefined,
      section,
      tags: keywords.length > 0 ? keywords : undefined,
      images: ogImage ? [{ url: ogImage, alt: report.title }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: seoTitle,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    other: {
      ...citationOther,
      'dc.publisher': PTEC_NAME,
      'dc.type': 'ScholarlyArticle',
    },
  };
}

export default async function ThesisDetailPage({ params }: PageProps) {
  const { slug, locale } = await params;
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

  // ── Tab content ───────────────────────────────────────────────────────────
  const tabs: ThesisTab[] = [
    {
      id: "abstract",
      label: "Abstract",
      content: <AbstractSection abstract={report.abstract || ""} keywords={keywords} basePath="/theses" />,
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
    ? (report.author_names as string).split(',').flatMap((s: string) => {
        const name = s.trim();
        return name ? [name] : [];
      })
    : [];

  const reportUrl = `${SITE_URL}/theses/${canonicalSlug}`;
  const thesisBreadcrumbSchema = breadcrumbSchema([
    { name: "Home", path: "/home" },
    { name: "Theses", path: "/theses" },
    { name: report.title },
  ]);

  return (
    <article className="min-h-screen bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12">
      <ScholarlyArticleJsonLd
        title={report.title}
        url={reportUrl}
        authors={reportAuthors}
        abstract={report.abstract}
        image={report.cover_url}
        datePublished={report.published_at}
        dateCreated={report.created_at}
        keywords={keywords}
        doi={doi}
        department={department}
        references={references}
      />
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
            <Link href="/" className="rounded-sm transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50">Home</Link>
            <Icon name="chevron-right" className="text-[16px] text-divider" />
            <Link href="/theses" className="rounded-sm transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50">Theses</Link>
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
    </article>
  );
}
