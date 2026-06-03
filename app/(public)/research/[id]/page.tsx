import { notFound } from "next/navigation";
import Link from "next/link";
import { getResearchReportById, incrementResearchViewCount } from "@/app/actions/research";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import Icon from "@/components/ui/core/Icon";
import ShareButton from "@/components/ui/books/ShareButton";
import { Download, Eye } from "lucide-react";
import Image from "next/image";
import RelatedReports from "@/components/ui/research/RelatedReports";

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

  return (
    <section className="bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12 min-h-screen">
      <div className="mx-auto max-w-[1200px]">
        
        <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1.5 sm:gap-2 text-[13px] sm:text-[14.5px] font-medium text-text-muted overflow-hidden">
          <Link href="/" className="hover:text-brand transition-colors">Home</Link>
          <Icon name="chevron-right" className="text-[16px] text-divider" />
          <Link href="/research" className="hover:text-brand transition-colors">Research Reports</Link>
          <Icon name="chevron-right" className="text-[16px] text-divider" />
          <span className="max-w-[200px] truncate font-semibold text-text-heading sm:max-w-[300px]" title={report.title}>
            {report.title}
          </span>
        </nav>

        {/* ── PDF reader (shown first) ── */}
        {report.file_url && (
          <div id="reader" className="mb-8 scroll-mt-24">
            <PDFViewer
              title={report.title}
              pdfUrl={report.file_url}
              bookId={id}
              totalPages={100} // Dummy for research reports
              initialProgressPct={0}
              initialMaxProgressPct={0}
              watermark="Phnom Penh Teacher Education college"
              allowDownload={true}
            />
          </div>
        )}

        {/* ── Hero card ── */}
        <div id="details" className="grid gap-6 sm:gap-10 rounded-[28px] border border-divider bg-bg-surface p-5 sm:p-6 shadow-md md:p-9 lg:grid-cols-[300px_1fr] scroll-mt-24">
          {/* Cover */}
          <div className="mx-auto w-full max-w-[220px] sm:max-w-none">
            <div className="overflow-hidden rounded-2xl shadow-lg shadow-brand/10 border border-divider/50 relative aspect-[3/4] bg-paper">
              {report.cover_url ? (
                <Image src={report.cover_url} alt={report.title} fill className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-brand/5 text-brand/40">No Cover</div>
              )}
            </div>
          </div>

          {/* Details */}
          <div>
            <div className="flex flex-wrap gap-2 items-center text-xs font-bold uppercase tracking-wider">
              <span className="bg-accent/10 text-accent-contrast px-3 py-1 rounded-full border border-accent/20">
                Cohort {report.cohort}
              </span>
              <span className="bg-paper text-text-body px-3 py-1 rounded-full border border-divider">
                {report.academic_year}
              </span>
            </div>

            <h1 className="font-khmer-serif mt-4 sm:mt-6 text-[clamp(24px,4vw,34px)] font-bold leading-[1.3] text-text-heading">
              {report.title}
            </h1>
            
            {report.author_names && (
              <p className="mt-2 text-[15px] sm:text-[17px] font-medium text-text-muted">
                Author(s): <span className="text-text-heading">{report.author_names}</span>
              </p>
            )}
            
            {report.advisor_name && (
              <p className="mt-1 text-[14px] sm:text-[15px] text-text-muted">
                Advisor: <span className="text-text-heading">{report.advisor_name}</span>
              </p>
            )}

            <p className="mt-5 font-sans text-[15px] sm:text-[15.5px] leading-7 sm:leading-8 text-text-body">
              {report.abstract}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-6 text-sm text-text-muted">
              <div className="flex items-center gap-1.5 bg-paper px-3 py-1.5 rounded-lg border border-divider">
                <Eye className="w-4 h-4" /> 
                <span className="font-medium text-text-body">{report.view_count + 1} Views</span>
              </div>
              <div className="flex items-center gap-1.5 bg-paper px-3 py-1.5 rounded-lg border border-divider">
                <Download className="w-4 h-4" /> 
                <span className="font-medium text-text-body">{report.download_count} Downloads</span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#reader"
                className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-brand px-6 py-3 text-[15px] font-bold text-brand-contrast transition-all hover:-translate-y-0.5 hover:bg-brand-hover shadow-lg shadow-brand/30"
              >
                <Icon name="pdf" className="text-[20px]" />
                Read Online
              </a>
              <ShareButton url={`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/research/${id}`} />
            </div>
          </div>
        </div>

        {/* ── Related Reports ── */}
        <RelatedReports 
          currentId={id} 
          cohort={report.cohort} 
          academicYear={report.academic_year} 
        />
      </div>
    </section>
  );
}
