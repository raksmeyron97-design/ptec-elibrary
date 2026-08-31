import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { ArrowRight, Search, TrendingUp } from "lucide-react";
import type { SearchOpportunity } from "@/lib/admin/dashboard-shared";
import OpportunityActions from "./OpportunityActions";
import { numberFormat } from "./formatters";

/** The shared status vocabulary — `.dash-chip` reads its surface, border and
 *  ink from these, so a "zero results" badge here is the same red as a
 *  critical check in the health ribbon. */
const KIND_STATUS: Record<SearchOpportunity["kind"], string> = {
  zeroResult: "dash-status--crit",
  lowCoverage: "dash-status--warn",
  lowClickThrough: "dash-status--info",
};

/**
 * What readers looked for and did not find. Every row carries the numbers that
 * justify its recommendation — searches, matching resources, click-through —
 * so the panel never advises "add a resource" without showing why. Terms are
 * `dir="auto"` because Khmer and English queries share the list.
 */
export default async function SearchOpportunityPanel({
  opportunities,
  rangeLabel,
  searchHref,
}: {
  opportunities: SearchOpportunity[];
  rangeLabel: string;
  searchHref: string;
}) {
  const [t, locale] = await Promise.all([
    getTranslations("adminDashboard.opportunities"),
    getLocale(),
  ]);
  const nf = numberFormat(locale);

  return (
    <section aria-labelledby="opportunities-heading" className="dash-card flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="dash-ico dash-ico--md dash-ico--gold" aria-hidden="true">
            <Search className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 id="opportunities-heading" className="text-sm font-bold text-text-heading">
              {t("title")}
            </h2>
            <p className="text-xs text-text-muted">{t("subtitle", { range: rangeLabel })}</p>
          </div>
        </div>
        <Link
          href={searchHref}
          className="shrink-0 rounded-lg px-1.5 py-1 text-xs font-semibold text-brand hover:underline"
        >
          {t("viewAll")}
        </Link>
      </div>

      {opportunities.length === 0 ? (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-paper/60 px-3 py-8 text-center">
          <p className="text-xs font-semibold text-text-heading">{t("emptyTitle")}</p>
          <p className="max-w-xs text-xs text-text-muted">{t("emptyHint")}</p>
        </div>
      ) : (
        <ul className="mt-3 flex-1 space-y-1.5">
          {opportunities.map((o) => (
            <li key={o.term} className="rounded-xl border border-divider/70 bg-paper/40 p-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`${KIND_STATUS[o.kind]} dash-chip shrink-0 text-xs font-bold`}>
                  {t(`kind.${o.kind}`)}
                </span>
                <span
                  className="min-w-0 flex-1 dash-truncate text-sm font-semibold text-text-heading"
                  title={o.term}
                  dir="auto"
                >
                  {o.term}
                </span>
                {o.trending && (
                  <span className="dash-status--ok dash-chip shrink-0 text-xs font-bold">
                    <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    {t("trending")}
                  </span>
                )}
                {o.lang && (
                  <span className="shrink-0 rounded-md bg-paper px-1.5 py-0.5 text-xs font-semibold uppercase text-text-muted">
                    {o.lang}
                  </span>
                )}
              </div>

              {/* Evidence: the numbers behind the recommendation. */}
              <dl className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-muted">
                <div className="flex items-center gap-1">
                  <dt>{t("evidence.searches")}</dt>
                  <dd className="font-bold tabular-nums text-text-body">{nf.format(o.searches)}</dd>
                </div>
                <div className="flex items-center gap-1">
                  <dt>{t("evidence.results")}</dt>
                  <dd className="font-bold tabular-nums text-text-body">
                    {o.avgResults === null ? "—" : nf.format(o.avgResults)}
                  </dd>
                </div>
                <div className="flex items-center gap-1">
                  <dt>{t("evidence.ctr")}</dt>
                  <dd className="font-bold tabular-nums text-text-body">
                    {o.ctrPct === null ? "—" : `${o.ctrPct}%`}
                  </dd>
                </div>
              </dl>

              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-text-body">{t(`recommend.${o.kind}`)}</p>
                <OpportunityActions term={o.term} kind={o.kind} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2.5 flex items-center gap-1 border-t border-divider/70 pt-2 text-xs text-text-muted">
        <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
        {t("methodology")}
      </p>
    </section>
  );
}
