"use client";

import { useId, useState } from "react";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Info,
  ChevronRight,
  Eye,
  Users,
  BookOpenCheck,
  Download,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { TrendInfo, DashboardMetric } from "@/lib/admin/dashboard-shared";
import type { TrendPoint } from "@/lib/admin/dashboard";
import SparkLine from "./SparkLine";
import { useMetricSelection } from "./MetricSelection";

const TREND_STYLE = {
  up: { icon: TrendingUp, className: "text-emerald-700" },
  down: { icon: TrendingDown, className: "text-rose-700" },
  neutral: { icon: Minus, className: "text-slate-600" },
} as const;

const METRIC_ICON: Record<DashboardMetric, LucideIcon> = {
  visitors: Users,
  views: Eye,
  readerOpens: BookOpenCheck,
  downloads: Download,
};

/** Metric → accent token (icon tint, top strip, sparkline stroke). */
const METRIC_ACCENT: Record<DashboardMetric, "visitors" | "views" | "reader" | "downloads"> = {
  visitors: "visitors",
  views: "views",
  readerOpens: "reader",
  downloads: "downloads",
};

export type MetricCardData = {
  metric: DashboardMetric;
  value: number;
  formattedValue: string;
  trend: TrendInfo | null;
  previous: number | null;
  formattedPrevious: string | null;
  spark: TrendPoint[] | null;
  /** Instrumentation newer than the selected period — no honest comparison. */
  collecting: boolean;
};

/**
 * An Executive Pulse KPI. The whole card is one button that selects the metric
 * — selection drives the engagement chart and the supporting panels below, so
 * the row is a control surface, not five links that navigate away. A separate
 * "details" affordance opens the metric drawer, and the ⓘ definition is a
 * native <details> popover (keyboard operable, works without JS).
 *
 * Selection is signalled by a ring, a filled accent strip AND aria-pressed —
 * never colour alone.
 */
export default function MetricCard({
  data,
  title,
  definition,
  compareLabel,
  collectingLabel,
}: {
  data: MetricCardData;
  title: string;
  definition: string;
  /** e.g. "vs previous 30 days" — already localised by the server. */
  compareLabel: string | null;
  collectingLabel: string;
}) {
  const t = useTranslations("adminDashboard.kpi");
  const { metric: selected, selectMetric, openDetails } = useMetricSelection();
  const [defOpen, setDefOpen] = useState(false);
  const defId = useId();

  const isSelected = selected === data.metric;
  const accent = METRIC_ACCENT[data.metric];
  const Icon = METRIC_ICON[data.metric];
  const trendStyle = data.trend ? TREND_STYLE[data.trend.direction] : null;
  const TrendIcon = trendStyle?.icon;

  return (
    <div
      className={`dash-kpi dash-kpi--${accent} dash-metric-card ${isSelected ? "is-selected" : ""}`}
      data-selected={isSelected}
    >
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={() => selectMetric(data.metric)}
        className="flex w-full cursor-pointer flex-col items-start gap-2.5 rounded-[15px] p-4 pb-2 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      >
        <span className="flex w-full items-center gap-2">
          <span className={`dash-ico dash-ico--${accent} dash-ico--sm`} aria-hidden="true">
            <Icon className="h-[15px] w-[15px]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-muted">{title}</span>
          {isSelected && (
            <span className="shrink-0 rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
              {t("charted")}
            </span>
          )}
        </span>

        <span className="flex w-full items-end justify-between gap-2">
          <span className="text-[28px] font-bold leading-none tabular-nums text-text-heading">
            {data.formattedValue}
          </span>
          {data.spark && data.spark.length > 1 && <SparkLine points={data.spark} accent={accent} />}
        </span>

        <span className="min-h-[34px] w-full text-[12px] leading-[17px]">
          {data.collecting ? (
            <span className="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-900">
              {collectingLabel}
            </span>
          ) : data.trend && data.trend.mode !== "hidden" ? (
            <>
              <span className="flex flex-wrap items-center gap-x-1.5 text-text-muted">
                {data.trend.mode === "percent" && TrendIcon && trendStyle ? (
                  <span className={`inline-flex items-center gap-0.5 font-bold tabular-nums ${trendStyle.className}`}>
                    <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {data.trend.value}
                  </span>
                ) : (
                  <span className="font-semibold tabular-nums text-text-body">{data.trend.value}</span>
                )}
                <span>{compareLabel ?? data.trend.label}</span>
              </span>
              {data.formattedPrevious !== null && (
                <span className="mt-0.5 block text-[11px] tabular-nums text-text-muted">
                  {t("previously", { value: data.formattedPrevious })}
                </span>
              )}
            </>
          ) : (
            <span className="text-[11.5px] text-text-muted">{t("noComparison")}</span>
          )}
        </span>
      </button>

      <div className="flex items-center justify-between gap-1 border-t border-divider/60 px-2 py-1">
        <details
          className="relative"
          open={defOpen}
          onToggle={(e) => setDefOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary
            aria-label={t("definitionOf", { metric: title })}
            aria-describedby={defOpen ? defId : undefined}
            className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-paper hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand [&::-webkit-details-marker]:hidden"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </summary>
          <p
            id={defId}
            role="note"
            className="dash-popover absolute start-0 bottom-8 w-64 p-3 text-[11.5px] leading-5 text-text-body"
          >
            {definition}
          </p>
        </details>

        <button
          type="button"
          onClick={() => openDetails(data.metric)}
          className="flex h-7 cursor-pointer items-center gap-0.5 rounded-lg px-2 text-[11.5px] font-semibold text-brand transition-colors hover:bg-brand/5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
        >
          {t("details")}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">{title}</span>
        </button>
      </div>
    </div>
  );
}
