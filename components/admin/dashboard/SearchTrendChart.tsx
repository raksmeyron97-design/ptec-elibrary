"use client";

import { useTranslations } from "next-intl";
import { useContainerWidth, formatBucket, niceMax4, AXIS_TEXT, ChartGrid } from "./chart-utils";

/**
 * Searches per bucket with the zero-result share as a contrasting overlay.
 * Zero-based axis; table alternative included for screen readers.
 */
export default function SearchTrendChart({
  trend,
  granularity,
}: {
  trend: { date: string; searches: number; zeroResults: number }[];
  granularity: "hour" | "day";
}) {
  const t = useTranslations("adminDashboard.searchAi");
  const [ref, width] = useContainerWidth();

  const height = 190;
  const padLeft = 34;
  const padRight = 10;
  const padTop = 12;
  const padBottom = 24;
  const innerW = Math.max(50, width - padLeft - padRight);
  const innerH = height - padTop - padBottom;

  const maxVal = niceMax4(Math.max(1, ...trend.map((p) => p.searches)));
  const x = (i: number) => padLeft + (trend.length > 1 ? (i / (trend.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => padTop + innerH - (v / maxVal) * innerH;

  const ticks = [0, maxVal / 4, maxVal / 2, (3 * maxVal) / 4, maxVal].map((v) => ({ v: Math.round(v), y: y(v) }));
  const labelEvery = Math.max(1, Math.ceil(trend.length / Math.max(3, Math.floor(innerW / 70))));

  const total = trend.reduce((s, p) => s + p.searches, 0);
  const zeroTotal = trend.reduce((s, p) => s + p.zeroResults, 0);
  const srSummary = t("trendSr", { total, zero: zeroTotal });

  const path = (get: (p: (typeof trend)[number]) => number) =>
    trend.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(get(p))}`).join(" ");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-hidden="true">
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-text-body">
          <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#1E3A8A" strokeWidth="2" /></svg>
          {t("trendSearches")}
        </span>
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-text-body">
          <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#BE123C" strokeWidth="2" strokeDasharray="3 3" /></svg>
          {t("trendZero")}
        </span>
      </div>
      <div ref={ref}>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={srSummary}>
          <ChartGrid ticks={ticks} padLeft={padLeft} width={width} padRight={padRight} />
          <path d={path((p) => p.searches)} fill="none" stroke="#1E3A8A" strokeWidth="2" strokeLinejoin="round" />
          <path d={path((p) => p.zeroResults)} fill="none" stroke="#BE123C" strokeWidth="1.5" strokeDasharray="3 3" strokeLinejoin="round" />
          {trend.map((p, i) =>
            p.searches > 0 ? (
              <circle key={p.date} cx={x(i)} cy={y(p.searches)} r="2.5" fill="#1E3A8A">
                <title>{`${formatBucket(p.date, granularity)}: ${p.searches} · ${t("trendZero")}: ${p.zeroResults}`}</title>
              </circle>
            ) : null,
          )}
          {trend.map((p, i) =>
            i % labelEvery === 0 ? (
              <text key={p.date} x={x(i)} y={height - 6} textAnchor="middle" {...AXIS_TEXT}>
                {formatBucket(p.date, granularity)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
      <details>
        <summary className="cursor-pointer text-[11.5px] font-semibold text-text-muted hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          {t("showTable")}
        </summary>
        <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-divider">
          <table className="w-full text-[11.5px]">
            <caption className="sr-only">{srSummary}</caption>
            <thead className="sticky top-0 bg-paper">
              <tr>
                <th scope="col" className="px-2 py-1.5 text-start font-bold text-text-muted">{t("date")}</th>
                <th scope="col" className="px-2 py-1.5 text-end font-bold text-text-muted">{t("trendSearches")}</th>
                <th scope="col" className="px-2 py-1.5 text-end font-bold text-text-muted">{t("trendZero")}</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((p) => (
                <tr key={p.date} className="border-t border-divider">
                  <th scope="row" className="px-2 py-1 text-start font-medium text-text-body">
                    {formatBucket(p.date, granularity)}
                  </th>
                  <td className="px-2 py-1 text-end tabular-nums">{p.searches}</td>
                  <td className="px-2 py-1 text-end tabular-nums">{p.zeroResults}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
