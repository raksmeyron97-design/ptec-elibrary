import { getTranslations, getLocale } from "next-intl/server";
import { MousePointerClick, BookOpenCheck, Download, Percent, Info } from "lucide-react";
import type { DiscoveryRate, DiscoveryRates, DiscoveryVolumes } from "@/lib/admin/dashboard-shared";

/** The higher-level engagement conversion, relocated here from the KPI row
 *  so it lives with its supporting rates (spec: define the formula clearly,
 *  don't give it a disproportionate hero card). */
export type ConversionSummary = {
  valuePct: number | null;
  prevPct: number | null;
  insufficient: boolean;
};

/**
 * Replaces the former funnel: the event streams are independent volumes
 * (visitors also arrive directly), so this shows the three honest pairwise
 * rates plus the raw volumes — no implied sequence, no ">100% of previous
 * stage". Rates whose populations aren't comparable render an explanatory
 * dash instead of a percentage. It leads with the overall engagement
 * conversion so the rate has a clear, defined home.
 */
export default async function DiscoveryEngagement({
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
  const t = await getTranslations("adminDashboard.discovery");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale === "km" ? "km-KH" : "en-US");

  const rateRow = (
    key: "searchCtr" | "readRate" | "downloadRate",
    icon: React.ReactNode,
    collecting: boolean,
    tint: "views" | "reader" | "downloads",
  ) => {
    const rate: DiscoveryRate = rates[key];
    const prev: DiscoveryRate = prevRates[key];
    return (
      <div key={key} className="flex items-center gap-3 rounded-xl border border-divider/60 bg-paper/70 px-3 py-2.5">
        <span className={`dash-ico dash-ico--${tint} dash-ico--md`} aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-text-body">{t(`rates.${key}`)}</p>
          <p className="text-[11px] text-text-muted">{t(`rates.${key}Def`)}</p>
        </div>
        <div className="shrink-0 text-end">
          <p className="text-[17px] font-bold tabular-nums text-text-heading">
            {collecting ? (
              <span className="text-[12px] font-semibold text-sky-800">{t("collecting")}</span>
            ) : rate.pct !== null && rate.comparable ? (
              `${rate.pct}%`
            ) : (
              "—"
            )}
          </p>
          {compare && !collecting && prev.pct !== null && prev.comparable && (
            <p className="text-[10.5px] tabular-nums text-text-muted">{t("prevPct", { pct: prev.pct })}</p>
          )}
          {!collecting && rate.pct !== null && !rate.comparable && (
            <p className="max-w-[130px] text-[10px] leading-3 text-text-muted">{t("notComparable")}</p>
          )}
        </div>
      </div>
    );
  };

  const volumeItems: { key: string; value: number | null; prev: number | null }[] = [
    { key: "searches", value: volumes.searches, prev: prevVolumes.searches },
    { key: "resultClicks", value: volumes.resultClicks, prev: prevVolumes.resultClicks },
    { key: "detailViews", value: volumes.detailViews, prev: prevVolumes.detailViews },
    { key: "readerOpens", value: volumes.readerOpens, prev: prevVolumes.readerOpens },
    { key: "downloadsOrSaves", value: volumes.downloadsOrSaves, prev: prevVolumes.downloadsOrSaves },
  ];

  return (
    <div>
      {conversion && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-brand/15 bg-brand/[0.04] px-3 py-2.5">
          <span className="dash-ico dash-ico--brand dash-ico--md" aria-hidden="true">
            <Percent className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[12.5px] font-semibold text-text-body">
              {t("conversion")}
              <span className="group relative inline-flex">
                <Info className="h-3 w-3 shrink-0 text-text-muted" aria-hidden="true" />
                <span className="sr-only">{t("conversionDef")}</span>
              </span>
            </p>
            <p className="text-[11px] text-text-muted">{t("conversionDef")}</p>
          </div>
          <div className="shrink-0 text-end">
            <p className="text-[20px] font-bold leading-none tabular-nums text-text-heading">
              {conversion.insufficient || conversion.valuePct === null ? (
                <span className="text-[12px] font-semibold text-text-muted">{t("conversionInsufficient")}</span>
              ) : (
                `${conversion.valuePct}%`
              )}
            </p>
            {compare && !conversion.insufficient && conversion.prevPct !== null && (
              <p className="mt-0.5 text-[10.5px] tabular-nums text-text-muted">{t("prevPct", { pct: conversion.prevPct })}</p>
            )}
          </div>
        </div>
      )}
      <div className="space-y-2">
        {rateRow("searchCtr", <MousePointerClick className="h-4 w-4" />, false, "views")}
        {rateRow("readRate", <BookOpenCheck className="h-4 w-4" />, volumes.readerOpens === null, "reader")}
        {rateRow("downloadRate", <Download className="h-4 w-4" />, false, "downloads")}
      </div>

      {/* Raw volumes — deliberately a flat list, no implied sequence. */}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-divider/70 pt-2.5">
        {volumeItems.map(({ key, value, prev }) => (
          <div key={key} className="min-w-0">
            <dt className="truncate text-[10.5px] font-medium text-text-muted">{t(`volumes.${key}`)}</dt>
            <dd className="text-[13px] font-bold tabular-nums text-text-heading">
              {value === null ? t("collectingShort") : nf.format(value)}
              {compare && prev !== null && value !== null && (
                <span className="ms-1 text-[10px] font-normal text-text-muted">{t("prev", { value: nf.format(prev) })}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 text-[10.5px] leading-4 text-text-muted">{t("definition")}</p>
    </div>
  );
}
