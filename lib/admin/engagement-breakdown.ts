import {
  CHART_GRAINS,
  parseAnalyticsBucket,
  type ChartGrain,
} from "./analytics-time";
import {
  CONTENT_TYPE_FILTERS,
  DASHBOARD_RANGES,
  DASHBOARD_METRICS,
  LANGUAGE_FILTERS,
  type ContentTypeFilter,
  type DashboardMetric,
  type DashboardRange,
  type LanguageFilter,
} from "./dashboard-shared";
export type ContentType = "book" | "research_report" | "publication" | "post";

export const ANALYTICS_LIMITS = {
  maxCustomRangeDays: 365,
  postgrestPageSize: 1_000,
  maxBreakdownPages: 20,
  maxBreakdownEventRows: 20_000,
  maxRankingItems: 5,
  maxConcurrentBreakdownRequests: 1,
  maxClientCacheEntries: 24,
  clientCacheTtlMs: 5 * 60_000,
  maxVisibleChartPoints: 120,
  maxSimultaneousSeries: 3,
  requestTimeoutMs: 10_000,
  futureClockSkewMs: 5 * 60_000,
  rateLimitPerUserPerMinute: 30,
} as const;

export type ContentLanguageFilter = LanguageFilter;

export type EngagementBreakdownRequest = {
  metric: DashboardMetric;
  grain: ChartGrain;
  bucket: string;
  range: DashboardRange;
  from?: string;
  to?: string;
  contentType: ContentTypeFilter;
  department: string | null;
  contentLanguage: ContentLanguageFilter;
  asOf: string;
};

export type EngagementRankingStatus = "metric" | "fallback" | "unavailable";
export type EngagementBreakdownResponse = {
  metric: DashboardMetric;
  grain: ChartGrain;
  scope: {
    bucket: string;
    start: string;
    end: string;
    aggregationScope: "fullBucket" | "peakDay";
    representativeDate?: string;
    representativeDateTotal?: number;
  };
  total: number;
  partial: boolean;
  rowsScanned: number;
  ranking: {
    status: EngagementRankingStatus;
    basis: DashboardMetric | "views" | null;
    items: Array<{
      type: ContentType;
      id: string;
      title: string;
      count: number;
      editHref: string;
    }>;
    reason?: "identifierCoverage" | "rowLimit" | "sourceUnavailable" | "noData";
  };
  unattributed: number;
};

export type BreakdownParseResult =
  | { ok: true; value: EngagementBreakdownRequest }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const ONE_DAY = 86_400_000;

function member<T extends readonly string[]>(values: T, raw: string | null): raw is T[number] {
  return raw !== null && values.includes(raw);
}

function validCustomRange(from: string | null, to: string | null): from is string {
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return false;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) && (end - start) / ONE_DAY < ANALYTICS_LIMITS.maxCustomRangeDays;
}

export function parseEngagementBreakdownRequest(
  params: URLSearchParams,
  serverNow: Date = new Date(),
): BreakdownParseResult {
  const metric = params.get("metric");
  if (!member(DASHBOARD_METRICS, metric)) return { ok: false, error: "invalid_metric" };

  const grain = params.get("grain");
  if (!member(CHART_GRAINS, grain)) return { ok: false, error: "invalid_grain" };

  const bucket = params.get("bucket") ?? "";
  if (!parseAnalyticsBucket(bucket, grain)) return { ok: false, error: "invalid_bucket" };

  const range = params.get("range");
  if (!member(DASHBOARD_RANGES, range)) return { ok: false, error: "invalid_range" };
  const from = params.get("from");
  const to = params.get("to");
  if (range === "custom" && !validCustomRange(from, to)) return { ok: false, error: "invalid_custom_range" };

  const contentType = params.get("contentType") ?? "all";
  if (!member(CONTENT_TYPE_FILTERS, contentType)) return { ok: false, error: "invalid_content_type" };
  const contentLanguage = params.get("contentLanguage") ?? "all";
  if (!member(LANGUAGE_FILTERS, contentLanguage)) return { ok: false, error: "invalid_content_language" };

  const rawDepartment = params.get("department");
  const department = rawDepartment
    ? rawDepartment.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 80) || null
    : null;

  const asOf = params.get("asOf") ?? "";
  if (!ISO_RE.test(asOf)) return { ok: false, error: "invalid_as_of" };
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(asOfMs)) return { ok: false, error: "invalid_as_of" };
  if (asOfMs > serverNow.getTime() + ANALYTICS_LIMITS.futureClockSkewMs) {
    return { ok: false, error: "future_as_of" };
  }

  return {
    ok: true,
    value: {
      metric,
      grain,
      bucket,
      range,
      from: range === "custom" ? from! : undefined,
      to: range === "custom" ? to! : undefined,
      contentType,
      department,
      contentLanguage,
      asOf: new Date(asOfMs).toISOString(),
    },
  };
}

/** Stable parameter order doubles as the bounded client-cache key. */
export function serializeEngagementBreakdownRequest(request: EngagementBreakdownRequest): string {
  const params = new URLSearchParams();
  params.set("metric", request.metric);
  params.set("grain", request.grain);
  params.set("bucket", request.bucket);
  params.set("range", request.range);
  if (request.range === "custom" && request.from && request.to) {
    params.set("from", request.from);
    params.set("to", request.to);
  }
  params.set("contentType", request.contentType);
  if (request.department) params.set("department", request.department);
  params.set("contentLanguage", request.contentLanguage);
  params.set("asOf", request.asOf);
  return params.toString();
}

export function engagementBreakdownUrl(request: EngagementBreakdownRequest): string {
  return `/api/admin/dashboard/engagement-breakdown?${serializeEngagementBreakdownRequest(request)}`;
}

export function engagementBreakdownCacheKey(request: EngagementBreakdownRequest): string {
  return serializeEngagementBreakdownRequest(request);
}
