import { getTranslations, getLocale } from "next-intl/server";
import { MousePointerClick, BookOpenCheck, Download, Search, Eye } from "lucide-react";
import type { DiscoveryRates, DiscoveryVolumes } from "@/lib/admin/dashboard-shared";
import InfoTip from "./InfoTip";
import { numberFormat } from "./formatters";

export type ConversionSummary = {
  valuePct: number | null;
  prevPct: number | null;
  insufficient: boolean;
};

type RateKey = "searchCtr" | "readRate" | "downloadRate";

/** Whether a rate's two sides come from one instrumented interaction. */
const ATTRIBUTION: Record<RateKey, "attributable" | "independent"> = {
  searchCtr: "attributable",
  readRate: "independent",
  downloadRate: "independent",
};

/**
 * Two clearly separated pathways instead of one implied funnel.
 *
 * The event streams are independent — readers also arrive on a detail page
 * straight from Google or a shared link, never having searched — so presenting
 * them as consecutive funnel stages would invent a journey the data cannot
 * support. Each rate therefore states its own numerator, denominator and
 * attribution class:
 *
 *  - "attributable": both sides come from the same instrumented interaction
 *    (a search and the click on its results).
 *  - "independent": both sides are measured, but no event links one to the
 *    other; the ratio describes population behaviour, not a per-visitor path.
 *
 * Rates whose populations are not comparable (ratio > 100%, e.g. downloads
 * recorded before view instrumentation covered every surface) show an
 * explanatory dash rather than a misleading percentage.
 */
export default async function EngagementPathways({
  volumes,
  prevVolumes,
  rates,
  prevRates,
  compare,
  conversion,
}: {
  volumes: DiscoveryVolumes;
  prevVolumes: DiscoveryVolumes;
  rates: DiscoveryRates;
  prevRates: DiscoveryRates;
  compare: boolean;
  conversion?: ConversionSummary;
}) {
  const [t, locale] = await Promise.all([getTranslations("adminDashboard.discovery"), getLocale()]);
  const nf = numberFormat(locale);

  // A previous-period percentage off a tiny base ("100% previously" from one
  // search) misleads more than it informs.
  const MIN_PREV_BASE = 20;
  const prevDenominator: Record<RateKey, number> = {
    searchCtr: prevVolumes.searches,
    readRate: prevVolumes.detailViews,
    downloadRate: prevVolumes.detailViews,
  };
  const numerator: Record<RateKey, number | null> = {
    searchCtr: volumes.resultClicks,
    readRate: volumes.readerOpens,
    downloadRate: volumes.downloadsOrSaves,
  };
  const denominator: Record<RateKey, number> = {
    searchCtr: volumes.searches,
    readRate: volumes.detailViews,
    downloadRate: volumes.detailViews,
  };

  const step = (key: RateKey, icon: React.ReactNode, tint: "views" | "reader" | "downloads", collecting: boolean) => {
    const rate = rates[key];
    const prev = prevRates[key];
    const prevMeaningful = prevDenominator[key] >= MIN_PREV_BASE;
    const delta =
      compare && prevMeaningful && rate.pct !== null && prev.pct !== null && rate.comparable && prev.comparable
        ? Math.round((rate.pct - prev.pct) * 10) / 10
        : null;
    const num = numerator[key];

    return (
      <div key={key} className="dash-pathway-step">
        <span className={`dash-ico dash-ico--${tint} dash-ico--sm`} aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          {/* Deliberately a div, not a paragraph: InfoTip renders a details
              element, and a block-level start tag makes the HTML parser
              auto-close an open paragraph. The client DOM would then not match
              the server HTML and React would throw a hydration error. */}
          <div className="flex items-center gap-1 text-[12.5px] font-semibold text-text-body">
            {t(`rates.${key}`)}
            <InfoTip label={t(`rates.${key}`)} text={t(`rates.${key}Def`)} />
          </div>
          <p className="text-[11px] tabular-nums text-text-muted">
            {collecting || num === null
              ? t("collecting")
              : t("ratio", { numerator: nf.format(num), denominator: nf.format(denominator[key]) })}
          </p>
        </div>
        <div className="shrink-0 text-end">
          <p className="text-[17px] font-bold leading-tight tabular-nums text-text-heading">
            {collecting ? (
              <span className="text-[12px] font-semibold text-sky-900">{t("collecting")}</span>
            ) : rate.pct !== null && rate.comparable ? (
              `${rate.pct}%`
            ) : (
              "—"
            )}
          </p>
          {compare && !collecting && prevMeaningful && prev.pct !== null && prev.comparable && (
            <p className="text-[10.5px] tabular-nums text-text-muted">
              {t("prevPct", { pct: prev.pct })}
              {delta !== null && delta !== 0 && (
                <span className={`ms-1 font-semibold ${delta > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {delta > 0 ? "+" : ""}
                  {delta}
                </span>
              )}
            </p>
          )}
          {!collecting && rate.pct !== null && !rate.comparable && (
            <p className="max-w-[130px] text-[10px] leading-3 text-text-muted">{t("notComparable")}</p>
          )}
          <p className="mt-0.5 text-[9.5px] font-bold uppercase tracking-wide text-text-muted">
            {t(`attribution.${ATTRIBUTION[key]}`)}
          </p>
        </div>
      </div>
    );
  };

  const readerCollecting = volumes.readerOpens === null;

  return (
    <div className="space-y-3">
      {/* ── Pathway A: search discovery ── */}
      <section aria-labelledby="pathway-search">
        <h4 id="pathway-search" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">
          <Search className="h-3 w-3" aria-hidden="true" />
          {t("pathway.search")}
        </h4>
        <div className="mt-1.5 space-y-1.5">
          {step("searchCtr", <MousePointerClick className="h-[15px] w-[15px]" />, "views", false)}
        </div>
        <p className="mt-1 text-[10.5px] leading-4 text-text-muted">{t("pathway.searchNote")}</p>
      </section>

      {/* ── Pathway B: content engagement ── */}
      <section aria-labelledby="pathway-content">
        <h4 id="pathway-content" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">
          <Eye className="h-3 w-3" aria-hidden="true" />
          {t("pathway.content")}
        </h4>
        <div className="mt-1.5 space-y-1.5">
          {step("readRate", <BookOpenCheck className="h-[15px] w-[15px]" />, "reader", readerCollecting)}
          {step("downloadRate", <Download className="h-[15px] w-[15px]" />, "downloads", false)}
        </div>
      </section>

      {conversion && (
        <div className="flex items-center gap-3 rounded-xl border border-brand/15 bg-brand/[0.04] px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[12.5px] font-semibold text-text-body">
              {t("conversion")}
              <InfoTip label={t("conversion")} text={t("conversionDef")} />
            </div>
            <p className="text-[11px] text-text-muted">{t("conversionShortDef")}</p>
          </div>
          <div className="shrink-0 text-end">
            <p className="text-[19px] font-bold leading-none tabular-nums text-text-heading">
              {conversion.insufficient || conversion.valuePct === null ? (
                <span className="text-[12px] font-semibold text-text-muted">{t("conversionInsufficient")}</span>
              ) : (
                `${conversion.valuePct}%`
              )}
            </p>
            {compare && !conversion.insufficient && conversion.prevPct !== null && (
              <p className="mt-0.5 text-[10.5px] tabular-nums text-text-muted">
                {t("prevPct", { pct: conversion.prevPct })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Raw volumes — deliberately a flat list, no implied sequence. */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-divider/70 pt-2.5 sm:grid-cols-3 lg:grid-cols-2">
        {(
          [
            ["searches", volumes.searches, prevVolumes.searches],
            ["resultClicks", volumes.resultClicks, prevVolumes.resultClicks],
            ["detailViews", volumes.detailViews, prevVolumes.detailViews],
            ["readerOpens", volumes.readerOpens, prevVolumes.readerOpens],
            ["downloadsOrSaves", volumes.downloadsOrSaves, prevVolumes.downloadsOrSaves],
          ] as const
        ).map(([key, value, prev]) => (
          <div key={key} className="min-w-0">
            <dt className="truncate text-[10.5px] font-medium text-text-muted">{t(`volumes.${key}`)}</dt>
            <dd className="text-[13px] font-bold tabular-nums text-text-heading">
              {value === null ? t("collectingShort") : nf.format(value)}
              {compare && prev !== null && prev > 0 && value !== null && (
                <span className="ms-1 text-[10px] font-normal text-text-muted">
                  {t("prev", { value: nf.format(prev) })}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[10.5px] leading-4 text-text-muted">{t("definition")}</p>
    </div>
  );
}
