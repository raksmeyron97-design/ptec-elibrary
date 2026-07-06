/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import Image from "next/image";
import { Eye, Download, ArrowRight, GraduationCap } from "lucide-react";
import CiteThis from "@/components/ui/theses/CiteThis";
import BookmarkButton from "@/components/ui/detail/BookmarkButton";
import ShareButton from "@/components/ui/books/ShareButton";
import { SITE_URL } from "@/lib/seo/site";
import { thesisHref } from "@/lib/theses";
import {
  getKeywords,
  getDoi,
  getSourceLine,
} from "@/lib/theses/report-fields";

export default function ThesisListItem({ report }: { report: any }) {
  const keywords = getKeywords(report).slice(0, 4);
  const doi = getDoi(report);
  const source = getSourceLine(report);

  return (
    <article className="group relative flex gap-4 rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm transition-all duration-200 hover:border-brand/30 hover:shadow-md sm:gap-5 sm:p-5">
      {/* Thumbnail */}
      <Link
        href={thesisHref(report)}
        tabIndex={-1}
        aria-hidden="true"
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
            <GraduationCap className="h-8 w-8 text-brand/25" strokeWidth={1.5} />
          </div>
        )}
      </Link>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          {source && (
            <p className="text-[11.5px] font-medium uppercase tracking-wider text-text-muted">
              {source}
            </p>
          )}
          <BookmarkButton id={report.id} contentType="thesis" className="h-8 w-8 shrink-0" />
        </div>

        <h3 className="mt-1">
          <Link
            href={thesisHref(report)}
            className="rounded-sm font-khmer-serif text-[16px] font-bold leading-snug text-text-heading transition-colors duration-150 group-hover:text-brand sm:text-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
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
          <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-text-muted">
            {report.abstract}
          </p>
        )}

        {keywords.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {keywords.map((kw) => (
              <Link
                key={kw}
                href={`/theses?keyword=${encodeURIComponent(kw)}`}
                className="rounded-full border border-divider bg-bg-app px-2.5 py-0.5 text-[11px] font-medium text-text-muted transition-colors duration-150 hover:border-brand/40 hover:bg-brand/10 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                {kw}
              </Link>
            ))}
          </div>
        )}

        {/* Footer row */}
        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-700 dark:text-emerald-400">
            <Eye className="h-3.5 w-3.5" />
            {report.view_count || 0}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-amber-700 dark:text-amber-400">
            <Download className="h-3.5 w-3.5" />
            {report.download_count || 0}
          </span>
          {doi && (
            <a
              href={doi.startsWith("http") ? doi : `https://doi.org/${doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm font-mono text-[11.5px] text-text-muted transition-colors duration-150 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              {doi.replace(/^https?:\/\/doi\.org\//, "")}
            </a>
          )}

          <div className="ml-auto flex items-center gap-2">
            <CiteThis report={report} reportId={report.slug ?? report.id} compact />
            <ShareButton
              url={`${SITE_URL}${thesisHref(report)}`}
              title={report.title}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-divider bg-bg-surface text-text-muted transition-colors duration-150 hover:border-brand/40 hover:text-brand active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            />
            <a
              href={`/api/theses/${report.id}/file?download=1`}
              aria-label="Download PDF"
              title="Download PDF"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-divider bg-bg-surface text-text-muted transition-colors duration-150 hover:border-brand/40 hover:text-brand active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              <Download className="h-4 w-4" />
            </a>
            <Link
              href={thesisHref(report)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-brand px-3.5 py-1.5 text-[12.5px] font-bold text-brand-contrast transition-all duration-150 hover:bg-brand-hover active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 focus-visible:ring-offset-1"
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
