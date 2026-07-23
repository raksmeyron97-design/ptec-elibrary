/* eslint-disable @typescript-eslint/no-explicit-any */
import Image from "next/image";
import { GraduationCap } from "lucide-react";
import ActionButtons from "@/components/ui/detail/ActionButtons";
import ThesisDownloadButton from "@/components/ui/theses/ThesisDownloadButton";
import MetricsPanel from "@/components/ui/detail/MetricsPanel";
import BackToTopButton from "@/components/ui/detail/BackToTopButton";
import CiteThis from "@/components/ui/theses/CiteThis";

export default function StickySidebar({
  report,
  reportId,
  fileHref,
  shareUrl,
  thesisPath,
  institution,
}: {
  report: any;
  reportId: string;
  fileHref: string;
  shareUrl: string;
  thesisPath: string;
  /** Published institution name, threaded from the server (never compiled in). */
  institution: string;
}) {
  return (
    <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
      {/* Cover */}
      <div className="overflow-hidden rounded-2xl border border-divider/60 bg-paper shadow-sm">
        <div className="relative aspect-[3/4] w-full">
          {report.cover_url ? (
            <Image
              src={report.cover_url}
              alt={report.title}
              fill
              sizes="(max-width: 768px) 100vw, 240px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-brand/5 to-brand/10">
              <GraduationCap className="h-14 w-14 text-brand/25" strokeWidth={1.5} />
              <span className="text-[11px] font-medium text-brand/30">No Cover</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
        <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-text-heading">Quick Actions</h3>
        <ActionButtons
          id={reportId}
          contentType="thesis"
          title={report.title}
          fileHref={fileHref}
          hasFile={!!report.file_url}
          shareUrl={shareUrl}
          variant="compact"
          downloadSlot={
            <ThesisDownloadButton
              reportId={reportId}
              hasFile={!!report.file_url}
              variant="compact"
              thesisPath={thesisPath}
            />
          }
        />
      </div>

      {/* Metrics */}
      <MetricsPanel views={(report.view_count || 0) + 1} downloads={report.download_count || 0} />

      {/* Cite this */}
      <div id="cite-panel" className="scroll-mt-4">
        <CiteThis report={report} reportId={report.slug ?? reportId} institution={institution} />
      </div>

      <BackToTopButton />
    </aside>
  );
}
