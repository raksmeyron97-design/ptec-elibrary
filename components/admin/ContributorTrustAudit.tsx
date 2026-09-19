import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, ExternalLink, UserRoundX } from "lucide-react";

import type { ContributorTrustReport } from "@/lib/admin/contributor-trust-report";

// Read-only contributor panel for the Data Quality dashboard. Server
// component — no interactivity, no client bundle.
//
// It reports a decision that has ALREADY been taken automatically (a name that
// identifies nobody is withdrawn from the public directory, the sitemap and
// the author page's structured data) and one that has NOT (everything else).
// The distinction is the first thing each row states, because a librarian
// reading this list needs to know which half of it is waiting for them.
//
// There is deliberately no action button beyond "open the page". Retiring or
// merging a contributor row changes URLs and re-attributes works; those live
// in the audited admin workflows that already own them.

export default async function ContributorTrustAudit({ data }: { data: ContributorTrustReport }) {
  const t = await getTranslations("adminDataQuality");
  const { findings, counts } = data;
  const healthy = findings.length === 0;

  return (
    <section
      aria-labelledby="contributor-trust-title"
      className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider p-5">
        <div className="flex items-start gap-2.5">
          <UserRoundX className="mt-0.5 h-4 w-4 text-brand" aria-hidden="true" />
          <div>
            <h2 id="contributor-trust-title" className="text-[15px] font-bold text-text-heading">
              {t("contributors.title")}
            </h2>
            <p className="mt-1 text-[12px] text-text-muted">
              {t("contributors.subtitle", { checked: counts.checked })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {counts.suppressed > 0 && (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
              {t("contributors.suppressed", { count: counts.suppressed })}
            </span>
          )}
          {counts.flagged > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
              {t("contributors.flagged", { count: counts.flagged })}
            </span>
          )}
        </div>
      </div>

      {healthy ? (
        <div className="px-5 py-12 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-success" aria-hidden="true" />
          <p className="mt-3 text-[14px] font-semibold text-text-heading">
            {t("contributors.healthyTitle")}
          </p>
          <p className="mt-1 text-[12px] text-text-muted">{t("contributors.healthyBody")}</p>
        </div>
      ) : (
        <>
          {counts.worksAffected > 0 && (
            <p className="border-b border-divider bg-paper/60 px-5 py-3 text-[11.5px] text-text-muted">
              {t("contributors.worksAffected", { count: counts.worksAffected })}
            </p>
          )}
          <ol className="divide-y divide-divider">
            {findings.map((f) => (
              <li key={f.slug} className="group p-4 transition hover:bg-paper/60 sm:px-5">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                      f.trust === "invalid" ? "bg-rose-500" : "bg-amber-400"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 truncate text-[13.5px] font-semibold text-text-heading">
                        {f.name}
                      </p>
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-text-muted">
                        {t("contributors.works", { count: f.workCount })}
                      </span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-text-muted">
                      <span
                        className={
                          f.trust === "invalid" ? "font-semibold text-rose-700" : "text-amber-800"
                        }
                      >
                        {t(`contributors.state.${f.trust}`)}
                      </span>
                      {" — "}
                      {t(`contributors.reason.${f.reason}`)}
                    </p>
                  </div>
                  <Link
                    href={`/authors/${encodeURIComponent(f.slug)}`}
                    prefetch={false}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-body transition hover:border-brand/40 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    aria-label={t("contributors.openAria", { name: f.name })}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                    {t("contributors.open")}
                  </Link>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-divider bg-paper/60 px-5 py-3 text-[11.5px] text-text-muted">
            {counts.suppressed + counts.flagged > findings.length && (
              <p>
                {t("contributors.showing", {
                  shown: findings.length,
                  total: counts.suppressed + counts.flagged,
                })}
              </p>
            )}
            <p className="mt-1">{t("contributors.note")}</p>
          </div>
        </>
      )}
    </section>
  );
}
