/* eslint-disable @typescript-eslint/no-explicit-any */
import Image from "next/image";
import { GraduationCap, Layers } from "lucide-react";
import ActionButtons from "@/components/ui/detail/ActionButtons";
import { getDoi } from "@/lib/theses/report-fields";
import { VerifiedBadge, LicenseBadge } from "@/components/ui/trust/TrustBadges";

function MetaChip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-paper px-2.5 py-1.5 text-[12.5px] font-medium text-text-body">
      <span className="text-text-muted">{icon}</span>
      {children}
    </span>
  );
}

export default function PublicationHero({
  report,
  reportId,
  fileHref,
  shareUrl,
}: {
  report: any;
  reportId: string;
  fileHref: string;
  shareUrl: string;
}) {
  const doi = getDoi(report);

  return (
    <header className="gradient-top-border fade-rise-in mb-7 overflow-hidden rounded-[28px] border border-divider bg-bg-surface p-5 shadow-sm sm:p-7 md:p-9">
      <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
        {/* Cover — large, left side */}
        <div className="mx-auto w-[160px] shrink-0 sm:mx-0 sm:w-[200px] md:w-[220px]">
          <div className="overflow-hidden rounded-2xl border border-divider/60 bg-paper shadow-md">
            <div className="relative aspect-[3/4] w-full">
              {report.cover_url ? (
                <Image
                  src={report.cover_url}
                  alt={report.title}
                  fill
                  priority
                  sizes="220px"
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
        </div>

        {/* Content — right side */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand/60" />
              Thesis
            </span>
            {doi && (
              <a
                href={doi.startsWith("http") ? doi : `https://doi.org/${doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm font-mono text-[11.5px] text-text-muted transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
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

          {/* Meta chips — just enough for a 5-second glance; the full
              Publication Details card below has every field. */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {report.cohort && <MetaChip icon={<Layers className="h-3.5 w-3.5" />}>Cohort {report.cohort}</MetaChip>}
            {report.academic_year && (
              <MetaChip icon={<GraduationCap className="h-3.5 w-3.5" />}>{report.academic_year}</MetaChip>
            )}
            <VerifiedBadge verifiedAt={report.verified_at} />
            <LicenseBadge license={report.license} />
          </div>

          {/* Actions */}
          <div className="mt-6">
            <ActionButtons
              id={reportId}
              contentType="thesis"
              title={report.title}
              fileHref={fileHref}
              hasFile={!!report.file_url}
              shareUrl={shareUrl}
              variant="full"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
