import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { buildWindow } from "./dashboard";
import { loadContentCatalog, type ContentMeta } from "./intelligence";
import {
  ANALYTICS_LIMITS,
  type ContentType,
  type EngagementBreakdownRequest,
  type EngagementBreakdownResponse,
} from "./engagement-breakdown";
import {
  analyticsBucketKey,
  intersectAnalyticsInterval,
  parseAnalyticsBucket,
} from "./analytics-time";

const INTERNAL_ROLES = ["staff", "librarian", "admin", "super_admin"];
const EDIT_HREF: Record<ContentType, (id: string) => string> = {
  book: (id) => `/admin/edit/${id}`,
  research_report: (id) => `/admin/theses/edit/${id}`,
  publication: (id) => `/admin/publications/edit/${id}`,
  post: (id) => `/admin/posts?edit=${id}`,
};

export class BreakdownTimeoutError extends Error {
  constructor() {
    super("Engagement breakdown timed out");
    this.name = "BreakdownTimeoutError";
  }
}

export class BreakdownScopeError extends Error {
  constructor() {
    super("Bucket is outside the selected range");
    this.name = "BreakdownScopeError";
  }
}

class BreakdownQueryError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "BreakdownQueryError";
    this.code = code;
  }
}

type QueryError = { message: string; code?: string };
type PageResult<T> = { data: T[] | null; error: QueryError | null };

export type BoundedRows<T> = { rows: T[]; partial: boolean; pages: number };

async function beforeDeadline<T>(value: PromiseLike<T>, deadlineAt: number): Promise<T> {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new BreakdownTimeoutError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new BreakdownTimeoutError()), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Fetch ordered PostgREST pages with a hard row/page/deadline ceiling. */
export async function fetchBoundedBreakdownRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: {
    pageSize?: number;
    maxPages?: number;
    deadlineAt?: number;
  } = {},
): Promise<BoundedRows<T>> {
  const pageSize = options.pageSize ?? ANALYTICS_LIMITS.postgrestPageSize;
  const maxPages = options.maxPages ?? ANALYTICS_LIMITS.maxBreakdownPages;
  const deadlineAt = options.deadlineAt ?? Date.now() + ANALYTICS_LIMITS.requestTimeoutMs;
  const rows: T[] = [];
  let pages = 0;
  let lastPageWasFull = false;

  for (let index = 0; index < maxPages; index++) {
    const from = index * pageSize;
    const result = await beforeDeadline(page(from, from + pageSize - 1), deadlineAt);
    pages++;
    if (result.error) throw new BreakdownQueryError(result.error.message, result.error.code);
    const batch = result.data ?? [];
    rows.push(...batch);
    lastPageWasFull = batch.length === pageSize;
    if (!lastPageWasFull) return { rows, partial: false, pages };
  }

  // A full final page may have been exactly the cap, but treating it as partial
  // is the only honest result without issuing a query beyond the approved cap.
  return { rows, partial: lastPageWasFull, pages };
}

export type BreakdownEvent = {
  ts: string;
  contentType: string | null;
  contentId: string | null;
  userId: string | null;
  sessionHash: string | null;
};

export type BreakdownContent = Pick<ContentMeta, "id" | "type" | "title" | "department" | "language">;

type MetricRows = BoundedRows<BreakdownEvent> & { sourceUnavailable: boolean };

type RawEvent = Record<string, unknown>;

function isContentType(value: unknown): value is ContentType {
  return value === "book" || value === "research_report" || value === "publication" || value === "post";
}

function relationBookId(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const id = (row as { book_id?: unknown }).book_id;
  return typeof id === "string" ? id : null;
}

function normalizeEvents(metric: EngagementBreakdownRequest["metric"], rows: RawEvent[]): BreakdownEvent[] {
  if (metric === "views" || metric === "visitors") {
    return rows.map((row) => ({
      ts: String(row.viewed_at),
      contentType: typeof row.content_type === "string" ? row.content_type : null,
      contentId: typeof row.content_id === "string" ? row.content_id : null,
      userId: typeof row.user_id === "string" ? row.user_id : null,
      sessionHash: typeof row.session_hash === "string" ? row.session_hash : null,
    }));
  }
  if (metric === "readerOpens") {
    return rows.map((row) => ({
      ts: String(row.opened_at),
      contentType: typeof row.content_type === "string" ? row.content_type : null,
      contentId: typeof row.content_id === "string" ? row.content_id : null,
      userId: typeof row.user_id === "string" ? row.user_id : null,
      sessionHash: typeof row.session_hash === "string" ? row.session_hash : null,
    }));
  }
  return rows.map((row) => ({
    ts: String(row.downloaded_at),
    contentType: typeof row.content_type === "string" ? row.content_type : "book",
    contentId:
      typeof row.content_id === "string" ? row.content_id : relationBookId(row.book_files),
    userId: typeof row.user_id === "string" ? row.user_id : null,
    sessionHash: typeof row.session_hash === "string" ? row.session_hash : null,
  }));
}

function metricQuery(metric: EngagementBreakdownRequest["metric"], rich: boolean) {
  if (metric === "views" || metric === "visitors") {
    return {
      table: "view_logs",
      timestamp: "viewed_at",
      columns: rich
        ? "content_type, content_id, user_id, session_hash, viewed_at"
        : "content_type, content_id, user_id, viewed_at",
    };
  }
  if (metric === "readerOpens") {
    return {
      table: "reader_open_logs",
      timestamp: "opened_at",
      columns: "content_type, content_id, user_id, session_hash, opened_at",
    };
  }
  return {
    table: "download_logs",
    timestamp: "downloaded_at",
    columns: rich
      ? "downloaded_at, user_id, session_hash, content_type, content_id, book_files(book_id)"
      : "downloaded_at, user_id, content_type, content_id, book_files(book_id)",
  };
}

function isMissingColumn(error: unknown): boolean {
  return error instanceof Error && /column .* does not exist|session_hash|42703/i.test(error.message);
}

async function fetchMetricRows(
  supabase: ReturnType<typeof createServiceClient>,
  request: EngagementBreakdownRequest,
  start: Date,
  endInclusive: Date,
  deadlineAt: number,
): Promise<MetricRows> {
  const run = async (rich: boolean) => {
    const spec = metricQuery(request.metric, rich);
    const result = await fetchBoundedBreakdownRows<RawEvent>(
      (from, to) =>
        supabase
          .from(spec.table)
          .select(spec.columns)
          .gte(spec.timestamp, start.toISOString())
          .lte(spec.timestamp, endInclusive.toISOString())
          .order(spec.timestamp, { ascending: true })
          .range(from, to) as unknown as PromiseLike<PageResult<RawEvent>>,
      { deadlineAt },
    );
    return { ...result, rows: normalizeEvents(request.metric, result.rows) };
  };

  try {
    const result = await run(true);
    return { ...result, sourceUnavailable: false };
  } catch (error) {
    if (error instanceof BreakdownTimeoutError) throw error;
    if (request.metric === "readerOpens") {
      return { rows: [], pages: 0, partial: true, sourceUnavailable: true };
    }
    if (isMissingColumn(error)) {
      const result = await run(false);
      return { ...result, sourceUnavailable: false };
    }
    throw error;
  }
}

function eventIdentifier(row: BreakdownEvent): string | null {
  return row.userId ? `u:${row.userId}` : row.sessionHash ? `s:${row.sessionHash}` : null;
}

function eventMatches(
  row: BreakdownEvent,
  request: EngagementBreakdownRequest,
  byKey: Map<string, BreakdownContent>,
): boolean {
  if (request.contentType !== "all" && row.contentType !== request.contentType) return false;
  if (!request.department && request.contentLanguage === "all") return true;
  const content = row.contentId ? byKey.get(`${row.contentType}:${row.contentId}`) : undefined;
  if (request.department && content?.department !== request.department) return false;
  if (request.contentLanguage !== "all" && content?.language !== request.contentLanguage) return false;
  return true;
}

export function aggregateEngagementBreakdown(input: {
  request: EngagementBreakdownRequest;
  scope: { start: Date; endInclusive: Date };
  rows: BreakdownEvent[];
  content: BreakdownContent[];
  internalUserIds?: Set<string>;
  rowsScanned?: number;
  partial?: boolean;
  sourceUnavailable?: boolean;
}): EngagementBreakdownResponse {
  const { request, scope } = input;
  const byKey = new Map(input.content.map((item) => [`${item.type}:${item.id}`, item]));
  const internal = input.internalUserIds ?? new Set<string>();
  let rows = input.rows.filter(
    (row) => !row.userId || !internal.has(row.userId),
  ).filter((row) => eventMatches(row, request, byKey));

  let representativeDate: string | undefined;
  if (request.metric === "visitors" && (request.grain === "week" || request.grain === "month")) {
    const visitorsByDay = new Map<string, Set<string>>();
    for (const row of rows) {
      const identifier = eventIdentifier(row);
      if (!identifier) continue;
      const day = analyticsBucketKey(new Date(row.ts), "day");
      const set = visitorsByDay.get(day) ?? new Set<string>();
      set.add(identifier);
      visitorsByDay.set(day, set);
    }
    representativeDate = [...visitorsByDay.entries()]
      .sort(([dayA, idsA], [dayB, idsB]) => idsB.size - idsA.size || dayA.localeCompare(dayB))[0]?.[0];
    if (representativeDate) {
      rows = rows.filter((row) => analyticsBucketKey(new Date(row.ts), "day") === representativeDate);
    }
  }

  const partial = Boolean(input.partial || input.sourceUnavailable);
  const isVisitors = request.metric === "visitors";
  const identifiers = new Set<string>();
  let unattributed = 0;
  const eventCounts = new Map<string, number>();
  const visitorCounts = new Map<string, Set<string>>();

  for (const row of rows) {
    const identifier = eventIdentifier(row);
    if (isVisitors) {
      if (identifier) identifiers.add(identifier);
      else unattributed++;
    }

    if (!row.contentId || !isContentType(row.contentType) || !byKey.has(`${row.contentType}:${row.contentId}`)) {
      if (!isVisitors) unattributed++;
      continue;
    }
    const key = `${row.contentType}:${row.contentId}`;
    if (isVisitors) {
      if (!identifier) continue;
      const set = visitorCounts.get(key) ?? new Set<string>();
      set.add(identifier);
      visitorCounts.set(key, set);
    } else {
      eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1);
    }
  }

  const total = isVisitors ? identifiers.size : rows.length;
  const counts = isVisitors
    ? [...visitorCounts.entries()].map(([key, ids]) => [key, ids.size] as const)
    : [...eventCounts.entries()];

  let ranking: EngagementBreakdownResponse["ranking"];
  if (partial) {
    ranking = {
      status: "unavailable",
      basis: null,
      items: [],
      reason: input.sourceUnavailable ? "sourceUnavailable" : "rowLimit",
    };
  } else if (total === 0) {
    ranking = { status: "unavailable", basis: null, items: [], reason: "noData" };
  } else if (counts.length === 0) {
    ranking = { status: "unavailable", basis: null, items: [], reason: "identifierCoverage" };
  } else {
    const items = counts
      .map(([key, count]) => ({ content: byKey.get(key), count }))
      .filter((item): item is { content: BreakdownContent; count: number } => Boolean(item.content))
      .sort((a, b) => b.count - a.count || a.content.title.localeCompare(b.content.title))
      .slice(0, ANALYTICS_LIMITS.maxRankingItems)
      .map(({ content, count }) => ({
        type: content.type,
        id: content.id,
        title: content.title,
        count,
        editHref: EDIT_HREF[content.type](content.id),
      }));
    ranking = { status: "metric", basis: request.metric, items };
  }

  return {
    metric: request.metric,
    grain: request.grain,
    scope: {
      bucket: request.bucket,
      start: scope.start.toISOString(),
      end: scope.endInclusive.toISOString(),
      aggregationScope: isVisitors && (request.grain === "week" || request.grain === "month")
        ? "peakDay"
        : "fullBucket",
      ...(representativeDate
        ? { representativeDate, representativeDateTotal: total }
        : {}),
    },
    total,
    partial,
    rowsScanned: input.rowsScanned ?? input.rows.length,
    ranking,
    unattributed,
  };
}

export async function getEngagementBreakdown(
  request: EngagementBreakdownRequest,
  options: { deadlineAt?: number } = {},
): Promise<EngagementBreakdownResponse> {
  const deadlineAt = options.deadlineAt ?? Date.now() + ANALYTICS_LIMITS.requestTimeoutMs;
  const bucket = parseAnalyticsBucket(request.bucket, request.grain);
  if (!bucket) throw new BreakdownScopeError();
  const snapshot = new Date(request.asOf);
  const window = buildWindow(
    { range: request.range, from: request.from, to: request.to },
    snapshot,
  );
  const scope = intersectAnalyticsInterval(bucket, window.start, window.end);
  if (!scope) throw new BreakdownScopeError();

  const supabase = createServiceClient();
  const contentPromise = loadContentCatalog(supabase);
  const internalPromise = supabase.from("profiles").select("id, role").in("role", INTERNAL_ROLES);
  const rowsPromise = fetchMetricRows(supabase, request, scope.start, scope.endInclusive, deadlineAt);
  const [content, internalResult, metricRows] = await beforeDeadline(
    Promise.all([contentPromise, internalPromise, rowsPromise]),
    deadlineAt,
  );
  if (internalResult.error) {
    throw new BreakdownQueryError(internalResult.error.message, internalResult.error.code);
  }
  const internalIds = new Set(
    ((internalResult.data ?? []) as { id: string }[]).map((row) => row.id),
  );

  return aggregateEngagementBreakdown({
    request,
    scope,
    rows: metricRows.rows,
    content,
    internalUserIds: internalIds,
    rowsScanned: metricRows.rows.length,
    partial: metricRows.partial,
    sourceUnavailable: metricRows.sourceUnavailable,
  });
}
