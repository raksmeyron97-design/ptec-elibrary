"use client";

import { useState } from "react";
import { Eye, Users, BookOpenCheck, Download, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TrendInfo, DashboardMetric } from "@/lib/admin/dashboard-shared";
import type { TrendPoint } from "@/lib/admin/dashboard";
import { useMetricSelection } from "./MetricSelection";
import KpiCard from "./KpiCard";

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
 * the row is a control surface, not five links that navigate away.
 *
 * This is the client half of the shared KPI card: it owns the selection hook
 * and the definition-popover's open state, then hands both to `KpiCard` via
 * its `selected` wiring. The visual implementation itself — icon tile,
 * headline figure, trend line, definition popover markup — lives in
 * `KpiCard.tsx`, shared with every other KPI card on the dashboard.
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

  const isSelected = selected === data.metric;
  const accent = METRIC_ACCENT[data.metric];
  const Icon = METRIC_ICON[data.metric];

  return (
    <KpiCard
      title={title}
      value={data.formattedValue}
      definition={definition}
      trend={data.collecting ? null : data.trend}
      compareLabel={compareLabel}
      spark={data.collecting ? null : data.spark}
      icon={Icon}
      accent={accent}
      selected={{
        isSelected,
        onSelect: () => selectMetric(data.metric),
        selectedLabel: t("charted"),
        detailsLabel: t("details"),
        onOpenDetails: () => openDetails(data.metric),
        defOpen,
        onToggleDef: setDefOpen,
        definitionAriaLabel: t("definitionOf", { metric: title }),
        collecting: data.collecting,
        collectingLabel,
        formattedPrevious: data.formattedPrevious,
        previousLabel:
          data.formattedPrevious !== null ? t("previously", { value: data.formattedPrevious }) : null,
        noComparisonLabel: t("noComparison"),
      }}
    />
  );
}
