import type { EngagementChartVersion } from "@/lib/admin/analytics-flags";
import type { DashboardFilters } from "@/lib/admin/dashboard-shared";
import LegacyEngagementChart, { type EngagementSeries } from "./LegacyEngagementChart";
import EngagementAnalytics from "./analytics/EngagementAnalytics";

export type EngagementChartProps = {
  version: EngagementChartVersion;
  series: EngagementSeries;
  prevSeries: EngagementSeries;
  annotations: Array<{ date: string; count: number; titles?: string[] }>;
  granularity: "hour" | "day";
  compare: boolean;
  filters: DashboardFilters;
  generatedAt: string;
};

/** Server-selected rollback boundary: client components never read process.env. */
export default function EngagementChart(props: EngagementChartProps) {
  if (props.version === "legacy") {
    return (
      <LegacyEngagementChart
        series={props.series}
        prevSeries={props.prevSeries}
        annotations={props.annotations}
        granularity={props.granularity}
        compare={props.compare}
      />
    );
  }
  return <EngagementAnalytics {...props} />;
}
