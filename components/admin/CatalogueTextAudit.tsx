import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, FileText, Scissors, SquarePen } from "lucide-react";

import {
  TITLE_TRUNCATION_LENGTH,
  type CatalogueTextReport,
} from "@/lib/admin/catalogue-text-report";

// Read-only catalogue-text panel for the Data Quality dashboard. Server
// component — no interactivity, no client bundle, the same shape as
// ContributorTrustAudit.
//
// It reports two things nothing in this repository measured before: how much of
// the library's prose is one sentence with the title swapped in, and which
// titles were cut by a process upstream of this codebase.
//
// There is deliberately no "fix" button. The grade number a cut title lost is
// on the book's title page and nowhere in this database, and a generated
// replacement description would be fluent prose about a book nothing here has
// read. Both are a librarian's work; this ranks it.

/** How many of each family to draw. The rest are counted, not listed. */
const TEMPLATES_SHOWN = 6;
const TITLES_SHOWN = 12;

export default async function CatalogueTextAudit({ data }: { data: CatalogueTextReport }) {
  const t = await getTranslations("adminDataQuality");
  const { templates, truncatedTitles, counts } = data;
  const healthy = templates.length === 0 && truncatedTitles.length === 0;
  const sharePercent = Math.round(counts.templatedShare * 100);

  return (
    <section
      aria-labelledby="catalogue-text-title"
      className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider p-5">
        <div className="flex items-start gap-2.5">
          <FileText className="mt-0.5 h-4 w-4 text-brand" aria-hidden="true" />
          <div>
            <h2 id="catalogue-text-title" className="text-[15px] font-bold text-text-heading">
              {t("catalogueText.title")}
            </h2>
            <p className="mt-1 text-[12px] text-text-muted">
              {t("catalogueText.subtitle", { examined: counts.examined })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {counts.templated > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
              {t("catalogueText.templatedBadge", { percent: sharePercent })}
            </span>
          )}
          {counts.truncatedTitles > 0 && (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
              {t("catalogueText.truncatedBadge", { count: counts.truncatedTitles })}
            </span>
          )}
        </div>
      </div>

      {healthy ? (
        <div className="px-5 py-12 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-success" aria-hidden="true" />
          <p className="mt-3 text-[14px] font-semibold text-text-heading">
            {t("catalogueText.healthyTitle")}
          </p>
          <p className="mt-1 text-[12px] text-text-muted">{t("catalogueText.healthyBody")}</p>
        </div>
      ) : (
        <>
          {/* ── Shared descriptions ────────────────────────────────────── */}
          {templates.length > 0 && (
            <div className="border-b border-divider">
              <div className="flex items-center gap-2 bg-paper/60 px-5 py-3">
                <SquarePen className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                <p className="text-[11.5px] text-text-muted">
                  {t("catalogueText.templatesLead", {
                    templated: counts.templated,
                    described: counts.described,
                    groups: counts.templateGroups,
                  })}
                </p>
              </div>
              <ol className="divide-y divide-divider">
                {templates.slice(0, TEMPLATES_SHOWN).map((template) => (
                  <li key={template.key} className="p-4 sm:px-5">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 tabular-nums">
                        {template.count}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className="line-clamp-2 text-[13px] leading-relaxed text-text-body"
                          title={template.sample}
                        >
                          {template.sample}
                        </p>
                        <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[11.5px] text-text-muted">
                          {template.examples.map((example) => (
                            <Link
                              key={example.id}
                              href={example.editUrl}
                              prefetch={false}
                              className="truncate underline decoration-dotted underline-offset-2 transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                            >
                              {example.title}
                            </Link>
                          ))}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              {templates.length > TEMPLATES_SHOWN && (
                <p className="px-5 py-2.5 text-[11.5px] text-text-muted">
                  {t("catalogueText.moreTemplates", {
                    count: templates.length - TEMPLATES_SHOWN,
                  })}
                </p>
              )}
            </div>
          )}

          {/* ── Cut titles ─────────────────────────────────────────────── */}
          {truncatedTitles.length > 0 && (
            <div>
              <div className="flex items-center gap-2 bg-paper/60 px-5 py-3">
                <Scissors className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                <p className="text-[11.5px] text-text-muted">
                  {t("catalogueText.truncatedLead", {
                    count: counts.truncatedTitles,
                    length: TITLE_TRUNCATION_LENGTH,
                    colliding: counts.truncatedAndColliding,
                  })}
                </p>
              </div>
              <ol className="divide-y divide-divider">
                {truncatedTitles.slice(0, TITLES_SHOWN).map((finding) => (
                  <li key={finding.id} className="group p-4 transition hover:bg-paper/60 sm:px-5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold text-text-heading">
                          {finding.title}
                        </p>
                        {finding.sharedWith > 0 && (
                          <p className="mt-1 text-[11.5px] text-rose-700">
                            {t("catalogueText.sharedWith", { count: finding.sharedWith })}
                          </p>
                        )}
                      </div>
                      <Link
                        href={finding.editUrl}
                        prefetch={false}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-body transition hover:border-brand/40 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        aria-label={t("catalogueText.retitleAria", { title: finding.title })}
                      >
                        <SquarePen className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                        {t("catalogueText.retitle")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
              {truncatedTitles.length > TITLES_SHOWN && (
                <p className="px-5 py-2.5 text-[11.5px] text-text-muted">
                  {t("catalogueText.moreTitles", {
                    count: truncatedTitles.length - TITLES_SHOWN,
                  })}
                </p>
              )}
            </div>
          )}

          <div className="border-t border-divider bg-paper/60 px-5 py-3 text-[11.5px] text-text-muted">
            {t("catalogueText.note")}
          </div>
        </>
      )}
    </section>
  );
}
