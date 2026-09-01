import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { DETECTORS, runbookFor, type Finding } from "@/lib/security/detect";
import { isLive, type IncidentStatus } from "@/lib/security/incident-policy";
import {
  hasConfiguredSource,
  riskBand,
  SEVERITY_LABEL,
  SOURCELESS_TYPES,
  type RiskBand,
  type SecurityEventType,
  type Severity,
} from "@/lib/security/model";
import { securityConfigSnapshot } from "@/lib/security/config";

/**
 * Read model for /admin/security — the operational console.
 *
 * ── Relationship to /admin/logs ─────────────────────────────────────────────
 * /admin/logs is the ACTIVITY console: who downloaded what, who viewed what,
 * which downloads were denied. It reads download/view/activity tables through
 * `lib/admin/activity-log.ts` and is untouched by this work.
 *
 * /admin/security is the INCIDENT console: what is attacking the library right
 * now, what was done about it, and what the evidence was. Two consoles because
 * they answer different questions for different people at different times —
 * and because merging them would have meant putting the highest-volume event
 * class into a read-model with a 5,000-row cap (see migration 0127's header).
 *
 * Every query here is bounded and indexed. Nothing on this page runs a
 * detection pass: detection happens out of band in the cron route, so opening
 * the dashboard can never itself send an alert.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface IncidentSummary {
  id: string;
  reference: string;
  fingerprint: string;
  status: IncidentStatus;
  severity: Severity;
  severityLabel: string;
  riskScore: number;
  riskBand: RiskBand;
  category: string;
  title: string;
  service: string;
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
  recoveredAt: string | null;
  /** Milliseconds from first_seen to recovery, or to now while still live. */
  durationMs: number;
  detectionReason: string | null;
  runbook: string | null;
  alertCount: number;
  silencedUntil: string | null;
  /**
   * Whether the silence window is still in the future.
   *
   * Resolved HERE rather than in the page or the component: comparing to
   * `Date.now()` inside a React render is an impure read the purity lint
   * rightly rejects, and "is this incident currently silenced?" is a property
   * of the incident, not of the rendering.
   */
  silenced: boolean;
  parentReference: string | null;
}

export interface SecurityEventSummary {
  id: number;
  type: SecurityEventType;
  severity: Severity;
  riskScore: number;
  service: string;
  where: string;
  actorType: string;
  actorId: string | null;
  target: string | null;
  result: string;
  detail: string | null;
  requestId: string | null;
  occurredAt: string;
  incidentId: string | null;
  metadata: Record<string, unknown>;
}

export type PostureLevel = "protected" | "attention" | "incident";

export interface SecurityOverview {
  posture: PostureLevel;
  /** One sentence saying WHY the posture is what it is. Never decorative. */
  postureReason: string;
  activeIncidents: number;
  criticalIncidents: number;
  eventsToday: number;
  blockedToday: number;
  highRiskEventsToday: number;
  authEventsToday: number;
  rateLimitEventsToday: number;
  uploadEventsToday: number;
  lastIncident: IncidentSummary | null;
  /** Counts by event type over the window, busiest first. */
  threatBreakdown: { type: SecurityEventType; label: string; count: number }[];
  /** Hourly buckets for the timeline, oldest first. */
  timeline: { start: string; total: number; bySeverity: Record<Severity, number> }[];
  monitoring: MonitoringStatus;
  /** Whether the pipeline is recording at all — the honest "is this real?" flag. */
  collecting: boolean;
}

export interface ServiceStatus {
  name: string;
  /** `unknown` is a first-class value: never render a green tick we cannot justify. */
  state: "ok" | "degraded" | "down" | "unknown" | "not_configured";
  detail: string;
}

export interface MonitoringStatus {
  services: ServiceStatus[];
  /** When the detection pass last produced a durable effect, if known. */
  lastScanHint: string | null;
  deliveries: { sent: number; failed: number; skipped: number; suppressed: number };
  /** Detectors that exist but have no source wired (decision D3). */
  unsourced: SecurityEventType[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isMissing(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}

const ms = (iso: string | null) => (iso ? Date.parse(iso) : 0);

/* eslint-disable @typescript-eslint/no-explicit-any */
function toIncident(row: any, parentReference: string | null = null): IncidentSummary {
  const first = ms(row.first_seen);
  const end = row.recovered_at ? ms(row.recovered_at) : Date.now();
  return {
    id: row.id,
    reference: row.reference,
    fingerprint: row.fingerprint,
    status: row.status as IncidentStatus,
    severity: row.severity as Severity,
    severityLabel: SEVERITY_LABEL[row.severity as Severity] ?? "Unknown",
    riskScore: row.risk_score ?? 0,
    riskBand: riskBand(row.risk_score ?? 0),
    category: row.category,
    title: row.title,
    service: row.service,
    eventCount: row.event_count ?? 0,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    recoveredAt: row.recovered_at ?? null,
    durationMs: Math.max(0, end - first),
    detectionReason: row.detection_reason ?? row.summary ?? null,
    runbook: row.runbook ?? null,
    alertCount: row.alert_count ?? 0,
    silencedUntil: row.silenced_until ?? null,
    silenced: row.silenced_until ? ms(row.silenced_until) > Date.now() : false,
    parentReference,
  };
}

function toEvent(row: any): SecurityEventSummary {
  return {
    id: row.id,
    type: row.event_type as SecurityEventType,
    severity: row.severity as Severity,
    riskScore: row.risk_score ?? 0,
    service: row.service,
    where: row.location,
    actorType: row.actor_type,
    actorId: row.actor_id ?? null,
    target: row.target ?? null,
    result: row.result,
    detail: row.detail ?? null,
    requestId: row.request_id ?? null,
    occurredAt: row.occurred_at,
    incidentId: row.incident_id ?? null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function humanLabel(type: SecurityEventType): string {
  const words = type.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────────────────────

export async function getSecurityOverview(windowHours = 24): Promise<SecurityOverview> {
  const db = createServiceClient();
  const since = new Date(Date.now() - windowHours * 3600_000).toISOString();

  const [incidentsRes, eventsRes, deliveriesRes] = await Promise.all([
    db
      .from("security_incidents")
      .select("*")
      .order("last_seen", { ascending: false })
      .limit(200),
    db
      .from("security_events")
      .select("id,event_type,severity,risk_score,service,result,event_count,occurred_at")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(20_000),
    db
      .from("alert_deliveries")
      .select("status")
      .gte("created_at", since)
      .limit(2000),
  ]);

  // A missing table is "the migration has not been applied", not an error the
  // operator should see as a crash. The page says "not collecting" instead.
  const tablesMissing =
    isMissing(incidentsRes.error?.code) || isMissing(eventsRes.error?.code);

  const incidentRows = (incidentsRes.data ?? []) as Record<string, unknown>[];
  const eventRows = (eventsRes.data ?? []) as Record<string, unknown>[];
  const deliveryRows = (deliveriesRes.data ?? []) as { status: string }[];

  const incidents = incidentRows.map((r) => toIncident(r));
  const live = incidents.filter((i) => isLive(i.status));
  const critical = live.filter((i) => i.severity === 1);

  const weight = (r: Record<string, unknown>) => Math.max(1, Number(r.event_count ?? 1));
  const eventsToday = eventRows.reduce((sum, r) => sum + weight(r), 0);
  const blockedToday = eventRows
    .filter((r) => r.result === "blocked")
    .reduce((sum, r) => sum + weight(r), 0);
  const highRiskEventsToday = eventRows.filter((r) => Number(r.risk_score ?? 0) >= 60).length;

  const byService = (name: string) =>
    eventRows.filter((r) => r.service === name).reduce((sum, r) => sum + weight(r), 0);

  const counts = new Map<SecurityEventType, number>();
  for (const r of eventRows) {
    const type = r.event_type as SecurityEventType;
    counts.set(type, (counts.get(type) ?? 0) + weight(r));
  }
  const threatBreakdown = [...counts.entries()]
    .map(([type, count]) => ({ type, label: humanLabel(type), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Hourly buckets, oldest first. Empty buckets are kept — a quiet hour is
  // information, exactly as in the activity-log timeline.
  const bucketMs = 3600_000;
  const nowBucket = Math.floor(Date.now() / bucketMs) * bucketMs;
  const buckets = new Map<number, Record<Severity, number>>();
  for (let i = windowHours - 1; i >= 0; i--) {
    buckets.set(nowBucket - i * bucketMs, { 1: 0, 2: 0, 3: 0, 4: 0 });
  }
  for (const r of eventRows) {
    const bucket = Math.floor(Date.parse(r.occurred_at as string) / bucketMs) * bucketMs;
    const slot = buckets.get(bucket);
    if (slot) slot[(r.severity as Severity) ?? 4] += weight(r);
  }
  const timeline = [...buckets.entries()].map(([start, bySeverity]) => ({
    start: new Date(start).toISOString(),
    total: bySeverity[1] + bySeverity[2] + bySeverity[3] + bySeverity[4],
    bySeverity,
  }));

  const deliveries = {
    sent: deliveryRows.filter((d) => d.status === "sent").length,
    failed: deliveryRows.filter((d) => d.status === "failed").length,
    skipped: deliveryRows.filter((d) => d.status === "skipped").length,
    suppressed: deliveryRows.filter((d) => d.status === "suppressed").length,
  };

  // Posture. Deliberately conservative and always explained: a green badge
  // that cannot say why it is green is decoration, and "no events recorded"
  // must never render as "protected" — it far more often means the pipeline
  // is broken than that nothing happened.
  let posture: PostureLevel;
  let postureReason: string;
  if (tablesMissing) {
    posture = "attention";
    postureReason =
      "Security monitoring tables are not present — migration 0127 has not been applied to this database. Nothing is being recorded.";
  } else if (critical.length > 0) {
    posture = "incident";
    postureReason = `${critical.length} critical incident${critical.length === 1 ? "" : "s"} open and unresolved.`;
  } else if (live.length > 0) {
    posture = "attention";
    postureReason = `${live.length} incident${live.length === 1 ? "" : "s"} open, none critical.`;
  } else if (eventsToday === 0) {
    posture = "attention";
    postureReason =
      "No security events recorded in the window. That may mean a quiet period, or that event collection has stopped — check the monitoring panel before reading it as good news.";
  } else {
    posture = "protected";
    postureReason = `${eventsToday.toLocaleString()} events recorded and no incidents open. ${blockedToday.toLocaleString()} request${blockedToday === 1 ? " was" : "s were"} refused by an existing control.`;
  }

  return {
    posture,
    postureReason,
    activeIncidents: live.length,
    criticalIncidents: critical.length,
    eventsToday,
    blockedToday,
    highRiskEventsToday,
    authEventsToday: byService("auth") + byService("admin"),
    rateLimitEventsToday: eventRows
      .filter((r) => r.event_type === "rate_limited")
      .reduce((sum, r) => sum + weight(r), 0),
    uploadEventsToday: byService("uploads"),
    lastIncident: incidents[0] ?? null,
    threatBreakdown,
    timeline,
    monitoring: buildMonitoringStatus({ tablesMissing, eventRows, deliveries }),
    collecting: !tablesMissing && eventRows.length > 0,
  };
}

/**
 * Service status. Every state is derived from a signal we actually hold; where
 * we hold none, the state is `unknown` or `not_configured` and says so.
 * Rendering a green tick we cannot justify is the security theatre the brief
 * forbids (§42, §24).
 */
function buildMonitoringStatus(input: {
  tablesMissing: boolean;
  eventRows: Record<string, unknown>[];
  deliveries: { sent: number; failed: number; skipped: number; suppressed: number };
}): MonitoringStatus {
  const { tablesMissing, eventRows, deliveries } = input;
  const has = (type: string) => eventRows.some((r) => r.event_type === type);
  const services: ServiceStatus[] = [];

  services.push({
    name: "Event collection",
    state: tablesMissing ? "down" : eventRows.length > 0 ? "ok" : "unknown",
    detail: tablesMissing
      ? "security_events table absent (migration 0127 pending)"
      : eventRows.length > 0
        ? `${eventRows.length.toLocaleString()} events in the window`
        : "No events in the window — quiet, or not collecting",
  });

  services.push({
    name: "Rate limiting",
    state: has("rate_limiter_degraded") ? "degraded" : "ok",
    detail: has("rate_limiter_degraded")
      ? "Degraded to in-memory fallback at least once in the window"
      : "No degraded-limiter events",
  });

  services.push({
    name: "Malware scanning",
    state: has("virus_scan_skipped")
      ? "not_configured"
      : has("virus_scan_error")
        ? "degraded"
        : "ok",
    detail: has("virus_scan_skipped")
      ? "Uploads accepted unscanned — VIRUSTOTAL_API_KEY is not set"
      : has("virus_scan_error")
        ? "Scanner errored; uploads fail open unless FAIL_CLOSED_VIRUS_SCAN=true"
        : "No scanner errors in the window",
  });

  const telegramConfigured = Boolean(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID,
  );
  services.push({
    name: "Telegram alerting",
    state: !telegramConfigured
      ? "not_configured"
      : deliveries.failed > 0 && deliveries.sent === 0
        ? "down"
        : deliveries.failed > 0
          ? "degraded"
          : "ok",
    detail: !telegramConfigured
      ? "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — incidents open silently"
      : `${deliveries.sent} sent, ${deliveries.failed} failed in the window`,
  });

  services.push({
    name: "Emergency lockdown",
    state: has("lockdown_blocked") ? "degraded" : "ok",
    detail: has("lockdown_blocked")
      ? "A lockdown switch is actively refusing requests"
      : "No lockdown switch engaged",
  });

  // Signals we genuinely do not have. Naming them is the point.
  services.push({
    name: "Cloudflare WAF",
    state: "not_configured",
    detail: "No Cloudflare API credentials — WAF and DDoS signals are not ingested",
  });

  return {
    services,
    lastScanHint: null,
    deliveries,
    unsourced: [...SOURCELESS_TYPES],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Incident list & detail
// ─────────────────────────────────────────────────────────────────────────────

export interface IncidentFilters {
  status?: IncidentStatus | "all" | "live";
  severity?: Severity | "all";
  category?: string | "all";
  search?: string;
  from?: string | null;
  to?: string | null;
  page: number;
  pageSize: number;
}

export interface IncidentPage {
  incidents: IncidentSummary[];
  total: number;
  totalPages: number;
  categories: string[];
  available: boolean;
}

export async function listIncidents(filters: IncidentFilters): Promise<IncidentPage> {
  const db = createServiceClient();
  let query = db.from("security_incidents").select("*", { count: "exact" });

  if (filters.status && filters.status !== "all") {
    if (filters.status === "live") {
      query = query.in("status", ["detected", "open", "acknowledged", "investigating", "mitigating"]);
    } else {
      query = query.eq("status", filters.status);
    }
  }
  if (filters.severity && filters.severity !== "all") query = query.eq("severity", filters.severity);
  if (filters.category && filters.category !== "all") query = query.eq("category", filters.category);
  if (filters.from) query = query.gte("last_seen", filters.from);
  if (filters.to) query = query.lte("last_seen", filters.to);
  if (filters.search) {
    // Reference and title only. `fingerprint` is deliberately excluded from
    // free-text search: it can contain a target's user id, and an admin who
    // pastes an id into a search box should look it up, not fuzzy-match it.
    const term = filters.search.replace(/[%,()]/g, "").slice(0, 80);
    if (term) query = query.or(`reference.ilike.%${term}%,title.ilike.%${term}%`);
  }

  const from = filters.page * filters.pageSize;
  const { data, error, count } = await query
    .order("last_seen", { ascending: false })
    .range(from, from + filters.pageSize - 1);

  if (error) {
    if (isMissing(error.code)) {
      return { incidents: [], total: 0, totalPages: 0, categories: [], available: false };
    }
    throw new Error(`incident list failed: ${error.message}`);
  }

  const { data: categoryRows } = await db
    .from("security_incidents")
    .select("category")
    .limit(500);
  const categories = [
    ...new Set(((categoryRows ?? []) as { category: string }[]).map((r) => r.category)),
  ].sort();

  const total = count ?? 0;
  return {
    incidents: (data ?? []).map((r) => toIncident(r)),
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    categories,
    available: true,
  };
}

export interface IncidentDetail {
  incident: IncidentSummary;
  events: SecurityEventSummary[];
  deliveries: {
    channel: string;
    kind: string;
    status: string;
    attempt: number;
    errorClass: string | null;
    createdAt: string;
  }[];
  audit: { action: string; adminId: string; createdAt: string; metadata: Record<string, unknown> }[];
  children: IncidentSummary[];
}

export async function getIncidentDetail(reference: string): Promise<IncidentDetail | null> {
  const db = createServiceClient();
  const { data: row, error } = await db
    .from("security_incidents")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();
  if (error || !row) return null;

  const incidentRow = row as Record<string, unknown>;
  let parentReference: string | null = null;
  if (incidentRow.parent_incident_id) {
    const { data: parent } = await db
      .from("security_incidents")
      .select("reference")
      .eq("id", incidentRow.parent_incident_id)
      .maybeSingle();
    parentReference = (parent as { reference: string } | null)?.reference ?? null;
  }

  const [eventsRes, deliveriesRes, auditRes, childrenRes] = await Promise.all([
    db
      .from("security_events")
      .select("*")
      .eq("incident_id", incidentRow.id)
      .order("occurred_at", { ascending: false })
      .limit(200),
    db
      .from("alert_deliveries")
      .select("channel,kind,status,attempt,error_class,created_at")
      .eq("incident_id", incidentRow.id)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("admin_audit_log")
      .select("action,admin_id,created_at,metadata")
      .eq("target_table", "security_incidents")
      .eq("target_id", incidentRow.id)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("security_incidents")
      .select("*")
      .eq("parent_incident_id", incidentRow.id)
      .limit(20),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return {
    incident: toIncident(incidentRow, parentReference),
    events: ((eventsRes.data ?? []) as any[]).map(toEvent),
    deliveries: ((deliveriesRes.data ?? []) as any[]).map((d) => ({
      channel: d.channel,
      kind: d.kind,
      status: d.status,
      attempt: d.attempt,
      errorClass: d.error_class ?? null,
      createdAt: d.created_at,
    })),
    audit: ((auditRes.data ?? []) as any[]).map((a) => ({
      action: a.action,
      adminId: a.admin_id,
      createdAt: a.created_at,
      metadata: (a.metadata ?? {}) as Record<string, unknown>,
    })),
    children: ((childrenRes.data ?? []) as any[]).map((c) => toIncident(c)),
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// ─────────────────────────────────────────────────────────────────────────────
// Event explorer
// ─────────────────────────────────────────────────────────────────────────────

export interface EventFilters {
  type?: SecurityEventType | "all";
  severity?: Severity | "all";
  service?: string | "all";
  result?: string | "all";
  requestId?: string;
  incidentId?: string;
  from?: string | null;
  to?: string | null;
  page: number;
  pageSize: number;
}

export interface EventPage {
  events: SecurityEventSummary[];
  total: number;
  totalPages: number;
  types: SecurityEventType[];
  services: string[];
  available: boolean;
}

export async function listSecurityEvents(filters: EventFilters): Promise<EventPage> {
  const db = createServiceClient();
  let query = db.from("security_events").select("*", { count: "exact" });

  if (filters.type && filters.type !== "all") query = query.eq("event_type", filters.type);
  if (filters.severity && filters.severity !== "all") query = query.eq("severity", filters.severity);
  if (filters.service && filters.service !== "all") query = query.eq("service", filters.service);
  if (filters.result && filters.result !== "all") query = query.eq("result", filters.result);
  if (filters.requestId) query = query.eq("request_id", filters.requestId.slice(0, 100));
  if (filters.incidentId) query = query.eq("incident_id", filters.incidentId);
  if (filters.from) query = query.gte("occurred_at", filters.from);
  if (filters.to) query = query.lte("occurred_at", filters.to);

  const from = filters.page * filters.pageSize;
  const { data, error, count } = await query
    .order("occurred_at", { ascending: false })
    .range(from, from + filters.pageSize - 1);

  if (error) {
    if (isMissing(error.code)) {
      return { events: [], total: 0, totalPages: 0, types: [], services: [], available: false };
    }
    throw new Error(`event list failed: ${error.message}`);
  }

  const { data: facetRows } = await db
    .from("security_events")
    .select("event_type,service")
    .order("occurred_at", { ascending: false })
    .limit(5000);
  const facets = (facetRows ?? []) as { event_type: string; service: string }[];

  const total = count ?? 0;
  return {
    events: (data ?? []).map((r) => toEvent(r)),
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    types: [...new Set(facets.map((f) => f.event_type as SecurityEventType))].sort(),
    services: [...new Set(facets.map((f) => f.service))].sort(),
    available: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Detection coverage — what this system can and cannot see
// ─────────────────────────────────────────────────────────────────────────────

export interface CoverageRow {
  detector: string;
  describes: string;
  sourced: boolean;
  runbook: string | null;
}

/**
 * The coverage table, derived from the detector registry itself rather than
 * hand-maintained — so it cannot claim a detector that was deleted, and cannot
 * omit one that was added. Types with no wired source appear separately and are
 * labelled as such (decision D3).
 */
export function getDetectionCoverage(): {
  detectors: CoverageRow[];
  unsourced: { type: SecurityEventType; reason: string }[];
} {
  return {
    detectors: DETECTORS.map((d) => ({
      detector: d.name,
      describes: d.describes,
      sourced: true,
      runbook: runbookFor(d.name as SecurityEventType) ?? null,
    })),
    unsourced: SOURCELESS_TYPES.filter((t) => !hasConfiguredSource(t)).map((type) => ({
      type,
      reason: "No Cloudflare API credentials are configured, so no edge signal is ingested.",
    })),
  };
}

export function getSecurityConfig(): Record<string, number | boolean> {
  return securityConfigSnapshot();
}

/** Re-exported so the pages do not import from two places. */
export type { Finding };
