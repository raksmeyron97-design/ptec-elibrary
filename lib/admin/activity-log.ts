/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

// ─────────────────────────────────────────────────────────────────────────────
// Unified activity-log query service — the SINGLE source of truth for
// /admin/logs. It reads the existing per-domain tables and normalizes them into
// one polymorphic ActivityEvent stream so books, theses, publications and posts
// are all first-class:
//
//   • download_logs               → book (+ future) DOWNLOAD (authorized)
//   • research_report_downloads    → thesis DOWNLOAD (authorized) + snapshots
//   • view_logs                    → VIEW (any content_type)
//   • activity_events              → denied / failed download attempts
//                                    (migration 0094; degrades to empty if absent)
//
// WHY a read-model instead of one physical table: the successful-download
// counters + idempotency already live in download_logs / research_report_downloads
// and the intelligence dashboard reads them. Re-homing every writer would be a
// high-risk rewrite. Unioning them at read time makes thesis downloads visible
// immediately with zero data migration, while activity_events adds the
// previously-unrecorded denied/failed events going forward.
//
// Filtering + pagination happen on the SERVER (here), never in the browser. Date
// bounds are pushed down to each table's indexed time column; the remaining
// cross-cutting filters (resource type, status, search) run over the merged,
// range-bounded set. For PTEC's data volume (hundreds of events) this is exact
// and fast. At much larger scale the next step is a materialized UNION view.
// ─────────────────────────────────────────────────────────────────────────────

import { createServiceClient } from "@/lib/supabase/server";
import {
  type ActivityEvent,
  type ActivityTab,
  type EventStatus,
  type ResourceType,
  type RangePreset,
  type DenialReason,
  type TimelineBucket,
  resolveRange,
  tabForEvent,
  pickTimelineBucket,
  timelineBucketStarts,
  floorToBucket,
  BUCKET_MS,
  RESOURCE_TYPES,
} from "./activity-log-shared";

/** Hard cap per source table so a runaway range can never load unbounded rows. */
const SOURCE_CAP = 5000;

export interface ActivityFilters {
  range: RangePreset;
  customStart?: string | null;
  customEnd?: string | null;
  tab: ActivityTab;
  resourceType: ResourceType | "all";
  status: EventStatus | "all";
  search: string;
  page: number;
  pageSize: number;
  /** Injectable clock for deterministic tests. */
  now?: number;
}

export interface ActivitySummary {
  authorizedDownloads: number;
  deniedDownloads: number;
  failedDownloads: number;
  pageViews: number;
  activeUsers: number;
  totalEvents: number;
  securityAlerts: number;
}

/** One point on the activity timeline. Empty buckets are present — a quiet
 *  hour is a fact about the library, not a gap to be collapsed. */
export interface ActivityTimelinePoint {
  /** ISO start of the bucket, UTC. Labelled in ADMIN_TZ by the client. */
  start: string;
  views: number;
  /** AUTHORIZED downloads only, matching the summary card. */
  downloads: number;
  /** Denied + failed downloads + explicit security events. */
  security: number;
}

/** Where engagement is concentrated, per resource type. */
export interface ActivityResourceRow {
  resourceType: ResourceType;
  views: number;
  downloads: number;
  security: number;
  total: number;
}

/** The security tab, decomposed. `total` always equals tabCounts.security. */
export interface ActivitySecurityBreakdown {
  total: number;
  deniedDownloads: number;
  failedDownloads: number;
  /** Security events that are neither a denied nor a failed download. */
  otherSecurity: number;
  /** Denial reasons present in the range, most frequent first. */
  reasons: Array<{ reason: DenialReason; count: number }>;
  /** Denied/failed events that carry no recorded reason. */
  unspecified: number;
}

/**
 * Aggregates for the overview strip. Deliberately a SEPARATE object rather
 * than extra fields on ActivityEvent: these are properties of the range, not
 * of any row, and inflating every row with them would ship the same numbers
 * `pageSize` times.
 *
 * Scope note: analytics are computed from the same `scoped` set as the summary
 * cards — range + resource + search, but NOT tab/status. The overview must
 * keep describing the whole period while you drill into one tab below it;
 * scoping it to the tab would make the chart change every time you clicked a
 * tab that is itself drawn from the chart.
 */
export interface ActivityAnalytics {
  bucket: TimelineBucket;
  timeline: ActivityTimelinePoint[];
  /** Non-empty resource types only, busiest first. */
  byResource: ActivityResourceRow[];
  security: ActivitySecurityBreakdown;
}

export interface ActivityResult {
  events: ActivityEvent[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: ActivitySummary;
  tabCounts: Record<Exclude<ActivityTab, "all">, number> & { all: number };
  analytics: ActivityAnalytics;
  appliedRange: { start: string; end: string; timezone: string };
}

type ProfileJoin = { email: string | null; full_name: string | null; avatar_url: string | null } | null;

// Timezone the admin panel presents timestamps in (Cambodia). Stored values are
// always UTC; only presentation is localized.
const ADMIN_TZ = "Asia/Phnom_Penh";

/** Swallow "relation/column does not exist" so pre-migration DBs degrade to
 *  empty rather than throwing. */
function isMissingObject(code?: string | null): boolean {
  return code === "PGRST205" || code === "42P01" || code === "42703";
}

export async function queryActivity(filters: ActivityFilters): Promise<ActivityResult> {
  const db = createServiceClient();
  const { start, end, startMs, endMs } = resolveRange(filters.range, filters.now, filters.customStart, filters.customEnd);

  // 1. Pull each source within the date window (indexed time-column push-down).
  const [dlRes, rrdRes, vlRes, aeRes] = await Promise.all([
    db
      .from("download_logs")
      .select("id, user_id, book_file_id, content_type, content_id, downloaded_at, user:profiles(email, full_name, avatar_url)")
      .gte("downloaded_at", start)
      .lte("downloaded_at", end)
      .order("downloaded_at", { ascending: false })
      .limit(SOURCE_CAP),
    db
      .from("research_report_downloads")
      .select("id, report_id, user_id, downloaded_at, permission_source, rank_at_download, institution_type_snapshot, role_snapshot, purpose_snapshot, user:profiles(email, full_name, avatar_url)")
      .gte("downloaded_at", start)
      .lte("downloaded_at", end)
      .order("downloaded_at", { ascending: false })
      .limit(SOURCE_CAP),
    db
      .from("view_logs")
      .select("id, user_id, content_type, content_id, viewed_at, locale, user:profiles(email, full_name, avatar_url)")
      .gte("viewed_at", start)
      .lte("viewed_at", end)
      .order("viewed_at", { ascending: false })
      .limit(SOURCE_CAP),
    // activity_events may not exist yet (0094 pending) — never let it throw.
    db
      .from("activity_events")
      .select("id, event_type, event_status, resource_type, resource_id, user_id, permission_source, permission_reason, rank_at_event, institution_type_snapshot, role_snapshot, purpose_snapshot, locale, occurred_at, user:profiles(email, full_name, avatar_url)")
      .gte("occurred_at", start)
      .lte("occurred_at", end)
      .order("occurred_at", { ascending: false })
      .limit(SOURCE_CAP),
  ]);

  const downloadRows = dlRes.error ? [] : (dlRes.data ?? []);
  const rrdRows = rrdRes.error ? [] : (rrdRes.data ?? []);
  const viewRows = vlRes.error ? [] : (vlRes.data ?? []);
  const aeRows = aeRes.error && !isMissingObject(aeRes.error.code) ? [] : (aeRes.data ?? []);

  // 2. Resolve resource titles in batch (one query per referenced type).
  const bookFileIds = uniq(downloadRows.map((r: any) => r.book_file_id).filter(Boolean));
  const { data: bookFiles } = bookFileIds.length
    ? await db.from("book_files").select("id, book_id").in("id", bookFileIds)
    : { data: [] as any[] };
  const fileToBook = new Map((bookFiles ?? []).map((f: any) => [f.id, f.book_id]));

  // Gather every resource id per type across all sources.
  const idsByType: Record<string, Set<string>> = { book: new Set(), thesis: new Set(), publication: new Set(), post: new Set() };
  for (const bid of fileToBook.values()) if (bid) idsByType.book.add(bid);
  for (const r of rrdRows as any[]) if (r.report_id) idsByType.thesis.add(r.report_id);
  for (const r of viewRows as any[]) {
    const t = contentTypeToResource(r.content_type);
    if (r.content_id && idsByType[t]) idsByType[t].add(r.content_id);
  }
  for (const r of downloadRows as any[]) {
    if (r.content_type && r.content_id) {
      const t = contentTypeToResource(r.content_type);
      if (idsByType[t]) idsByType[t].add(r.content_id);
    }
  }
  for (const r of aeRows as any[]) {
    if (r.resource_id && idsByType[r.resource_type as string]) idsByType[r.resource_type as string].add(r.resource_id);
  }

  const [bookTitles, thesisTitles, pubTitles, postTitles] = await Promise.all([
    fetchTitles(db, "books", idsByType.book),
    fetchTitles(db, "research_reports", idsByType.thesis),
    fetchTitles(db, "publications", idsByType.publication),
    fetchTitles(db, "posts", idsByType.post),
  ]);
  const titleFor = (type: ResourceType, id: string | null): string | null => {
    if (!id) return null;
    if (type === "book") return bookTitles.get(id) ?? null;
    if (type === "thesis") return thesisTitles.get(id) ?? null;
    if (type === "publication") return pubTitles.get(id) ?? null;
    if (type === "post") return postTitles.get(id) ?? null;
    return null;
  };

  // 3. Normalize every source into ActivityEvent.
  const events: ActivityEvent[] = [];

  for (const r of downloadRows as any[]) {
    const useContent = r.content_type && r.content_id;
    const resourceType: ResourceType = useContent ? contentTypeToResource(r.content_type) : "book";
    const resourceId: string | null = useContent ? r.content_id : (fileToBook.get(r.book_file_id) ?? null);
    events.push(baseEvent(r.id, "download_logs", "download", "authorized", resourceType, resourceId, titleFor(resourceType, resourceId), r.user_id, r.user, r.downloaded_at, {}));
  }

  for (const r of rrdRows as any[]) {
    events.push(baseEvent(r.id, "research_report_downloads", "download", "authorized", "thesis", r.report_id, titleFor("thesis", r.report_id), r.user_id, r.user, r.downloaded_at, {
      institutionType: r.institution_type_snapshot ?? null,
      role: r.role_snapshot ?? null,
      purpose: r.purpose_snapshot ?? null,
      rankAtEvent: r.rank_at_download ?? null,
      permissionSource: r.permission_source ?? null,
    }));
  }

  for (const r of viewRows as any[]) {
    const resourceType = contentTypeToResource(r.content_type);
    events.push(baseEvent(r.id, "view_logs", "view", "success", resourceType, r.content_id ?? null, titleFor(resourceType, r.content_id ?? null), r.user_id, r.user, r.viewed_at, { locale: r.locale ?? null }));
  }

  for (const r of aeRows as any[]) {
    const resourceType = (r.resource_type ?? "system") as ResourceType;
    events.push(baseEvent(r.id, "activity_events", (r.event_type ?? "download") as any, (r.event_status ?? "denied") as EventStatus, resourceType, r.resource_id ?? null, titleFor(resourceType, r.resource_id ?? null), r.user_id, r.user, r.occurred_at, {
      institutionType: r.institution_type_snapshot ?? null,
      role: r.role_snapshot ?? null,
      purpose: r.purpose_snapshot ?? null,
      rankAtEvent: r.rank_at_event ?? null,
      permissionSource: r.permission_source ?? null,
      denialReason: (r.permission_reason ?? null) as DenialReason | null,
      locale: r.locale ?? null,
    }));
  }

  // 4. Sort newest-first.
  events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  // 5. Cross-cutting scope filters shared by cards + tabs + table.
  const q = filters.search.trim().toLowerCase();
  const scoped = events.filter((e) => {
    if (filters.resourceType !== "all" && e.resourceType !== filters.resourceType) return false;
    if (q) {
      const hay = [e.actorName, e.actorEmail, e.resourceTitle, e.institutionType, e.role, e.resourceId, e.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // 6. Summary + tab counts + analytics from the scoped set
  //    (range + resourceType + search). ONE pass over `scoped` produces all
  //    three: the aggregates the overview needs are cheap folds over a set we
  //    have already materialized, so the analytics section costs no extra
  //    query and no second scan.
  const summary: ActivitySummary = {
    authorizedDownloads: 0,
    deniedDownloads: 0,
    failedDownloads: 0,
    pageViews: 0,
    activeUsers: 0,
    totalEvents: scoped.length,
    securityAlerts: 0,
  };
  const activeUserSet = new Set<string>();
  const tabCounts = { all: scoped.length, downloads: 0, views: 0, security: 0, account: 0, admin: 0 };

  const bucket = pickTimelineBucket(startMs, endMs);
  const bucketStarts = timelineBucketStarts(startMs, endMs, bucket);
  const bucketSize = BUCKET_MS[bucket];
  const firstBucket = bucketStarts[0] ?? startMs;
  const timeline: ActivityTimelinePoint[] = bucketStarts.map((ms) => ({
    start: new Date(ms).toISOString(),
    views: 0,
    downloads: 0,
    security: 0,
  }));

  const byResource = new Map<ResourceType, ActivityResourceRow>();
  const reasonCounts = new Map<DenialReason, number>();
  const security: ActivitySecurityBreakdown = {
    total: 0,
    deniedDownloads: 0,
    failedDownloads: 0,
    otherSecurity: 0,
    reasons: [],
    unspecified: 0,
  };

  for (const e of scoped) {
    if (e.userId) activeUserSet.add(e.userId);

    const t = tabForEvent(e);
    tabCounts[t]++;

    const isView = e.eventType === "view";
    const isAuthorizedDownload = e.eventType === "download" && e.eventStatus === "authorized";
    const isSecurity = t === "security";

    if (e.eventType === "download") {
      if (e.eventStatus === "authorized") summary.authorizedDownloads++;
      else if (e.eventStatus === "denied") summary.deniedDownloads++;
      else if (e.eventStatus === "failed") summary.failedDownloads++;
    } else if (isView) {
      summary.pageViews++;
    }

    // Timeline. Index arithmetic rather than a lookup: buckets are uniform, so
    // the slot is derivable. Events can only fall outside the array when a
    // source row sits a hair outside the range bounds — clamped, never dropped
    // silently into the wrong bucket.
    if (timeline.length > 0) {
      const at = floorToBucket(new Date(e.occurredAt).getTime(), bucket);
      const slot = Math.round((at - firstBucket) / bucketSize);
      if (slot >= 0 && slot < timeline.length) {
        if (isView) timeline[slot].views++;
        else if (isAuthorizedDownload) timeline[slot].downloads++;
        if (isSecurity) timeline[slot].security++;
      }
    }

    // Resource distribution.
    let row = byResource.get(e.resourceType);
    if (!row) {
      row = { resourceType: e.resourceType, views: 0, downloads: 0, security: 0, total: 0 };
      byResource.set(e.resourceType, row);
    }
    row.total++;
    if (isView) row.views++;
    else if (isAuthorizedDownload) row.downloads++;
    if (isSecurity) row.security++;

    // Security decomposition — mirrors tabForEvent so the parts always sum to
    // the Security tab's own count.
    if (isSecurity) {
      security.total++;
      if (e.eventType === "download" && e.eventStatus === "denied") security.deniedDownloads++;
      else if (e.eventType === "download" && e.eventStatus === "failed") security.failedDownloads++;
      else security.otherSecurity++;
      if (e.denialReason) reasonCounts.set(e.denialReason, (reasonCounts.get(e.denialReason) ?? 0) + 1);
      else security.unspecified++;
    }
  }
  summary.activeUsers = activeUserSet.size;
  summary.securityAlerts = tabCounts.security;

  security.reasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  const analytics: ActivityAnalytics = {
    bucket,
    timeline,
    // Stable ordering: busiest first, then the canonical taxonomy order, so a
    // tie doesn't make the list jump between refreshes.
    byResource: [...byResource.values()].sort(
      (a, b) =>
        b.total - a.total ||
        RESOURCE_TYPES.indexOf(a.resourceType) - RESOURCE_TYPES.indexOf(b.resourceType),
    ),
    security,
  };

  // 7. Table rows: apply tab + status, then paginate.
  const tableFiltered = scoped.filter((e) => {
    if (filters.tab !== "all" && tabForEvent(e) !== filters.tab) return false;
    if (filters.status !== "all" && e.eventStatus !== filters.status) return false;
    return true;
  });
  const total = tableFiltered.length;
  const pageSize = Math.max(1, filters.pageSize);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(0, filters.page), totalPages - 1);
  const pageRows = tableFiltered.slice(page * pageSize, page * pageSize + pageSize);

  return {
    events: pageRows,
    pagination: { page, pageSize, total, totalPages },
    summary,
    tabCounts,
    analytics,
    appliedRange: { start, end, timezone: ADMIN_TZ },
  };
}

/** All events matching the current NON-paginated filters — used by CSV export. */
export async function queryActivityForExport(
  filters: Omit<ActivityFilters, "page" | "pageSize">,
): Promise<ActivityEvent[]> {
  const res = await queryActivity({ ...filters, page: 0, pageSize: SOURCE_CAP });
  return res.events;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function baseEvent(
  id: string,
  source: ActivityEvent["source"],
  eventType: ActivityEvent["eventType"],
  eventStatus: EventStatus,
  resourceType: ResourceType,
  resourceId: string | null,
  resourceTitle: string | null,
  userId: string | null,
  user: ProfileJoin,
  occurredAt: string,
  extra: Partial<ActivityEvent>,
): ActivityEvent {
  return {
    id: `${source}:${id}`,
    source,
    eventType,
    eventStatus,
    resourceType,
    resourceId,
    resourceTitle,
    userId: userId ?? null,
    actorName: user?.full_name ?? null,
    actorEmail: user?.email ?? null,
    actorAvatar: user?.avatar_url ?? null,
    isAnon: !userId,
    institutionType: null,
    role: null,
    purpose: null,
    rankAtEvent: null,
    permissionSource: null,
    denialReason: null,
    locale: null,
    occurredAt,
    ...extra,
  };
}

function contentTypeToResource(ct: string | null | undefined): ResourceType {
  switch (ct) {
    case "research_report":
      return "thesis";
    case "publication":
      return "publication";
    case "post":
      return "post";
    case "book":
    default:
      return "book";
  }
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

async function fetchTitles(
  db: ReturnType<typeof createServiceClient>,
  table: string,
  ids: Set<string>,
): Promise<Map<string, string>> {
  if (ids.size === 0) return new Map();
  const { data, error } = await db.from(table).select("id, title").in("id", [...ids]);
  if (error) return new Map();
  return new Map((data ?? []).map((r: any) => [r.id, r.title as string]));
}
