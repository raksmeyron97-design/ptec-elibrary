/**
 * Incident policy — the state machine, the deduplication rules, and the single
 * decision "should anyone be told about this right now?".
 *
 * PURE ON PURPOSE. Every rule that decides whether a human's phone buzzes is
 * testable without a database, a network, or a Telegram token. The server-only
 * orchestration lives in `lib/security/incidents.ts`; it holds no policy.
 *
 * ── The problem this exists to solve ────────────────────────────────────────
 * Before this, `.github/workflows/uptime.yml` sent a Sev 1 Telegram message on
 * every failing run, every 15 minutes, with no recovery message: a three-hour
 * outage produced twelve identical 🚨 messages and no "it's back". That is the
 * failure the brief's §11 names, and it was live in production
 * (docs/SECURITY_MONITORING_AUDIT.md §1).
 *
 * The rule, in one line: FIRST detection alerts, continuing events update the
 * incident silently, ESCALATION may alert once more, and recovery alerts
 * exactly once.
 */

import {
  alertCooldownSeconds,
  alertingEnabled,
  incidentRecoveryQuietSeconds,
  telegramMinSeverity,
} from "./config";
import type { Severity } from "./model";

// ─────────────────────────────────────────────────────────────────────────────
// State machine
// ─────────────────────────────────────────────────────────────────────────────

export type IncidentStatus =
  | "detected"
  | "open"
  | "acknowledged"
  | "investigating"
  | "mitigating"
  | "recovered"
  | "closed";

export const INCIDENT_STATUSES: readonly IncidentStatus[] = [
  "detected",
  "open",
  "acknowledged",
  "investigating",
  "mitigating",
  "recovered",
  "closed",
];

/** An incident in one of these states is still happening. */
export const LIVE_STATUSES: readonly IncidentStatus[] = [
  "detected",
  "open",
  "acknowledged",
  "investigating",
  "mitigating",
];

export function isLive(status: IncidentStatus): boolean {
  return LIVE_STATUSES.includes(status);
}

/**
 * Allowed transitions.
 *
 * Two deliberate shapes:
 *  • Any live state may jump straight to `recovered` — the detector observing
 *    quiet does not care whether a human got as far as acknowledging.
 *  • `recovered` → `open` exists so a recurrence inside the same incident's
 *    life is possible, but the ENGINE does not use it: a recurrence after
 *    recovery opens a NEW incident (that is what the partial unique index in
 *    0127 enforces). It is here for an operator who reopens by hand.
 */
const TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  detected: ["open", "acknowledged", "recovered", "closed"],
  open: ["acknowledged", "investigating", "mitigating", "recovered", "closed"],
  acknowledged: ["investigating", "mitigating", "recovered", "closed"],
  investigating: ["mitigating", "acknowledged", "recovered", "closed"],
  mitigating: ["investigating", "recovered", "closed"],
  recovered: ["closed", "open"],
  closed: [],
};

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Transitions an operator may perform from the dashboard. */
export type OperatorAction = "acknowledge" | "investigate" | "mitigate" | "resolve" | "silence";

const ACTION_TARGET: Record<Exclude<OperatorAction, "silence">, IncidentStatus> = {
  acknowledge: "acknowledged",
  investigate: "investigating",
  mitigate: "mitigating",
  resolve: "closed",
};

export function statusForAction(action: Exclude<OperatorAction, "silence">): IncidentStatus {
  return ACTION_TARGET[action];
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshots
// ─────────────────────────────────────────────────────────────────────────────

/** Everything the policy needs to know about an existing incident. */
export interface IncidentSnapshot {
  id: string;
  reference: string;
  fingerprint: string;
  status: IncidentStatus;
  severity: Severity;
  riskScore: number;
  eventCount: number;
  firstSeen: number;
  lastSeen: number;
  /** Epoch ms of the last outbound notification, or null if never notified. */
  lastAlertAt: number | null;
  alertCount: number;
  /** Severity at the time of the last notification — escalation compares to this. */
  lastAlertSeverity: Severity | null;
  /** Operator mute; alerts are suppressed while this is in the future. */
  silencedUntil: number | null;
  /** Set once, when the single recovery notification goes out. */
  recoveryAlertAt: number | null;
}

export type NotificationKind = "alert" | "escalation" | "recovery";

export interface AlertDecision {
  notify: boolean;
  kind: NotificationKind | null;
  /**
   * Why — shown in the admin UI's delivery log and recorded in
   * `alert_deliveries.status`. An operator asking "why wasn't I told?" gets a
   * sentence, not a shrug.
   */
  reason: string;
  /** How the attempt is recorded when `notify` is false. */
  outcome: "sent" | "suppressed" | "skipped";
}

const NO = (reason: string, outcome: AlertDecision["outcome"] = "suppressed"): AlertDecision => ({
  notify: false,
  kind: null,
  reason,
  outcome,
});

export interface AlertContext {
  now: number;
  /** Fingerprint of a live parent incident that suppresses this one, if any. */
  suppressedBy?: string | null;
  /** Overrides for tests / for a caller that already resolved config. */
  minSeverity?: number;
  cooldownSeconds?: number;
  enabled?: boolean;
}

/**
 * Should this incident produce an outbound notification right now?
 *
 * Order matters, and it is the order an operator would reason in:
 *   1. Is alerting on at all?
 *   2. Did an operator silence this incident?
 *   3. Is a parent incident already explaining it?
 *   4. Is it severe enough for the channel?
 *   5. Is this the first time? → alert
 *   6. Has it got worse since we last spoke? → escalate, but not too often
 *   7. Otherwise → this is a continuing incident. Say nothing.
 */
export function decideAlert(incident: IncidentSnapshot, ctx: AlertContext): AlertDecision {
  const enabled = ctx.enabled ?? alertingEnabled();
  if (!enabled) return NO("Outbound security alerting is disabled (SECURITY_ALERTING_ENABLED)", "skipped");

  if (incident.silencedUntil && incident.silencedUntil > ctx.now) {
    const minutes = Math.ceil((incident.silencedUntil - ctx.now) / 60_000);
    return NO(`Silenced by an operator for another ${minutes} min`);
  }

  if (ctx.suppressedBy) {
    return NO(`Suppressed: the parent incident ${ctx.suppressedBy} already explains this`);
  }

  const minSeverity = ctx.minSeverity ?? telegramMinSeverity();
  if (incident.severity > minSeverity) {
    return NO(
      `Sev ${incident.severity} is below the notification threshold (Sev ${minSeverity} and above) — dashboard only`,
      "skipped",
    );
  }

  if (incident.alertCount === 0) {
    return {
      notify: true,
      kind: "alert",
      reason: "First detection of this incident",
      outcome: "sent",
    };
  }

  // Escalation: strictly more severe than when we last spoke. Equal severity
  // with a higher risk score is NOT an escalation — risk drifts upward with
  // volume on every pass, and alerting on that would reproduce the every-tick
  // spam this whole module exists to stop.
  const worse =
    incident.lastAlertSeverity !== null && incident.severity < incident.lastAlertSeverity;
  if (worse) {
    const cooldown = (ctx.cooldownSeconds ?? alertCooldownSeconds()) * 1000;
    const since = incident.lastAlertAt === null ? Infinity : ctx.now - incident.lastAlertAt;
    if (since < cooldown) {
      const wait = Math.ceil((cooldown - since) / 60_000);
      return NO(
        `Escalated to Sev ${incident.severity}, but the last alert was ${Math.round(since / 60_000)} min ago — holding ${wait} min for the cooldown`,
      );
    }
    return {
      notify: true,
      kind: "escalation",
      reason: `Escalated from Sev ${incident.lastAlertSeverity} to Sev ${incident.severity}`,
      outcome: "sent",
    };
  }

  return NO(
    `Continuing incident, already notified ${incident.alertCount}× — the incident is being updated silently`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery
// ─────────────────────────────────────────────────────────────────────────────

export interface RecoveryDecision {
  recovered: boolean;
  notify: boolean;
  reason: string;
}

/**
 * Has this incident gone quiet long enough to call it recovered?
 *
 * "Quiet" is the only evidence available: the detectors observe attacks, not
 * the absence of attackers. So the language everywhere downstream is
 * "no further events for N minutes", never "the threat was neutralised" —
 * we did not necessarily do anything, and saying we did would be theatre (§42).
 *
 * The recovery notification is sent at most once, and only for an incident
 * somebody was actually told about: recovering a Sev 3 nobody was paged for
 * would be an alert with no matching alarm.
 */
export function decideRecovery(
  incident: IncidentSnapshot,
  ctx: { now: number; quietSeconds?: number },
): RecoveryDecision {
  if (!isLive(incident.status)) {
    return { recovered: false, notify: false, reason: `Already ${incident.status}` };
  }

  const quiet = (ctx.quietSeconds ?? incidentRecoveryQuietSeconds()) * 1000;
  const silentFor = ctx.now - incident.lastSeen;
  if (silentFor < quiet) {
    return {
      recovered: false,
      notify: false,
      reason: `Last event ${Math.round(silentFor / 60_000)} min ago; needs ${Math.round(quiet / 60_000)} min of quiet`,
    };
  }

  if (incident.recoveryAlertAt !== null) {
    return { recovered: true, notify: false, reason: "Recovery already announced" };
  }

  return {
    recovered: true,
    notify: incident.alertCount > 0,
    reason:
      incident.alertCount > 0
        ? `No further events for ${Math.round(silentFor / 60_000)} min`
        : `No further events for ${Math.round(silentFor / 60_000)} min; never alerted, so no recovery message`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Merging a finding into an incident
// ─────────────────────────────────────────────────────────────────────────────

export interface IncidentUpdate {
  severity: Severity;
  riskScore: number;
  eventCount: number;
  lastSeen: number;
  firstSeen: number;
  status: IncidentStatus;
  /** True when the merge made the incident more severe than it was. */
  escalated: boolean;
}

/**
 * Fold a new finding into an existing incident.
 *
 * Severity and risk only ever move UP within one incident's life. An attack
 * that briefly quietens has not become less serious — it has become quieter,
 * and if it stays quiet the recovery path is what closes it. Letting severity
 * fall would also make the escalation test oscillate and re-alert.
 */
export function mergeFinding(
  incident: Pick<IncidentSnapshot, "severity" | "riskScore" | "eventCount" | "firstSeen" | "lastSeen" | "status">,
  finding: { severity: Severity; riskScore: number; eventCount: number; firstSeen: number; lastSeen: number },
): IncidentUpdate {
  const severity = Math.min(incident.severity, finding.severity) as Severity;
  const status: IncidentStatus = incident.status === "detected" ? "open" : incident.status;
  return {
    severity,
    riskScore: Math.max(incident.riskScore, finding.riskScore),
    // The finding recounts the whole window, so it REPLACES rather than adds —
    // summing would inflate the count on every overlapping pass.
    eventCount: Math.max(incident.eventCount, finding.eventCount),
    firstSeen: Math.min(incident.firstSeen, finding.firstSeen),
    lastSeen: Math.max(incident.lastSeen, finding.lastSeen),
    status,
    escalated: severity < incident.severity,
  };
}
