import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, Search, Pencil } from "lucide-react";
import type { SeoHealthResult, SeoIssueCode, SeoResourceType } from "@/lib/seo/health";

// Read-only SEO health panel for the Data Quality dashboard (§25). Surfaces
// SEO/Scholar-specific issues over published, indexable resources: non-unique
// titles, missing social images, and the citation_* metadata Scholar needs on
// theses & publications. Server component — no interactivity, no client bundle.

const ISSUE_LABEL_KEY: Record<SeoIssueCode, string> = {
  duplicate_title: "seo.issue.duplicateTitle",
  missing_social_image: "seo.issue.missingSocialImage",
  scholar_missing_author: "seo.issue.scholarMissingAuthor",
  scholar_missing_date: "seo.issue.scholarMissingDate",
  scholar_missing_abstract: "seo.issue.scholarMissingAbstract",
};

const TYPE_LABEL_KEY: Record<SeoResourceType, string> = {
  book: "seo.type.book",
  research: "seo.type.research",
  publication: "seo.type.publication",
  learning_path: "seo.type.learningPath",
  catalog: "seo.type.catalog",
  post: "seo.type.post",
};

export default async function SeoHealthAudit({ data }: { data: SeoHealthResult }) {
  const t = await getTranslations("adminDataQuality");
  const { findings, counts } = data;
  const healthy = counts.total === 0;

  return (
    <section
      aria-labelledby="seo-health-title"
      className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider p-5">
        <div className="flex items-start gap-2.5">
          <Search className="mt-0.5 h-4 w-4 text-brand" aria-hidden="true" />
          <div>
            <h2 id="seo-health-title" className="text-[15px] font-bold text-text-heading">
              {t("seo.title")}
            </h2>
            <p className="mt-1 text-[12px] text-text-muted">
              {t("seo.subtitle", { resources: counts.resourcesChecked, scholarly: counts.scholarlyChecked })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {counts.high > 0 && (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
              {t("seo.high", { count: counts.high })}
            </span>
          )}
          {counts.medium > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
              {t("seo.medium", { count: counts.medium })}
            </span>
          )}
        </div>
      </div>

      {healthy ? (
        <div className="px-5 py-12 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-success" aria-hidden="true" />
          <p className="mt-3 text-[14px] font-semibold text-text-heading">{t("seo.healthyTitle")}</p>
          <p className="mt-1 text-[12px] text-text-muted">{t("seo.healthyBody")}</p>
        </div>
      ) : (
        <>
          <ol className="divide-y divide-divider">
            {findings.map((f) => (
              <li key={`${f.type}-${f.id}-${f.issue}`} className="group p-4 transition hover:bg-paper/60 sm:px-5">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                      f.severity === "high" ? "bg-rose-500" : "bg-amber-400"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 truncate text-[13.5px] font-semibold text-text-heading">{f.title}</p>
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-text-muted">
                        {t(TYPE_LABEL_KEY[f.type])}
                      </span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-text-muted">
                      <span className={f.severity === "high" ? "font-semibold text-rose-700" : "text-amber-800"}>
                        {t(ISSUE_LABEL_KEY[f.issue])}
                      </span>
                    </p>
                  </div>
                  <Link
                    href={f.editUrl}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-body transition hover:border-brand/40 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    aria-label={t("seo.editAria", { title: f.title })}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> {t("seo.edit")}
                  </Link>
                </div>
              </li>
            ))}
          </ol>
          {counts.total > findings.length && (
            <div className="border-t border-divider bg-paper/60 px-5 py-3 text-[11.5px] text-text-muted">
              {t("seo.showing", { shown: findings.length, total: counts.total })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
