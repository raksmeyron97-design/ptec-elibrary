import { getTranslations, getLocale } from "next-intl/server";
import { MousePointerClick, BookOpenCheck, Download, Search, Eye, Activity } from "lucide-react";
import type { DiscoveryRates, DiscoveryVolumes } from "@/lib/admin/dashboard-shared";
import InfoTip from "./InfoTip";
import { numberFormat } from "./formatters";
import { deriveRateComparison } from "./engagement-insights";

export type ConversionSummary = {
  valuePct: number | null;
  prevPct: number | null;
  insufficient: boolean;
};

type RateKey = "searchCtr" | "readRate" | "downloadRate";
const ATTRIBUTION: Record<RateKey, "attributable" | "independent"> = {
  searchCtr: "attributable",
  readRate: "independent",
  downloadRate: "independent",
};

/**
 * Verified engagement insight cards. These remain two independent pathways,
 * never a sequential funnel: only search → result click is attributable.
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

  const rateRow = (
    key: RateKey,
    icon: React.ReactNode,
    tint: "views" | "reader" | "downloads",
    collecting: boolean,
  ) => {
    const rate = rates[key];
    const previous = prevRates[key];
    const comparison = deriveRateComparison({
      current: rate,
      previous,
      previousDenominator: prevDenominator[key],
      compare,
      collecting,
    });
    const count = numerator[key];
    return (
      <div key={key} className="flex min-w-0 items-center gap-2.5 rounded-xl bg-paper/55 px-2.5 py-2">
        <span className={`dash-ico dash-ico--${tint} dash-ico--sm`} aria-hidden="true">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[12px] font-semibold text-text-body">
            <span>{t(`rates.${key}`)}</span>
            <InfoTip label={t(`rates.${key}`)} text={t(`rates.${key}Def`)} />
          </div>
          <p className="text-[10.5px] tabular-nums text-text-muted">
            {collecting || count === null
              ? t("collecting")
              : t("ratio", { numerator: nf.format(count), denominator: nf.format(denominator[key]) })}
          </p>
          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-text-muted">
            {t(`attribution.${ATTRIBUTION[key]}`)}
          </p>
        </div>
        <div className="shrink-0 text-end">
          <p className="text-[18px] font-bold leading-tight tabular-nums text-text-heading">
            {collecting
              ? <span className="text-[11px] font-semibold text-info-text">{t("collecting")}</span>
              : rate.pct !== null && rate.comparable ? `${rate.pct}%` : "—"}
          </p>
          {comparison.showPrevious && previous.pct !== null && (
            <p className="text-[10px] tabular-nums text-text-muted">
              {t("prevPct", { pct: previous.pct })}
              {comparison.delta !== null && comparison.delta !== 0 && (
                <span className={`ms-1 font-semibold ${comparison.delta > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {comparison.delta > 0 ? "+" : ""}{comparison.delta}
                </span>
              )}
            </p>
          )}
          {!collecting && rate.pct !== null && !rate.comparable && (
            <p className="max-w-[128px] text-[9.5px] leading-3 text-text-muted">{t("notComparable")}</p>
          )}
        </div>
      </div>
    );
  };

  const readerCollecting = volumes.readerOpens === null;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
      <article className="rounded-2xl border border-brand/15 border-s-[3px] border-s-brand bg-brand/[0.025] p-3">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-heading">
          <Search className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
          {t("pathway.search")}
        </h3>
        <div className="mt-2">
          {rateRow("searchCtr", <MousePointerClick className="h-[15px] w-[15px]" />, "views", false)}
        </div>
        <p className="mt-2 text-[10.5px] leading-4 text-text-muted">{t("pathway.searchNote")}</p>
      </article>

      <article className="rounded-2xl border border-brand/15 border-s-[3px] border-s-[var(--ptec-navy-950)] bg-brand/[0.025] p-3">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-heading">
          <Eye className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
          {t("pathway.content")}
        </h3>
        <div className="mt-2 space-y-2">
          {rateRow("readRate", <BookOpenCheck className="h-[15px] w-[15px]" />, "reader", readerCollecting)}
          {rateRow("downloadRate", <Download className="h-[15px] w-[15px]" />, "downloads", false)}
        </div>
      </article>

      {conversion && (
        <article className="rounded-2xl border border-accent/30 border-s-[3px] border-s-[var(--ptec-accent-line)] bg-accent/[0.05] p-3 md:col-span-2 xl:col-span-1">
          <div className="flex items-center gap-3">
            <span className="dash-ico dash-ico--gold dash-ico--sm" aria-hidden="true">
              <Activity className="h-[15px] w-[15px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-[12.5px] font-semibold text-text-body">
                {t("conversion")}
                <InfoTip label={t("conversion")} text={t("conversionDef")} />
              </div>
              <p className="text-[10.5px] leading-4 text-text-muted">{t("conversionShortDef")}</p>
            </div>
            <div className="shrink-0 text-end">
              <p className="text-[20px] font-bold leading-none tabular-nums text-text-heading">
                {conversion.insufficient || conversion.valuePct === null
                  ? <span className="text-[11px] font-semibold text-text-muted">{t("conversionInsufficient")}</span>
                  : `${conversion.valuePct}%`}
              </p>
              {compare && !conversion.insufficient && conversion.prevPct !== null && (
                <p className="mt-1 text-[10px] tabular-nums text-text-muted">{t("prevPct", { pct: conversion.prevPct })}</p>
              )}
            </div>
          </div>
        </article>
      )}

      <article className="rounded-2xl border border-divider bg-paper/35 p-3 md:col-span-2 xl:col-span-1">
        <h3 className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted">{t("volumeEvidence")}</h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-5 xl:grid-cols-2">
          {(
            [
              ["searches", volumes.searches, prevVolumes.searches],
              ["resultClicks", volumes.resultClicks, prevVolumes.resultClicks],
              ["detailViews", volumes.detailViews, prevVolumes.detailViews],
              ["readerOpens", volumes.readerOpens, prevVolumes.readerOpens],
              ["downloadsOrSaves", volumes.downloadsOrSaves, prevVolumes.downloadsOrSaves],
            ] as const
          ).map(([key, value, previous]) => (
            <div key={key} className="min-w-0">
              <dt className="dash-truncate text-[10px] font-medium text-text-muted">{t(`volumes.${key}`)}</dt>
              <dd className="text-[13px] font-bold tabular-nums text-text-heading">
                {value === null ? t("collectingShort") : nf.format(value)}
                {compare && previous !== null && previous > 0 && value !== null && (
                  <span className="ms-1 text-[9.5px] font-normal text-text-muted">{t("prev", { value: nf.format(previous) })}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </article>

      <p className="text-[10.5px] leading-4 text-text-muted md:col-span-2 xl:col-span-1">{t("definition")}</p>
    </div>
  );
}
