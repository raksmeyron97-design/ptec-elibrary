/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/core/Badge";
import { getKeywords } from "@/lib/theses/report-fields";

export default function ThesisCard({ report }: { report: any }) {
  const formatCount = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
        ? `${(n / 1_000).toFixed(1)}K`
        : String(n || 0);

  const downloads = report.download_count || 0;
  const views = report.view_count || 0;
  const keywords = getKeywords(report).slice(0, 2);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-bg-surface border border-divider shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:border-brand/30">
      {/* Gold top-rule accent on hover */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-20 h-[3px] origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100"
      />

      <Link href={`/theses/${report.id}`} className="flex h-full flex-col">
        {/* ── Cover — the dominant visual element ── */}
        <div className="relative mx-3 mt-3 overflow-hidden rounded-xl sm:mx-3.5 sm:mt-3.5 border border-divider/60 shadow-sm ring-1 ring-black/[0.03]">
          <div className="relative aspect-[3/4] w-full bg-paper">
            {report.cover_url ? (
              <Image
                src={report.cover_url}
                alt={report.title}
                fill
                sizes="(max-width:768px) 50vw, 25vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-brand/5 to-brand/10">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-brand/25"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
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
        <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-3.5 sm:px-4 sm:pb-4 min-w-0">
          {/* Cohort pill */}
          {report.cohort && (
            <Badge variant="brand" className="mb-2 self-start !text-[9px] !px-2 !py-0.5 uppercase tracking-wide">
              Cohort {report.cohort}
            </Badge>
          )}

          {/* Title — emphasized as the primary identifier */}
          <h3 className="text-[13.5px] font-khmer-serif font-bold leading-snug tracking-tight text-text-heading line-clamp-2 transition-colors group-hover:text-brand sm:text-[15px]">
            {report.title}
          </h3>

          {/* Author — second-most prominent field */}
          {report.author_names && (
            <p className="mt-1.5 text-[11.5px] text-text-body line-clamp-1 sm:text-[12.5px] font-semibold">
              {report.author_names}
            </p>
          )}

          {/* Keywords */}
          {keywords.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {keywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded bg-bg-app px-1.5 py-0.5 text-[9px] font-medium text-text-muted line-clamp-1"
                >
                  {kw}
                </span>
              ))}
            </div>
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
