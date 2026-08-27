import type { DashboardMetric } from "@/lib/admin/dashboard-shared";
import { ANALYTICS_CHART_TOKENS, METRIC_CHART_STYLE } from "./chart-tokens";

/**
 * The identity key for one line: a short stroke in the series colour, drawn
 * with that series' actual dash pattern.
 *
 * A legend has to mirror the mark it stands for — a filled dot next to a
 * dashed line tells the reader the wrong thing, and a solid swatch beside the
 * previous-period overlay is how a comparison gets mistaken for a measure.
 * Every key on the dashboard comes from here so the two can never drift.
 */
export default function SeriesKey({
  metric,
  comparison = false,
  dashed = true,
}: {
  metric: DashboardMetric;
  /** The previous-period overlay: subdued, always dashed. */
  comparison?: boolean;
  /** False where the plot draws this series solid (a lone metric line). */
  dashed?: boolean;
}) {
  const style = METRIC_CHART_STYLE[metric];
  return (
    <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden="true" className="shrink-0">
      <line
        x1="0"
        y1="4"
        x2="16"
        y2="4"
        stroke={style.stroke}
        strokeWidth="2.5"
        strokeOpacity={comparison ? ANALYTICS_CHART_TOKENS.comparisonOpacity : 1}
        strokeDasharray={comparison
          ? ANALYTICS_CHART_TOKENS.comparisonDash
          : dashed ? style.dash : undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}
