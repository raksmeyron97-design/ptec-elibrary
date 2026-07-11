/* eslint-disable @typescript-eslint/no-explicit-any */
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { Eye, Download, ArrowRight, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/core/Badge";
import { getKeywords, getYear, getDepartment, getLanguageLabel } from "@/lib/theses/report-fields";
import BookmarkButton from "@/components/ui/detail/BookmarkButton";
import ShareButton from "@/components/ui/books/ShareButton";
import { SITE_URL } from "@/lib/seo/site";
import { thesisHref } from "@/lib/theses";
import { getTranslations } from "next-intl/server";

export default async function ThesisCard({
  report,
  programLabel,
  facultyLabel,
}: {
  report: any;
  programLabel?: string | null;
  facultyLabel?: string | null;
}) {
  const t = await getTranslations("theses");
  const formatCount = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
        ? `${(n / 1_000).toFixed(1)}K`
        : String(n || 0);

  const downloads = report.download_count || 0;
  const views = report.view_count || 0;
  const keywords = getKeywords(report).slice(0, 3);
  const year = getYear(report);
  const department = facultyLabel ?? getDepartment(report);
  const language = getLanguageLabel(report);
  const hasFile = !!report.file_url;
  const metaLine = [programLabel, department, year, language].filter(Boolean).join(" · ");

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-bg-surface border border-divider shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:border-brand/30">
      {/* Gold top-rule accent on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[3px] origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100"
      />

      {/* Whole-card link — a stretched overlay so nested buttons/links below can
          still receive their own clicks without nesting <a> inside <a>. The
          focus ring is inset because the article clips overflow. */}
      <Link
        href={thesisHref(report)}
        aria-label={report.title}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
      />

      {/* Bookmark floats above everything */}
      <BookmarkButton
        id={report.id}
        contentType="thesis"
        className="absolute right-5 top-5 z-30 h-8 w-8 shadow-sm backdrop-blur-sm"
      />

      {/* Visible content — pointer-events disabled by default so clicks fall
          through to the card link; re-enabled only on the real controls. */}
      <div className="relative z-10 flex h-full flex-col pointer-events-none">
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
                <GraduationCap className="h-10 w-10 text-brand/25" strokeWidth={1.5} />
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

          {/* Program / Department / Year / Language */}
          {metaLine && (
            <p className="mt-1 text-[10.5px] text-text-muted line-clamp-1">{metaLine}</p>
          )}

          {/* Advisor */}
          {report.advisor_name && (
            <p className="mt-0.5 text-[10.5px] text-text-muted line-clamp-1">
              {t("advisorLabel")}: {report.advisor_name}
            </p>
          )}

          {/* Abstract preview */}
          {report.abstract && (
            <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-text-muted">
              {report.abstract}
            </p>
          )}

          {/* Keywords — real links, so they need pointer events re-enabled */}
          {keywords.length > 0 && (
            <div className="pointer-events-auto mt-2 flex flex-wrap gap-1">
              {keywords.map((kw) => (
                <Link
                  key={kw}
                  href={`/theses?keyword=${encodeURIComponent(kw)}`}
                  className="relative z-10 rounded bg-bg-app px-1.5 py-0.5 text-[9px] font-medium text-text-muted line-clamp-1 transition-colors duration-150 hover:bg-brand/10 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                >
                  {kw}
                </Link>
              ))}
            </div>
          )}

          {/* ── Footer ── */}
          <div className="mt-auto pt-4">
            {/* Metrics row */}
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
                <Eye className="h-3 w-3" />
                {formatCount(views)}
              </span>
              {downloads > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
                  <Download className="h-3 w-3" />
                  {formatCount(downloads)}
                </span>
              )}
            </div>

            {/* Actions row — real controls, pointer events re-enabled */}
            <div className="pointer-events-auto mt-2.5 flex items-center gap-1.5">
              <span className="inline-flex flex-1 items-center justify-center gap-0.5 rounded-full border border-brand/15 bg-brand/5 px-3 py-1.5 text-[11px] font-bold text-brand transition-all duration-150 group-hover:border-brand group-hover:bg-brand group-hover:text-brand-contrast group-active:scale-[0.97]">
                {t("viewAction")}
                <ArrowRight className="h-3 w-3 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2.5} />
              </span>

              {hasFile && (
                <a
                  href={`/api/theses/${report.id}/file?download=1`}
                  aria-label={t("downloadPdf")}
                  title={t("downloadPdf")}
                  className="relative z-10 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-divider bg-bg-surface text-text-muted transition-colors duration-150 hover:border-brand/40 hover:text-brand active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              )}

              <span className="relative z-10 shrink-0">
                <ShareButton
                  url={`${SITE_URL}${thesisHref(report)}`}
                  title={report.title}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-divider bg-bg-surface text-text-muted transition-colors duration-150 hover:border-brand/40 hover:text-brand active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                />
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
