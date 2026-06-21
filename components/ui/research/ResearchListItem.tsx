/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import Image from "next/image";
import { Eye, Download, ArrowRight } from "lucide-react";
import CiteThis from "@/components/ui/research/CiteThis";
import {
  getKeywords,
  getDoi,
  getSourceLine,
} from "@/lib/research/report-fields";

export default function ResearchListItem({ report }: { report: any }) {
  const keywords = getKeywords(report).slice(0, 4);
  const doi = getDoi(report);
  const source = getSourceLine(report);

  return (
    <article className="group flex gap-4 rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm transition-all duration-200 hover:border-brand/30 hover:shadow-md sm:gap-5 sm:p-5">
      {/* Thumbnail */}
      <Link
        href={`/research/${report.id}`}
        className="relative hidden h-[132px] w-[99px] shrink-0 overflow-hidden rounded-xl border border-divider/60 bg-paper sm:block"
      >
        {report.cover_url ? (
          <Image
            src={report.cover_url}
            alt={report.title}
            fill
            sizes="99px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-brand/5 to-brand/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-brand/25"
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
      </Link>

      {/* Body */}
      <div className="min-w-0 flex-1">
        {source && (
          <p className="text-[11.5px] font-medium uppercase tracking-wider text-text-muted">
            {source}
          </p>
        )}

        <h3 className="mt-1">
          <Link
            href={`/research/${report.id}`}
            className="font-khmer-serif text-[16px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand sm:text-[18px]"
          >
            {report.title}
          </Link>
        </h3>

        {report.author_names && (
          <p className="mt-1 line-clamp-1 text-[13px] font-medium text-text-body">
            {report.author_names}
          </p>
        )}

        {report.abstract && (
          <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-text-muted">
            {report.abstract}
          </p>
        )}

        {keywords.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="rounded-full border border-divider bg-bg-app px-2.5 py-0.5 text-[11px] font-medium text-text-muted"
              >
                {kw}
              </span>
            ))}
          </div>
        )}

        {/* Footer row */}
        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400">
            <Eye className="h-3.5 w-3.5" />
            {report.view_count || 0}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-amber-600 dark:text-amber-400">
            <Download className="h-3.5 w-3.5" />
            {report.download_count || 0}
          </span>
          {doi && (
            <a
              href={doi.startsWith("http") ? doi : `https://doi.org/${doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11.5px] text-text-muted transition-colors hover:text-brand"
            >
              {doi.replace(/^https?:\/\/doi\.org\//, "")}
            </a>
          )}

          <div className="ml-auto flex items-center gap-2">
            <CiteThis report={report} reportId={report.id} compact />
            <Link
              href={`/research/${report.id}`}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-brand px-3.5 py-1.5 text-[12.5px] font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
            >
              View
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
