import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/core/Badge";

export default function ResearchCard({ report }: { report: any }) {
  const formatCount = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
        ? `${(n / 1_000).toFixed(1)}K`
        : String(n || 0);

  const downloads = report.download_count || 0;
  const views = report.view_count || 0;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl bg-bg-surface border border-divider shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-md hover:border-brand/20">
      {/* Gold top-rule accent on hover */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-20 h-[3px] origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100"
      />
      
      <Link href={`/research/${report.id}`} className="flex h-full flex-col">
        {/* ── Cover ── */}
        <div className="relative mx-3 mt-3 overflow-hidden rounded-lg sm:mx-3.5 sm:mt-3.5 border border-divider/50">
          <div className="relative aspect-[3/4] w-full bg-paper">
            {report.cover_url ? (
              <Image
                src={report.cover_url}
                alt={report.title}
                fill
                sizes="(max-width:768px) 50vw, 25vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-brand/5 text-brand/40">
                No Cover
              </div>
            )}

            {/* Academic Year badge — top right */}
            {report.academic_year && (
              <span className="absolute right-2 top-2 z-[4] rounded-md bg-bg-surface/90 px-2 py-[3px] text-[9px] font-bold uppercase tracking-wider text-text-muted shadow-sm backdrop-blur-sm border border-divider/50">
                {report.academic_year}
              </span>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-4 sm:px-4 sm:pb-4 min-w-0">
          {/* Cohort pill */}
          {report.cohort && (
            <Badge variant="brand" className="mb-2 self-start !text-[9px] !px-2 !py-0.5 uppercase tracking-wide">
              Cohort {report.cohort}
            </Badge>
          )}

          {/* Title */}
          <h3 className="text-[13px] font-khmer-serif font-bold leading-snug text-text-heading line-clamp-2 sm:text-[14px]">
            {report.title}
          </h3>

          {/* Author */}
          {report.author_names && (
            <p className="mt-1 text-[11px] text-text-muted line-clamp-1 sm:text-[12px] font-medium">
              {report.author_names}
            </p>
          )}

          {/* ── Footer ── */}
          <div className="mt-auto pt-4">
            {/* Meta row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Downloads */}
                {downloads > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 3v13m0 0-4-4m4 4 4-4" />
                      <path d="M4 20h16" />
                    </svg>
                    {formatCount(downloads)}
                  </span>
                )}

                {/* Views */}
                <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {formatCount(views)}
                </span>
              </div>

              {/* CTA */}
              <span className="inline-flex items-center gap-0.5 rounded-full border border-brand/15 bg-brand/5 px-3 py-1.5 text-[11px] font-bold text-brand transition-colors group-hover:border-brand group-hover:bg-brand group-hover:text-brand-contrast sm:px-2.5 sm:py-1 sm:text-[10px]">
                View
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
