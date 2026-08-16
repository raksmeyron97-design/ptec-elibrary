import "server-only";

export type EngagementChartVersion = "legacy" | "v2";

/**
 * Server-only rollout gate. A missing production flag is deliberately safe:
 * production stays on legacy until V2 is explicitly enabled.
 */
export function resolveEngagementChartVersion(input: {
  flag?: string;
  nodeEnv?: string;
} = {}): EngagementChartVersion {
  const flag = (input.flag ?? process.env.ADMIN_ENGAGEMENT_CHART_V2)?.trim().toLowerCase();
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  if (flag === "on") return "v2";
  if (flag === "off") return "legacy";
  if (flag && flag !== "on" && flag !== "off") return "legacy";
  return nodeEnv === "production" ? "legacy" : "v2";
}
