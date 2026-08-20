/* eslint-disable @typescript-eslint/no-explicit-any */
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { ArrowRight, GraduationCap, FileX2 } from "lucide-react";
import ResourceMetrics from "@/components/ui/core/ResourceMetrics";
import ThesisCardDownload from "@/components/ui/theses/ThesisCardDownload";
import CiteThis from "@/components/ui/theses/CiteThis";
import BookmarkButton from "@/components/ui/detail/BookmarkButton";
import ShareButton from "@/components/ui/books/ShareButton";
import { SITE_URL } from "@/lib/seo/site";
import { thesisHref } from "@/lib/theses";
import { getTranslations } from "next-intl/server";
import {
  getKeywords,
  getDoi,
  getDepartment,
  getLanguageLabel,
  getCoAdvisor,
} from "@/lib/theses/report-fields";
import { getOrgIdentity } from "@/lib/system-settings/config";

// One search result.
//
// ── The hierarchy fix ──
// The row used to open with a 70-character uppercase run —
// "THESIS · BACHELOR OF EDUCATION (12+4) · COHORT 3 · 2021-2025 · PRIMARY
// EDUCATION" — set ABOVE the title. That is the loudest, widest element in the
// row carrying the least distinguishing information: on a page that only ever
// lists theses, "THESIS" separates nothing, and the program repeats down every
// row of a filtered list. Scanning the column meant reading the same banner
// five times to reach five different titles.
//
// Now the title leads, and the provenance line sits under it in sentence case
// as ink rather than as a label: cohort, faculty, year — the three facts that
// actually place one thesis against another in this collection, and the same
// three the facet rail is built from. The record type and the program moved
// into that line's tail where they cost nothing.
//
// ── The card ──
// A result is a card, matching the record page's surface language, not a
// bordered row in an edge-to-edge table. Hover moves the border, not the card:
// a list of ten results that each lift on hover is ten invitations to look
// somewhere other than where you are looking.

export default async function ThesisListItem({
  report,
  programLabel,
  facultyLabel,
}: {
  report: any;
  programLabel?: string | null;
  facultyLabel?: string | null;
}) {
  const [t, org] = await Promise.all([getTranslations("theses"), getOrgIdentity()]);
  const keywords = getKeywords(report).slice(0, 4);
  const doi = getDoi(report);
  const language = getLanguageLabel(report);
  const advisor = report.advisor_name || null;
  const coAdvisor = getCoAdvisor(report);
  const hasFile = !!report.file_url;

  // Cohort · Faculty · Year — the collection's own axes, strongest first.
  // Every part optional; `facultyLabel` is the page-resolved name and
  // getDepartment() is the fallback for call sites that don't resolve it.
  const provenance = [
    report.cohort ? `Cohort ${report.cohort}` : null,
    facultyLabel ?? getDepartment(report),
    report.academic_year || null,
  ].filter(Boolean);

  // The quieter tail: program and language. Kept apart from the provenance
  // line so the eye reads three facts, not five.
  const tail = [programLabel, language].filter(Boolean);

  return (
    <article className="group relative rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm transition-colors duration-150 hover:border-brand/30 sm:p-5">
      <div className="flex gap-4 sm:gap-5">
        {/* Cover. aria-hidden and tabIndex -1: it goes to the same place as
            the title link two elements away, and a screen-reader user does not
            need to be told twice. */}
        <Link
          href={thesisHref(report)}
          tabIndex={-1}
          aria-hidden="true"
          className="relative hidden h-[132px] w-[99px] shrink-0 overflow-hidden rounded-xl border border-divider bg-paper sm:block"
        >
          {report.cover_url ? (
            <Image
              src={report.cover_url}
              alt=""
              fill
              loading="lazy"
              sizes="99px"
              className="object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <GraduationCap className="h-8 w-8 text-text-muted" strokeWidth={1.5} />
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0">
              <Link
                href={thesisHref(report)}
                className="rounded-sm font-khmer-serif text-[17px] font-bold leading-[1.4] text-text-heading transition-colors duration-150 group-hover:text-brand sm:text-[19px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                {report.title}
              </Link>
            </h3>
            <BookmarkButton
              id={report.id}
              contentType="thesis"
              className="h-8 w-8 shrink-0"
            />
          </div>

          {provenance.length > 0 && (
            <p className="mt-1.5 text-[13px] text-text-body">
              {provenance.join(" · ")}
              {tail.length > 0 && (
                <span className="text-text-muted"> · {tail.join(" · ")}</span>
              )}
            </p>
          )}

          {(report.author_names || advisor) && (
            <p className="mt-1 line-clamp-1 text-[13px] text-text-muted">
              {report.author_names && (
                <span className="font-semibold text-text-heading">{report.author_names}</span>
              )}
              {report.author_names && advisor && <span> · </span>}
              {advisor && (
                <>
                  {t("advisorLabel")}: {advisor}
                  {coAdvisor && <>, {coAdvisor}</>}
                </>
              )}
            </p>
          )}

          {report.abstract && (
            <p className="mt-2.5 line-clamp-2 max-w-[86ch] text-[13.5px] leading-[1.6] text-text-muted">
              {report.abstract}
            </p>
          )}

          {keywords.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {keywords.map((kw) => (
                <Link
                  key={kw}
                  href={`/theses?keyword=${encodeURIComponent(kw)}`}
                  className="inline-flex h-[26px] items-center rounded-full bg-surface-brand-soft px-3 text-[11.5px] text-brand transition-colors duration-150 hover:bg-brand hover:text-brand-contrast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                >
                  {kw}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer: facts on the left, actions on the right, separated from the
          body by a hairline so the row's two jobs do not run together. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-divider pt-3.5">
        <ResourceMetrics views={report.view_count} downloads={report.download_count} size="md" />
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
        {!hasFile && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-text-muted">
            <FileX2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("pdfUnavailable")}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <CiteThis
            report={report}
            reportId={report.slug ?? report.id}
            institution={org.institutionName}
            compact
          />
          <ShareButton
            url={`${SITE_URL}${thesisHref(report)}`}
            title={report.title}
            className="inline-flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-lg border border-divider text-text-muted transition-colors duration-150 hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          />
          {hasFile && (
            <ThesisCardDownload
              reportId={report.id}
              thesisPath={thesisHref(report)}
              label={t("downloadPdf")}
              className="inline-flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-lg border border-divider text-text-muted transition-colors duration-150 hover:border-brand/40 hover:text-brand disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              iconClassName="h-4 w-4"
            />
          )}
          <Link
            href={thesisHref(report)}
            className="inline-flex h-[32px] cursor-pointer items-center gap-1 rounded-lg bg-brand px-3.5 text-[12.5px] font-bold text-brand-contrast transition-colors duration-150 hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
          >
            {t("viewAction")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
