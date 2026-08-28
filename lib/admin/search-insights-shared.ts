/**
 * Shared, pure contract for /admin/search-insights.
 *
 * Everything here is deterministic and dependency-free so the page, the
 * server actions and the tests agree on one definition of a filter, a page
 * and a metric. The equivalent for the main dashboard is
 * lib/admin/dashboard-shared.ts, and this deliberately mirrors its shape.
 */

export const SEARCH_RANGES = ["today", "7d", "30d", "90d", "6m", "custom"] as const;
export type SearchRange = (typeof SEARCH_RANGES)[number];

export const SEARCH_LANGUAGES = ["all", "km", "en", "other"] as const;
export type SearchLanguageFilter = (typeof SEARCH_LANGUAGES)[number];

/** Zero-result review states. "needsReview" means no recorded action. */
export const ZERO_RESULT_STATUSES = [
  "all",
  "needsReview",
  "reviewed",
  "acquisition",
  "synonym",
  "curated",
  "ignored",
] as const;
export type ZeroResultStatus = (typeof ZERO_RESULT_STATUSES)[number];

export const ZERO_RESULT_SORTS = ["count", "recent", "term"] as const;
export type ZeroResultSort = (typeof ZERO_RESULT_SORTS)[number];

/** Result state of a logged search row. */
export const ACTIVITY_RESULT_FILTERS = ["all", "results", "noResults"] as const;
export type ActivityResultFilter = (typeof ACTIVITY_RESULT_FILTERS)[number];

export const PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;

/** Chart series the activity chart can draw. */
export const ACTIVITY_SERIES = ["searches", "noResults", "clicks"] as const;
export type ActivitySeries = (typeof ACTIVITY_SERIES)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ONE_DAY = 86_400_000;
/** A custom window wider than this is rejected — it is a typo, not a query. */
export const MAX_CUSTOM_DAYS = 400;
/** Hard ceiling on how many distinct zero-result groups we hydrate at once. */
export const MAX_ZERO_RESULT_GROUPS = 500;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SearchInsightsFilters {
  range: SearchRange;
  /** Only set when range === "custom"; both are YYYY-MM-DD. */
  from?: string;
  to?: string;
  compare: boolean;
  /** Zero-result workspace. */
  q: string;
  lang: SearchLanguageFilter;
  status: ZeroResultStatus;
  sort: ZeroResultSort;
  page: number;
  size: number;
  /** Detailed activity table. */
  aq: string;
  alang: SearchLanguageFilter;
  astatus: ActivityResultFilter;
  atype: string;
  apage: number;
  asize: number;
}

export const DEFAULT_SEARCH_FILTERS: SearchInsightsFilters = {
  range: "30d",
  compare: true,
  q: "",
  lang: "all",
  status: "all",
  sort: "count",
  page: 1,
  size: DEFAULT_PAGE_SIZE,
  aq: "",
  alang: "all",
  astatus: "all",
  atype: "all",
  apage: 1,
  asize: DEFAULT_PAGE_SIZE,
};

function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function oneOf<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * URL → filters. Every field is whitelisted: a page number, a sort key or a
 * language that is not in its allow-list falls back to the default rather
 * than reaching a query. Nothing here is trusted enough to interpolate.
 */
export function parseSearchInsightsFilters(
  params: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): SearchInsightsFilters {
  const get = (key: string): string | null => {
    const value = params[key];
    return typeof value === "string" ? value : Array.isArray(value) ? (value[0] ?? null) : null;
  };

  let range: SearchRange = "30d";
  let from: string | undefined;
  let to: string | undefined;
  const rawRange = get("range") ?? "30d";
  if (rawRange === "custom") {
    const start = get("from");
    const end = get("to");
    if (
      start && end && DATE_RE.test(start) && DATE_RE.test(end)
      && Date.parse(`${start}T00:00:00Z`) <= Date.parse(`${end}T00:00:00Z`)
      && (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / ONE_DAY < MAX_CUSTOM_DAYS
      && start <= todayKey(now)
    ) {
      range = "custom";
      from = start;
      to = end;
    }
  } else {
    range = oneOf(SEARCH_RANGES, rawRange, "30d");
    if (range === "custom") range = "30d"; // "custom" without valid dates
  }

  const size = PAGE_SIZES.includes(Number(get("size")) as (typeof PAGE_SIZES)[number])
    ? Number(get("size"))
    : DEFAULT_PAGE_SIZE;
  const asize = PAGE_SIZES.includes(Number(get("asize")) as (typeof PAGE_SIZES)[number])
    ? Number(get("asize"))
    : DEFAULT_PAGE_SIZE;

  return {
    range,
    from,
    to,
    compare: get("compare") !== "off",
    // Search text is bounded here so it can never become an unbounded
    // pattern downstream; it is matched, never interpolated.
    q: (get("q") ?? "").slice(0, 120).trim(),
    lang: oneOf(SEARCH_LANGUAGES, get("lang"), "all"),
    status: oneOf(ZERO_RESULT_STATUSES, get("status"), "all"),
    sort: oneOf(ZERO_RESULT_SORTS, get("sort"), "count"),
    page: positiveInt(get("page"), 1),
    size,
    aq: (get("aq") ?? "").slice(0, 120).trim(),
    alang: oneOf(SEARCH_LANGUAGES, get("alang"), "all"),
    astatus: oneOf(ACTIVITY_RESULT_FILTERS, get("astatus"), "all"),
    atype: (get("atype") ?? "all").slice(0, 40),
    apage: positiveInt(get("apage"), 1),
    asize,
  };
}

/** Filters → query string, omitting anything already at its default. */
export function serializeSearchInsightsFilters(filters: SearchInsightsFilters): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined, fallback: string | number) => {
    if (value !== undefined && String(value) !== String(fallback)) params.set(key, String(value));
  };
  set("range", filters.range, "30d");
  if (filters.range === "custom") {
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
  }
  if (!filters.compare) params.set("compare", "off");
  set("q", filters.q || undefined, "");
  set("lang", filters.lang, "all");
  set("status", filters.status, "all");
  set("sort", filters.sort, "count");
  set("page", filters.page, 1);
  set("size", filters.size, DEFAULT_PAGE_SIZE);
  set("aq", filters.aq || undefined, "");
  set("alang", filters.alang, "all");
  set("astatus", filters.astatus, "all");
  set("atype", filters.atype, "all");
  set("apage", filters.apage, 1);
  set("asize", filters.asize, DEFAULT_PAGE_SIZE);
  return params.toString();
}

export interface RangeWindow {
  since: string;
  until: string;
  /** Whole days covered, at least 1 — the denominator for "per day". */
  days: number;
  /** The immediately preceding window of the same length. */
  previousSince: string;
  previousUntil: string;
  /** Trend bucket width, so a 6-month chart is not 180 daily ticks. */
  bucketDays: number;
}

/**
 * One window drives EVERY figure on the page.
 *
 * The previous implementation ran normal analytics over the selected window
 * but the monthly trend over a separate hard-coded 180 days, so the chart and
 * the KPI above it were describing different periods.
 */
export function resolveRangeWindow(filters: SearchInsightsFilters, now: Date = new Date()): RangeWindow {
  const untilMs = now.getTime();
  let sinceMs: number;

  if (filters.range === "custom" && filters.from && filters.to) {
    sinceMs = Date.parse(`${filters.from}T00:00:00Z`);
    const endMs = Date.parse(`${filters.to}T23:59:59.999Z`);
    const spanMs = Math.max(ONE_DAY, endMs - sinceMs);
    return {
      since: new Date(sinceMs).toISOString(),
      until: new Date(Math.min(endMs, untilMs)).toISOString(),
      days: Math.max(1, Math.round(spanMs / ONE_DAY)),
      previousSince: new Date(sinceMs - spanMs).toISOString(),
      previousUntil: new Date(sinceMs).toISOString(),
      bucketDays: bucketDaysFor(Math.max(1, Math.round(spanMs / ONE_DAY))),
    };
  }

  const days = { today: 1, "7d": 7, "30d": 30, "90d": 90, "6m": 180, custom: 30 }[filters.range];
  sinceMs = untilMs - days * ONE_DAY;
  return {
    since: new Date(sinceMs).toISOString(),
    until: new Date(untilMs).toISOString(),
    days,
    previousSince: new Date(sinceMs - days * ONE_DAY).toISOString(),
    previousUntil: new Date(sinceMs).toISOString(),
    bucketDays: bucketDaysFor(days),
  };
}

/** Keep the chart between roughly 7 and 45 plotted points at any range. */
export function bucketDaysFor(days: number): number {
  if (days <= 45) return 1;
  if (days <= 120) return 7;
  return 30;
}

export interface SearchSummaryCounts {
  totalSearches: number;
  zeroResultSearches: number;
  /** Rows whose result_count is NULL — logged before migration 0064. */
  unknownResultSearches: number;
  clicks: number;
  km: number;
  en: number;
  other: number;
}

export const EMPTY_SUMMARY: SearchSummaryCounts = {
  totalSearches: 0,
  zeroResultSearches: 0,
  unknownResultSearches: 0,
  clicks: 0,
  km: 0,
  en: 0,
  other: 0,
};

export interface SearchKpis {
  searches: number;
  /** null when nothing is measurable, never 0 — 0 is a real, different answer. */
  successRate: number | null;
  zeroResultRate: number | null;
  clickRate: number | null;
  avgPerDay: number;
  /** Rows excluded from the two rate calculations for lack of result_count. */
  unmeasured: number;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * The four headline rates, with their formulas fixed in one place.
 *
 *   success rate     = searches with result_count > 0  ÷ searches with a known result_count
 *   zero-result rate = searches with result_count = 0  ÷ searches with a known result_count
 *   click rate       = recorded result clicks          ÷ total searches
 *   avg per day      = total searches                  ÷ days in the window
 *
 * Rows logged before migration 0064 carry a NULL result_count. They are
 * excluded from the two rate denominators rather than counted as successes —
 * counting them either way silently misstates the rate, so they are reported
 * separately as `unmeasured`.
 *
 * Click rate keeps the product's existing definition (clicks per search, as
 * shipped): a single search can produce several clicks, so it is not bounded
 * at 100% and is not a per-search click-through probability. Changing it was
 * out of scope; naming it accurately was not.
 */
export function computeKpis(counts: SearchSummaryCounts, days: number): SearchKpis {
  const measurable = Math.max(0, counts.totalSearches - counts.unknownResultSearches);
  const withResults = Math.max(0, measurable - counts.zeroResultSearches);
  return {
    searches: counts.totalSearches,
    successRate: rate(withResults, measurable),
    zeroResultRate: rate(counts.zeroResultSearches, measurable),
    clickRate: rate(counts.clicks, counts.totalSearches),
    avgPerDay: days > 0 ? Math.round((counts.totalSearches / days) * 10) / 10 : 0,
    unmeasured: counts.unknownResultSearches,
  };
}

/**
 * Percentage change against the previous window.
 *
 * Returns null — never Infinity, NaN or a fabricated 100% — when the previous
 * window has nothing to compare against. The UI shows a neutral "selected
 * period" line in that case rather than inventing a delta.
 */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Slice an in-memory collection, clamping the page into range. */
export function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  const size = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), totalPages);
  return {
    items: items.slice((current - 1) * size, current * size),
    page: current,
    pageSize: size,
    total,
    totalPages,
  };
}

/** Zero-based [from, to] bounds for a PostgREST `.range()` call. */
export function rangeBounds(page: number, pageSize: number): { from: number; to: number } {
  const size = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  const current = Math.max(1, page);
  const from = (current - 1) * size;
  return { from, to: from + size - 1 };
}

/** Language bucket for a row, falling back to script detection. */
export function languageOf(queryLanguage: string | null | undefined, term: string): "km" | "en" | "other" {
  if (queryLanguage === "km" || queryLanguage === "en") return queryLanguage;
  if (queryLanguage) return "other";
  return /[ក-៿]/.test(term) ? "km" : "en";
}
