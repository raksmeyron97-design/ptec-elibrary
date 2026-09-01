import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logSecurityEvent } from "@/lib/security-log";
import {
  correlate,
  detect,
  suppressorFor,
  type Baseline,
  type Finding,
  type SecurityEventRecord,
} from "./detect";
import {
  decideAlert,
  decideRecovery,
  isLive,
  LIVE_STATUSES,
  mergeFinding,
  type IncidentSnapshot,
  type IncidentStatus,
} from "./incident-policy";
import {
  alertPipelineFailureThreshold,
  detectionLookbackMinutes,
  detectionMaxEvents,
} from "./config";
import { flush as flushSecurityEvents } from "./sink";
import { notifyIncident, notifyPipelineDegraded, notifyRecovery } from "./notify/telegram";
import type { ActorType, EventResult, SecurityEventType, Severity } from "./model";

/**
 * The incident engine — the server-only orchestration that turns persisted
 * events into deduplicated, notified, recoverable incidents.
 *
 * It holds NO policy. Detection lives in `detect.ts`, lifecycle and alert
 * decisions in `incident-policy.ts`, thresholds in `config.ts`, message text in
 * `notify/format.ts` — all pure and unit-tested. This file only reads rows,
 * calls those functions, writes rows, and sends.
 *
 * ── Concurrency ─────────────────────────────────────────────────────────────
 * Two passes can overlap (a 5-minute cron against a pass that runs long, or a
 * manual run beside the schedule). Correctness does not depend on them not
 * overlapping: the partial unique index in migration 0127 makes "at most one
 * live incident per fingerprint" a database guarantee, so the worst case is a
 * duplicate-key error that this code treats as "someone else opened it" and
 * re-reads. That is deliberately not solved with an application lock, which
 * would be a second source of truth that can drift.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Row shapes
// ─────────────────────────────────────────────────────────────────────────────

type EventRow = {
  id: number;
  event_type: string;
  severity: number;
  risk_score: number;
  service: string;
  location: string;
  actor_type: string;
  actor_id: string | null;
  target: string | null;
  result: string;
  detail: string | null;
  request_id: string | null;
  ip_hash: string | null;
  event_count: number;
  fingerprint: string;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
};

type IncidentRow = {
  id: string;
  reference: string;
  fingerprint: string;
  status: string;
  severity: number;
  risk_score: number;
  category: string;
  title: string;
  summary: string | null;
  service: string;
  event_count: number;
  first_seen: string;
  last_seen: string;
  silenced_until: string | null;
  last_alert_at: string | null;
  alert_count: number;
  recovery_alert_at: string | null;
  detection_reason: string | null;
  runbook: string | null;
  parent_incident_id: string | null;
  metadata?: Record<string, unknown> | null;
};

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** A missing table means 0127 has not been applied — degrade, do not crash. */
function isMissingTable(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}

const ms = (iso: string | null): number => (iso ? Date.parse(iso) : 0);

export function toEventRecord(row: EventRow): SecurityEventRecord {
  return {
    id: row.id,
    type: row.event_type as SecurityEventType,
    severity: row.severity as Severity,
    riskScore: row.risk_score,
    service: row.service,
    where: row.location,
    actorType: row.actor_type as ActorType,
    actorId: row.actor_id,
    target: row.target,
    result: row.result as EventResult,
    detail: row.detail,
    requestId: row.request_id,
    ipHash: row.ip_hash,
    count: row.event_count,
    fingerprint: row.fingerprint,
    metadata: row.metadata ?? {},
    occurredAt: Date.parse(row.occurred_at),
  };
}

export function toSnapshot(row: IncidentRow, lastAlertSeverity: Severity | null): IncidentSnapshot {
  return {
    id: row.id,
    reference: row.reference,
    fingerprint: row.fingerprint,
    status: row.status as IncidentStatus,
    severity: row.severity as Severity,
    riskScore: row.risk_score,
    eventCount: row.event_count,
    firstSeen: ms(row.first_seen),
    lastSeen: ms(row.last_seen),
    lastAlertAt: row.last_alert_at ? ms(row.last_alert_at) : null,
    alertCount: row.alert_count,
    lastAlertSeverity,
    silencedUntil: row.silenced_until ? ms(row.silenced_until) : null,
    recoveryAlertAt: row.recovery_alert_at ? ms(row.recovery_alert_at) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export async function loadRecentEvents(
  client: SupabaseClient,
  sinceMs: number,
): Promise<SecurityEventRecord[]> {
  const { data, error } = await client
    .from("security_events")
    .select(
      "id,event_type,severity,risk_score,service,location,actor_type,actor_id,target,result,detail,request_id,ip_hash,event_count,fingerprint,metadata,occurred_at",
    )
    .gte("occurred_at", new Date(sinceMs).toISOString())
    .order("occurred_at", { ascending: false })
    .limit(detectionMaxEvents());

  if (error) {
    if (isMissingTable(error.code)) return [];
    throw new Error(`security_events read failed: ${error.message}`);
  }
  return (data ?? []).map((row) => toEventRecord(row as EventRow));
}

export async function loadLiveIncidents(client: SupabaseClient): Promise<IncidentRow[]> {
  const { data, error } = await client
    .from("security_incidents")
    .select("*")
    .in("status", LIVE_STATUSES as unknown as string[])
    .order("last_seen", { ascending: false });

  if (error) {
    if (isMissingTable(error.code)) return [];
    throw new Error(`security_incidents read failed: ${error.message}`);
  }
  return (data ?? []) as IncidentRow[];
}

export async function loadBaselines(client: SupabaseClient): Promise<Map<string, Baseline>> {
  const out = new Map<string, Baseline>();
  const { data, error } = await client
    .from("security_baselines")
    .select("signal,mean,stddev,sample_count,computed_at")
    .order("computed_at", { ascending: false })
    .limit(500);
  if (error || !data) return out;
  for (const row of data as { signal: string; mean: number; stddev: number | null; sample_count: number }[]) {
    // Newest first, so the first sighting of a signal wins.
    if (!out.has(row.signal)) {
      out.set(row.signal, {
        signal: row.signal,
        mean: Number(row.mean),
        stddev: row.stddev === null ? null : Number(row.stddev),
        sampleCount: row.sample_count,
      });
    }
  }
  return out;
}

/**
 * Severity at the time of an incident's last notification.
 *
 * Stored on the incident's `metadata` at send time rather than recomputed,
 * because "what did we last TELL them?" is not derivable from the incident's
 * current state: severity only moves upward, so comparing an escalation
 * against the current value would always say "no change".
 */
async function lastAlertSeverities(
  client: SupabaseClient,
  incidents: IncidentRow[],
): Promise<Map<string, Severity>> {
  const out = new Map<string, Severity>();
  const alerted = incidents.filter((i) => i.alert_count > 0);
  if (!alerted.length) return out;
  // The incident's own severity only moves upward within its life
  // (mergeFinding), so the severity at last alert is recoverable from the
  // alert count boundary: we store it in metadata at send time.
  for (const incident of alerted) {
    const stored = incident.metadata?.lastAlertSeverity;
    if (typeof stored === "number" && stored >= 1 && stored <= 4) {
      out.set(incident.id, stored as Severity);
    } else {
      // Pre-existing incident with no stored value: assume it was alerted at
      // its current severity, which makes "escalated?" false. Failing toward
      // silence here is right — the alternative re-alerts every pass.
      out.set(incident.id, incident.severity as Severity);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

async function openIncident(
  client: SupabaseClient,
  finding: Finding,
  parentId: string | null,
): Promise<IncidentRow | null> {
  const { data: reference, error: refError } = await client.rpc("next_incident_reference");
  if (refError) {
    if (isMissingTable(refError.code)) return null;
    throw new Error(`next_incident_reference failed: ${refError.message}`);
  }

  const { data, error } = await client
    .from("security_incidents")
    .insert({
      reference,
      fingerprint: finding.fingerprint,
      status: "open",
      severity: finding.severity,
      risk_score: finding.riskScore,
      category: finding.category,
      title: finding.title,
      summary: finding.detectionReason,
      service: finding.service,
      parent_incident_id: parentId,
      event_count: finding.eventCount,
      first_seen: new Date(finding.firstSeen).toISOString(),
      last_seen: new Date(finding.lastSeen).toISOString(),
      detection_reason: finding.detectionReason,
      runbook: finding.runbook ?? null,
    })
    .select("*")
    .single();

  if (error) {
    // 23505 = another pass opened this incident between our read and write.
    // That is the dedupe index doing its job, not an error.
    if (error.code === "23505") {
      const { data: existing } = await client
        .from("security_incidents")
        .select("*")
        .eq("fingerprint", finding.fingerprint)
        .in("status", LIVE_STATUSES as unknown as string[])
        .maybeSingle();
      return (existing as IncidentRow) ?? null;
    }
    if (isMissingTable(error.code)) return null;
    throw new Error(`incident insert failed: ${error.message}`);
  }
  return data as IncidentRow;
}

/** Attach the evidence rows to the incident so the detail page can show them. */
async function attachEvidence(
  client: SupabaseClient,
  incidentId: string,
  eventIds: number[],
): Promise<void> {
  if (!eventIds.length) return;
  const { error } = await client
    .from("security_events")
    .update({ incident_id: incidentId })
    .in("id", eventIds)
    .is("incident_id", null);
  if (error && !isMissingTable(error.code)) {
    console.error("[security-incidents] evidence attach failed:", error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The pass
// ─────────────────────────────────────────────────────────────────────────────

export interface ScanSummary {
  ranAt: string;
  eventsScanned: number;
  findings: number;
  incidentsOpened: number;
  incidentsUpdated: number;
  incidentsRecovered: number;
  notificationsSent: number;
  notificationsSuppressed: number;
  notificationsFailed: number;
  /** Human-readable, for the cron response and the admin console. */
  notes: string[];
}

/**
 * One detection + incident + notification pass.
 *
 * Order is deliberate:
 *   1. flush buffered events, so this pass sees what just happened;
 *   2. detect over the lookback window;
 *   3. correlate, so a narrative has a parent before children are notified;
 *   4. open/update incidents;
 *   5. notify, applying suppression against the LIVE set including anything
 *      opened in step 4;
 *   6. recover incidents that have gone quiet;
 *   7. check the alerting pipeline's own health.
 */
export async function runSecurityScan(now = Date.now()): Promise<ScanSummary> {
  const summary: ScanSummary = {
    ranAt: new Date(now).toISOString(),
    eventsScanned: 0,
    findings: 0,
    incidentsOpened: 0,
    incidentsUpdated: 0,
    incidentsRecovered: 0,
    notificationsSent: 0,
    notificationsSuppressed: 0,
    notificationsFailed: 0,
    notes: [],
  };

  const client = db();
  if (!client) {
    summary.notes.push("Supabase is not configured; scan skipped.");
    return summary;
  }

  // 1. Anything still sitting in the sink's buffer belongs in this pass.
  await flushSecurityEvents().catch(() => {});

  const sinceMs = now - detectionLookbackMinutes() * 60_000;
  const [events, liveIncidents, baselines] = await Promise.all([
    loadRecentEvents(client, sinceMs),
    loadLiveIncidents(client),
    loadBaselines(client),
  ]);
  summary.eventsScanned = events.length;

  if (!events.length && !liveIncidents.length) {
    summary.notes.push("No security events in the window and no live incidents.");
    return summary;
  }

  // 2 + 3.
  const findings = detect({ now, events, baselines });
  summary.findings = findings.length;
  const parents = correlate(findings);

  const byFingerprint = new Map(liveIncidents.map((i) => [i.fingerprint, i]));
  const alertSeverities = await lastAlertSeverities(client, liveIncidents);
  const touched: { incident: IncidentRow; finding: Finding; escalatedFrom: Severity | null }[] = [];

  // 4. Open or update.
  for (const finding of findings) {
    const existing = byFingerprint.get(finding.fingerprint);

    if (!existing) {
      const parentFingerprint = parents.get(finding.fingerprint);
      const parentId = parentFingerprint
        ? (byFingerprint.get(parentFingerprint)?.id ?? null)
        : null;
      const opened = await openIncident(client, finding, parentId);
      if (!opened) {
        summary.notes.push("Incident tables are absent (migration 0127 pending); nothing recorded.");
        return summary;
      }
      summary.incidentsOpened++;
      byFingerprint.set(finding.fingerprint, opened);
      await attachEvidence(client, opened.id, finding.eventIds);
      touched.push({ incident: opened, finding, escalatedFrom: null });
      continue;
    }

    const update = mergeFinding(
      {
        severity: existing.severity as Severity,
        riskScore: existing.risk_score,
        eventCount: existing.event_count,
        firstSeen: ms(existing.first_seen),
        lastSeen: ms(existing.last_seen),
        status: existing.status as IncidentStatus,
      },
      finding,
    );

    const { data: updated, error } = await client
      .from("security_incidents")
      .update({
        severity: update.severity,
        risk_score: update.riskScore,
        event_count: update.eventCount,
        status: update.status,
        first_seen: new Date(update.firstSeen).toISOString(),
        last_seen: new Date(update.lastSeen).toISOString(),
        detection_reason: finding.detectionReason,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      console.error("[security-incidents] update failed:", error.message);
      continue;
    }
    summary.incidentsUpdated++;
    const row = updated as IncidentRow;
    byFingerprint.set(finding.fingerprint, row);
    await attachEvidence(client, row.id, finding.eventIds);
    touched.push({
      incident: row,
      finding,
      escalatedFrom: update.escalated ? (existing.severity as Severity) : null,
    });
  }

  // 5. Notify. The live set now includes incidents opened above, so a child
  // opened in the same pass as its parent is still suppressed.
  const liveFingerprints = new Set(
    [...byFingerprint.values()].filter((i) => isLive(i.status as IncidentStatus)).map((i) => i.fingerprint),
  );

  for (const { incident, finding, escalatedFrom } of touched) {
    const snapshot = toSnapshot(incident, alertSeverities.get(incident.id) ?? null);
    const decision = decideAlert(snapshot, {
      now,
      suppressedBy: suppressorFor(incident.fingerprint, liveFingerprints),
    });

    if (!decision.notify) {
      summary.notificationsSuppressed++;
      summary.notes.push(`${incident.reference}: ${decision.reason}`);
      continue;
    }

    const result = await notifyIncident({
      id: incident.id,
      reference: incident.reference,
      severity: incident.severity as Severity,
      type: finding.type,
      title: incident.title,
      category: incident.category,
      service: incident.service,
      riskScore: incident.risk_score,
      status: incident.status,
      eventCount: incident.event_count,
      firstSeen: new Date(ms(incident.first_seen)),
      lastSeen: new Date(ms(incident.last_seen)),
      detectionReason: incident.detection_reason ?? finding.detectionReason,
      runbook: incident.runbook,
      escalatedFrom,
    });

    if (result.status === "sent") summary.notificationsSent++;
    else summary.notificationsFailed++;

    // Recorded even on failure: an incident we TRIED to announce must not be
    // re-announced on the next pass every five minutes. The delivery failure
    // is itself tracked, and the pipeline-degraded check below is what makes
    // a broken channel visible.
    //
    // The error is CHECKED, not swallowed. When this write silently failed
    // (the metadata column did not exist yet), alert_count stayed at 0 — which
    // means every subsequent pass would have read "never notified" and sent
    // the alert again, every five minutes. A dedupe system whose bookkeeping
    // write can fail quietly has no dedupe.
    const { error: bookkeepingError } = await client
      .from("security_incidents")
      .update({
        alert_count: incident.alert_count + 1,
        last_alert_at: new Date(now).toISOString(),
        metadata: { ...(incident.metadata ?? {}), lastAlertSeverity: incident.severity },
      })
      .eq("id", incident.id);
    if (bookkeepingError) {
      console.error(
        `[security-incidents] CRITICAL: could not record the notification for ${incident.reference} — it may be re-sent on the next pass: ${bookkeepingError.message}`,
      );
      summary.notes.push(
        `${incident.reference}: notification recorded FAILED (${bookkeepingError.message}) — duplicate alerts are possible until this is fixed`,
      );
    }
  }

  // 6. Recovery — for every live incident, including ones with no finding
  // this pass (which is exactly how recovery is detected).
  //
  // Before deciding, advance `last_seen` from the RAW events in the window,
  // not just from findings. A detector stops producing findings as soon as an
  // attack drops below its threshold, but the attack has not stopped — and
  // the recovery message says "no further events", so that had better be what
  // was measured. Without this, a burst-then-trickle attack was announced as
  // recovered while attempts were still arriving.
  //
  // This works because the detection lookback (60 min) is longer than the
  // recovery quiet period (30 min); if an operator inverts those, recovery
  // falls back to finding-driven timestamps, which is the older, weaker
  // behaviour rather than a wrong one.
  const latestEventPerFingerprint = new Map<string, number>();
  for (const e of events) {
    const seen = latestEventPerFingerprint.get(e.fingerprint) ?? 0;
    if (e.occurredAt > seen) latestEventPerFingerprint.set(e.fingerprint, e.occurredAt);
  }

  for (const incident of await loadLiveIncidents(client)) {
    const latest = latestEventPerFingerprint.get(incident.fingerprint) ?? 0;
    if (latest > ms(incident.last_seen)) {
      const lastSeen = new Date(latest).toISOString();
      await client.from("security_incidents").update({ last_seen: lastSeen }).eq("id", incident.id);
      incident.last_seen = lastSeen;
    }

    const snapshot = toSnapshot(incident, alertSeverities.get(incident.id) ?? null);
    const decision = decideRecovery(snapshot, { now });
    if (!decision.recovered) continue;

    await client
      .from("security_incidents")
      .update({
        status: "recovered",
        recovered_at: new Date(now).toISOString(),
        resolution: decision.reason,
        ...(decision.notify ? { recovery_alert_at: new Date(now).toISOString() } : {}),
      })
      .eq("id", incident.id);
    summary.incidentsRecovered++;

    if (decision.notify) {
      const result = await notifyRecovery({
        id: incident.id,
        reference: incident.reference,
        severity: incident.severity as Severity,
        type: incident.category,
        title: incident.title,
        eventCount: incident.event_count,
        firstSeen: new Date(ms(incident.first_seen)),
        recoveredAt: new Date(now),
      });
      if (result.status === "sent") summary.notificationsSent++;
      else summary.notificationsFailed++;
    }
  }

  // 7. Is the alerting pipeline itself healthy? (§41)
  await checkAlertPipeline(client, now, summary);

  return summary;
}

/**
 * Detect the case the brief calls out explicitly: events are being recorded
 * and incidents are opening, but nothing is reaching anyone.
 *
 * Reads `alert_deliveries` rather than security events, so a failure of the
 * notification path cannot hide itself behind the notification path.
 */
async function checkAlertPipeline(
  client: SupabaseClient,
  now: number,
  summary: ScanSummary,
): Promise<void> {
  const since = new Date(now - 3600_000).toISOString();
  const { data, error } = await client
    .from("alert_deliveries")
    .select("status")
    .gte("created_at", since)
    .limit(500);
  if (error || !data) return;

  const failures = data.filter((d) => (d as { status: string }).status === "failed").length;
  const sent = data.filter((d) => (d as { status: string }).status === "sent").length;
  if (failures < alertPipelineFailureThreshold() || sent > 0) return;

  summary.notes.push(
    `Alert pipeline degraded: ${failures} delivery failures and no successes in the last hour.`,
  );
  logSecurityEvent({
    type: "alert_pipeline_degraded",
    where: "lib/security/incidents",
    detail: `${failures} alert deliveries failed in the last hour with no successes`,
    count: failures,
    metadata: { failures, window: "1h" },
  });
  // Sent through the channel that is failing, on the chance it has recovered.
  // If it has not, the attempt is recorded like any other.
  await notifyPipelineDegraded({
    eventsAffected: summary.incidentsOpened + summary.incidentsUpdated,
    deliveryFailures: failures,
    fallback: "GitHub Actions failure email; /admin/security",
  });
}
