import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getResearchReportById, incrementResearchViewCount } from "@/app/actions/research";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import Icon from "@/components/ui/core/Icon";
import ShareButton from "@/components/ui/books/ShareButton";
import RelatedReports from "@/components/ui/research/RelatedReports";
import ResearchTabs, { type ResearchTab } from "@/components/ui/research/ResearchTabs";
import ReferenceList from "@/components/ui/research/ReferenceList";
import CiteThis from "@/components/ui/research/CiteThis";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  getKeywords,
  getReferences,
  getDoi,
  getDepartment,
  formatPublicationDate,
} from "@/lib/research/report-fields";
import {
  Download,
  Eye,
  Pencil,
  Building2,
  CalendarDays,
  Layers,
  GraduationCap,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ResearchReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: report, error } = await getResearchReportById(id);

  if (error || !report || !report.is_published) {
    notFound();
  }

  // Increment view count in the background (fire and forget for this render)
  incrementResearchViewCount(id);

  // Admin-only edit link — best-effort, non-blocking
  let isAdmin = false;
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (user) {
      const { data: profile } = await createServiceClient()
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
  const shareUrl = `https://library.ptec.edu.kh/research/${id}`;

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

  // Small reusable meta chip
  const MetaChip = ({
    icon,
    children,
  }: {
    icon: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-paper px-2.5 py-1.5 text-[12.5px] font-medium text-text-body">
      <span className="text-text-muted">{icon}</span>
      {children}
    </span>
  );

  return (
    <section className="min-h-screen bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12">
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
        <header className="mb-7 rounded-[28px] border border-divider bg-bg-surface p-5 shadow-sm sm:p-7 md:p-9">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">
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
              className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-brand px-6 py-3 text-[15px] font-bold text-brand-contrast shadow-lg shadow-brand/30 transition-all hover:-translate-y-0.5 hover:bg-brand-hover"
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
                  <Image src={report.cover_url} alt={report.title} fill className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-brand/5 text-brand/40">
                    No Cover
                  </div>
                )}
              </div>
            </div>

            {/* Cite this */}
            <CiteThis report={report} reportId={id} />

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-divider bg-bg-surface p-4 text-center shadow-sm">
                <Eye className="mx-auto mb-1.5 h-4 w-4 text-text-muted" />
                <div className="text-[20px] font-bold text-text-heading">{(report.view_count || 0) + 1}</div>
                <div className="text-[11px] uppercase tracking-wider text-text-muted">Views</div>
              </div>
              <div className="rounded-2xl border border-divider bg-bg-surface p-4 text-center shadow-sm">
                <Download className="mx-auto mb-1.5 h-4 w-4 text-text-muted" />
                <div className="text-[20px] font-bold text-text-heading">{report.download_count || 0}</div>
                <div className="text-[11px] uppercase tracking-wider text-text-muted">Downloads</div>
              </div>
            </div>

            {/* Article information */}
            <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
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
      <dd className="text-right font-medium text-text-heading">{value}</dd>
    </div>
  );
}