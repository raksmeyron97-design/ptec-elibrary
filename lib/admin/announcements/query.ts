/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import {
  normalizeAudienceType,
  normalizePriority,
  normalizeStatus,
  normalizeType,
  type AnnouncementFiltersValue,
  type AnnouncementListRow,
} from "./shared";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

/** Same metacharacter strip used by app/api/chat/route.ts for PostgREST `.or()` filters. */
function sanitizeSearchTerm(input: string): string {
  return input.replace(/[%,()\\*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

export interface AnnouncementQueryResult {
  rows: AnnouncementListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AnnouncementMetrics {
  active: number;
  scheduled: number;
  drafts: number;
  pushSubscribers: number;
  /** Delivery success rate over the selected period, as a 0–1 fraction, or
   *  null when there is no delivery data in range yet (never fabricated). */
  deliverySuccessRate: number | null;
  deliveryAttempts: number;
}

export async function queryAnnouncements(
  filters: AnnouncementFiltersValue,
  page: number,
  pageSize: number = PAGE_SIZE_DEFAULT,
): Promise<AnnouncementQueryResult> {
  const db = createServiceClient();
  const size = Math.min(Math.max(1, pageSize), PAGE_SIZE_MAX);
  const from = Math.max(0, page) * size;
  const to = from + size - 1;

  let query = db
    .from("announcements")
    .select(
      "id, internal_name, title_en, title_km, type, priority, status, channel_in_app, channel_banner, channel_push, audience_type, audience_roles, pinned, scheduled_at, published_at, expires_at, estimated_recipients, estimated_devices, created_by, created_at, updated_at",
      { count: "exact" },
    );

  if (filters.status !== "all") query = query.eq("status", normalizeStatus(filters.status));
  if (filters.priority !== "all") query = query.eq("priority", normalizePriority(filters.priority));
  if (filters.audience !== "all") query = query.eq("audience_type", normalizeAudienceType(filters.audience));
  if (filters.creatorId) query = query.eq("created_by", filters.creatorId);
  if (filters.channel === "in_app") query = query.eq("channel_in_app", true);
  if (filters.channel === "banner") query = query.eq("channel_banner", true);
  if (filters.channel === "push") query = query.eq("channel_push", true);
  if (filters.langComplete === "both") query = query.not("title_km", "is", null).neq("title_km", "");
  if (filters.langComplete === "en_only") query = query.or("title_km.is.null,title_km.eq.");
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo);

  const q = sanitizeSearchTerm(filters.q);
  if (q) {
    query = query.or(
      `internal_name.ilike.%${q}%,title_en.ilike.%${q}%,title_km.ilike.%${q}%,body_en.ilike.%${q}%`,
    );
  }

  switch (filters.sort) {
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "scheduled":
      query = query.order("scheduled_at", { ascending: true, nullsFirst: false });
      break;
    case "priority":
      // Stable secondary sort by recency within the same priority tier.
      query = query.order("priority", { ascending: false }).order("created_at", { ascending: false });
      break;
    case "delivery":
      // No single indexed delivery column to sort by server-side yet — fall
      // back to recency; the delivery report itself lives on the detail page.
      query = query.order("created_at", { ascending: false });
      break;
    case "newest":
    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    return { rows: [], total: 0, page, pageSize: size, totalPages: 1 };
  }

  const rows = (data ?? []) as any[];
  const ids = rows.map((r) => r.id);
  const creatorIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];

  const [creatorsRes, jobsRes] = await Promise.all([
    creatorIds.length
      ? db.from("profiles").select("id, full_name, email").in("id", creatorIds)
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? db
          .from("announcement_delivery_jobs")
          .select("announcement_id, status, sent, failed, expired, total_targets, created_at")
          .in("announcement_id", ids)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const creatorMap = new Map(((creatorsRes.data ?? []) as any[]).map((c) => [c.id, c.full_name || c.email || null]));
  const latestJobByAnnouncement = new Map<string, any>();
  for (const job of (jobsRes.data ?? []) as any[]) {
    if (!latestJobByAnnouncement.has(job.announcement_id)) latestJobByAnnouncement.set(job.announcement_id, job);
  }

  const mapped: AnnouncementListRow[] = rows.map((r) => {
    const job = latestJobByAnnouncement.get(r.id);
    return {
      id: r.id,
      internalName: r.internal_name,
      titleEn: r.title_en,
      titleKm: r.title_km,
      type: normalizeType(r.type),
      priority: normalizePriority(r.priority),
      status: normalizeStatus(r.status),
      channelInApp: r.channel_in_app,
      channelBanner: r.channel_banner,
      channelPush: r.channel_push,
      audienceType: normalizeAudienceType(r.audience_type),
      audienceRoles: r.audience_roles ?? [],
      pinned: r.pinned,
      scheduledAt: r.scheduled_at,
      publishedAt: r.published_at,
      expiresAt: r.expires_at,
      estimatedRecipients: r.estimated_recipients,
      estimatedDevices: r.estimated_devices,
      createdByName: creatorMap.get(r.created_by) ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      delivery: job
        ? { sent: job.sent, failed: job.failed, expired: job.expired, total: job.total_targets, jobStatus: job.status }
        : null,
    };
  });

  const total = count ?? mapped.length;
  return { rows: mapped, total, page, pageSize: size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

/** Distinct creators for the "Creator" filter dropdown — cheap, small set. */
export async function listAnnouncementCreators(): Promise<{ id: string; name: string }[]> {
  const db = createServiceClient();
  const { data } = await db.from("announcements").select("created_by").not("created_by", "is", null).limit(2000);
  const ids = [...new Set(((data ?? []) as any[]).map((r) => r.created_by))];
  if (ids.length === 0) return [];
  const { data: profiles } = await db.from("profiles").select("id, full_name, email").in("id", ids);
  return ((profiles ?? []) as any[]).map((p) => ({ id: p.id, name: p.full_name || p.email || p.id }));
}

export interface AnnouncementDetail {
  row: any;
  createdByName: string | null;
  approvedByName: string | null;
  history: any[];
  jobs: any[];
  deliveryTotals: { sent: number; failed: number; expired: number; total: number } | null;
}

/** Full detail for the announcement detail/report page: the row itself, its
 *  status timeline, and every delivery job + rolled-up totals. */
export async function getAnnouncementDetail(id: string): Promise<AnnouncementDetail | null> {
  const db = createServiceClient();

  const { data: row, error } = await db.from("announcements").select("*").eq("id", id).maybeSingle();
  if (error || !row) return null;

  const peopleIds = [row.created_by, row.approved_by, row.updated_by].filter(Boolean);
  const [peopleRes, historyRes, jobsRes] = await Promise.all([
    peopleIds.length ? db.from("profiles").select("id, full_name, email").in("id", peopleIds) : Promise.resolve({ data: [] as any[] }),
    db
      .from("announcement_status_history")
      .select("id, from_status, to_status, actor_id, reason, metadata, created_at")
      .eq("announcement_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("announcement_delivery_jobs")
      .select("id, status, total_targets, processed, sent, failed, expired, started_at, completed_at, last_error, created_at")
      .eq("announcement_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const people = new Map(((peopleRes.data ?? []) as any[]).map((p) => [p.id, p.full_name || p.email || null]));
  const jobs = (jobsRes.data ?? []) as any[];
  const latestJob = jobs[0] ?? null;

  // Resolve actor names for the timeline in one batched query.
  const actorIds = [...new Set((historyRes.data ?? []).map((h: any) => h.actor_id).filter(Boolean))];
  const actorNames = new Map<string, string | null>();
  if (actorIds.length) {
    const { data: actors } = await db.from("profiles").select("id, full_name, email").in("id", actorIds);
    for (const a of (actors ?? []) as any[]) actorNames.set(a.id, a.full_name || a.email || null);
  }
  const history = ((historyRes.data ?? []) as any[]).map((h) => ({ ...h, actorName: h.actor_id ? actorNames.get(h.actor_id) ?? null : null }));

  return {
    row,
    createdByName: row.created_by ? people.get(row.created_by) ?? null : null,
    approvedByName: row.approved_by ? people.get(row.approved_by) ?? null : null,
    history,
    jobs,
    deliveryTotals: latestJob
      ? { sent: latestJob.sent, failed: latestJob.failed, expired: latestJob.expired, total: latestJob.total_targets }
      : null,
  };
}

/** Cheap, indexed summary metrics for the dashboard header cards. Never scans
 *  full tables — every query is a `count: "exact", head: true` or bounded by
 *  the caller's date range. */
export async function getAnnouncementMetrics(rangeStart: string, rangeEnd: string): Promise<AnnouncementMetrics> {
  const db = createServiceClient();

  const [activeRes, scheduledRes, draftsRes, subsRes, deliveryRes] = await Promise.all([
    db.from("announcements").select("id", { count: "exact", head: true }).in("status", ["active", "partially_delivered"]),
    db.from("announcements").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
    db.from("announcements").select("id", { count: "exact", head: true }).in("status", ["draft", "awaiting_approval"]),
    db.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("enabled", true),
    db
      .from("announcement_push_deliveries")
      .select("status", { count: "exact" })
      .gte("created_at", rangeStart)
      .lte("created_at", rangeEnd)
      .in("status", ["sent", "failed", "expired", "dead"]),
  ]);

  const deliveryRows = (deliveryRes.data ?? []) as { status: string }[];
  const attempts = deliveryRows.length;
  const sent = deliveryRows.filter((r) => r.status === "sent").length;

  return {
    active: activeRes.count ?? 0,
    scheduled: scheduledRes.count ?? 0,
    drafts: draftsRes.count ?? 0,
    pushSubscribers: subsRes.count ?? 0,
    deliverySuccessRate: attempts > 0 ? sent / attempts : null,
    deliveryAttempts: attempts,
  };
}
