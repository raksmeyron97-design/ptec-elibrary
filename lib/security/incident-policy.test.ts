import { describe, it, expect } from "vitest";
import {
  canTransition,
  decideAlert,
  decideRecovery,
  INCIDENT_STATUSES,
  isLive,
  mergeFinding,
  statusForAction,
  type IncidentSnapshot,
  type IncidentStatus,
} from "./incident-policy";
import type { Severity } from "./model";

const NOW = Date.parse("2026-08-31T12:00:00.000Z");
const MIN = 60_000;

function incident(overrides: Partial<IncidentSnapshot> = {}): IncidentSnapshot {
  return {
    id: "i-1",
    reference: "SEC-20260831-001",
    fingerprint: "auth_attack:admin",
    status: "open",
    severity: 2,
    riskScore: 70,
    eventCount: 30,
    firstSeen: NOW - 20 * MIN,
    lastSeen: NOW - MIN,
    lastAlertAt: null,
    alertCount: 0,
    lastAlertSeverity: null,
    silencedUntil: null,
    recoveryAlertAt: null,
    ...overrides,
  };
}

const CTX = { now: NOW, enabled: true, minSeverity: 2, cooldownSeconds: 3600 };

// ─────────────────────────────────────────────────────────────────────────────
// The property the whole system is judged on.
// ─────────────────────────────────────────────────────────────────────────────

describe("deduplication — the uptime.yml defect must be impossible", () => {
  it("a repeating incident produces exactly ONE alert, then a recovery", () => {
    // Simulates the real failure: a probe firing every 15 minutes for 3 hours.
    let state = incident({ severity: 1, fingerprint: "site_down:production", lastSeen: NOW });
    const sent: string[] = [];

    for (let tick = 0; tick < 12; tick++) {
      const now = NOW + tick * 15 * MIN;
      state = { ...state, lastSeen: now, eventCount: state.eventCount + 1 };
      const decision = decideAlert(state, { ...CTX, now, minSeverity: 2 });
      if (decision.notify) {
        sent.push(decision.kind!);
        state = { ...state, alertCount: state.alertCount + 1, lastAlertAt: now, lastAlertSeverity: state.severity };
      }
    }

    // Twelve failing probes. One message.
    expect(sent).toEqual(["alert"]);

    // Then it recovers, once.
    const afterQuiet = NOW + 12 * 15 * MIN + 40 * MIN;
    const recovery = decideRecovery(state, { now: afterQuiet, quietSeconds: 1800 });
    expect(recovery).toMatchObject({ recovered: true, notify: true });

    state = { ...state, status: "recovered", recoveryAlertAt: afterQuiet };
    expect(decideRecovery(state, { now: afterQuiet + 60 * MIN }).notify).toBe(false);
  });

  it("continuing events say so, rather than saying nothing", () => {
    const decision = decideAlert(
      incident({ alertCount: 1, lastAlertAt: NOW - 5 * MIN, lastAlertSeverity: 2 }),
      CTX,
    );
    expect(decision.notify).toBe(false);
    expect(decision.reason).toContain("Continuing incident");
    expect(decision.reason).toContain("already notified 1×");
  });
});

describe("decideAlert", () => {
  it("alerts on first detection", () => {
    const d = decideAlert(incident(), CTX);
    expect(d).toMatchObject({ notify: true, kind: "alert", outcome: "sent" });
  });

  it("keeps Sev 3 and Sev 4 off the channel — dashboard only", () => {
    for (const severity of [3, 4] as Severity[]) {
      const d = decideAlert(incident({ severity }), CTX);
      expect(d.notify).toBe(false);
      expect(d.outcome).toBe("skipped");
      expect(d.reason).toContain("below the notification threshold");
    }
  });

  it("respects an operator silence and says how long is left", () => {
    const d = decideAlert(incident({ silencedUntil: NOW + 45 * MIN }), CTX);
    expect(d.notify).toBe(false);
    expect(d.reason).toContain("45 min");
  });

  it("stops silencing once the window passes", () => {
    expect(decideAlert(incident({ silencedUntil: NOW - MIN }), CTX).notify).toBe(true);
  });

  it("suppresses a child when a parent incident already explains it", () => {
    const d = decideAlert(incident(), { ...CTX, suppressedBy: "site_down:production" });
    expect(d.notify).toBe(false);
    expect(d.reason).toContain("site_down:production");
  });

  it("honours the global off switch and records it as skipped, not suppressed", () => {
    const d = decideAlert(incident(), { ...CTX, enabled: false });
    expect(d).toMatchObject({ notify: false, outcome: "skipped" });
    expect(d.reason).toContain("SECURITY_ALERTING_ENABLED");
  });

  it("re-alerts when an incident genuinely escalates", () => {
    const d = decideAlert(
      incident({ severity: 1, alertCount: 1, lastAlertSeverity: 2, lastAlertAt: NOW - 2 * 3600_000 }),
      CTX,
    );
    expect(d).toMatchObject({ notify: true, kind: "escalation" });
    expect(d.reason).toBe("Escalated from Sev 2 to Sev 1");
  });

  it("holds an escalation inside the cooldown rather than firing twice", () => {
    const d = decideAlert(
      incident({ severity: 1, alertCount: 1, lastAlertSeverity: 2, lastAlertAt: NOW - 10 * MIN }),
      CTX,
    );
    expect(d.notify).toBe(false);
    expect(d.reason).toContain("holding");
  });

  it("does NOT treat rising risk at the same severity as an escalation", () => {
    // Risk drifts up with volume on every pass; alerting on that would
    // reproduce the every-tick spam this module exists to stop.
    const d = decideAlert(
      incident({ severity: 2, riskScore: 99, alertCount: 1, lastAlertSeverity: 2, lastAlertAt: NOW - 5 * 3600_000 }),
      CTX,
    );
    expect(d.notify).toBe(false);
  });

  it("never notifies twice for the same state, however often it is asked", () => {
    let state = incident();
    let sends = 0;
    for (let i = 0; i < 50; i++) {
      const d = decideAlert(state, { ...CTX, now: NOW + i * MIN });
      if (d.notify) {
        sends++;
        state = { ...state, alertCount: state.alertCount + 1, lastAlertAt: NOW + i * MIN, lastAlertSeverity: state.severity };
      }
    }
    expect(sends).toBe(1);
  });

  it("always explains itself", () => {
    const cases: IncidentSnapshot[] = [
      incident(),
      incident({ severity: 4 }),
      incident({ silencedUntil: NOW + MIN }),
      incident({ alertCount: 3, lastAlertSeverity: 2, lastAlertAt: NOW - MIN }),
    ];
    for (const c of cases) expect(decideAlert(c, CTX).reason.length).toBeGreaterThan(10);
  });
});

describe("decideRecovery", () => {
  it("needs the full quiet period before declaring recovery", () => {
    const d = decideRecovery(incident({ lastSeen: NOW - 5 * MIN }), { now: NOW, quietSeconds: 1800 });
    expect(d.recovered).toBe(false);
    expect(d.reason).toContain("needs 30 min of quiet");
  });

  it("recovers after the quiet period and notifies once", () => {
    const d = decideRecovery(
      incident({ lastSeen: NOW - 40 * MIN, alertCount: 1 }),
      { now: NOW, quietSeconds: 1800 },
    );
    expect(d).toMatchObject({ recovered: true, notify: true });
  });

  it("does not announce recovery for an incident nobody was alerted about", () => {
    const d = decideRecovery(
      incident({ lastSeen: NOW - 40 * MIN, alertCount: 0 }),
      { now: NOW, quietSeconds: 1800 },
    );
    expect(d.recovered).toBe(true);
    expect(d.notify).toBe(false);
    expect(d.reason).toContain("never alerted");
  });

  it("never announces recovery twice", () => {
    const d = decideRecovery(
      incident({ lastSeen: NOW - 40 * MIN, alertCount: 1, recoveryAlertAt: NOW - 10 * MIN }),
      { now: NOW, quietSeconds: 1800 },
    );
    expect(d.notify).toBe(false);
    expect(d.reason).toBe("Recovery already announced");
  });

  it("ignores an incident that is already closed", () => {
    const d = decideRecovery(incident({ status: "closed", lastSeen: NOW - 10 * 3600_000 }), { now: NOW });
    expect(d.recovered).toBe(false);
  });

  it("describes recovery as quiet, never as a threat neutralised (§42)", () => {
    const d = decideRecovery(incident({ lastSeen: NOW - 40 * MIN, alertCount: 1 }), { now: NOW, quietSeconds: 1800 });
    expect(d.reason).toContain("No further events");
    expect(d.reason).not.toMatch(/neutrali|prevented|stopped the attack/i);
  });
});

describe("state machine", () => {
  it("walks the documented lifecycle", () => {
    expect(canTransition("detected", "open")).toBe(true);
    expect(canTransition("open", "acknowledged")).toBe(true);
    expect(canTransition("acknowledged", "investigating")).toBe(true);
    expect(canTransition("investigating", "mitigating")).toBe(true);
    expect(canTransition("mitigating", "recovered")).toBe(true);
    expect(canTransition("recovered", "closed")).toBe(true);
  });

  it("lets any live state jump straight to recovered", () => {
    for (const s of ["detected", "open", "acknowledged", "investigating", "mitigating"] as IncidentStatus[]) {
      expect(canTransition(s, "recovered"), s).toBe(true);
    }
  });

  it("treats closed as terminal", () => {
    for (const s of INCIDENT_STATUSES) expect(canTransition("closed", s)).toBe(false);
  });

  it("does not allow skipping backwards into detected", () => {
    for (const s of INCIDENT_STATUSES) expect(canTransition(s, "detected")).toBe(false);
  });

  it("classifies live vs settled states", () => {
    expect(isLive("open")).toBe(true);
    expect(isLive("mitigating")).toBe(true);
    expect(isLive("recovered")).toBe(false);
    expect(isLive("closed")).toBe(false);
  });

  it("maps operator actions to statuses", () => {
    expect(statusForAction("acknowledge")).toBe("acknowledged");
    expect(statusForAction("resolve")).toBe("closed");
  });
});

describe("mergeFinding", () => {
  const base = { severity: 3 as Severity, riskScore: 40, eventCount: 10, firstSeen: NOW - 10 * MIN, lastSeen: NOW - 5 * MIN, status: "open" as IncidentStatus };

  it("moves severity up and flags the escalation", () => {
    const u = mergeFinding(base, { severity: 1, riskScore: 90, eventCount: 50, firstSeen: NOW - MIN, lastSeen: NOW });
    expect(u.severity).toBe(1);
    expect(u.escalated).toBe(true);
  });

  it("never moves severity back down — a quieter attack is not a milder one", () => {
    const u = mergeFinding({ ...base, severity: 1 }, { severity: 4, riskScore: 10, eventCount: 2, firstSeen: NOW, lastSeen: NOW });
    expect(u.severity).toBe(1);
    expect(u.escalated).toBe(false);
  });

  it("replaces the event count rather than summing it", () => {
    // Passes overlap by design (60 min lookback, 5 min schedule); summing
    // would multiply the count by 12 every hour.
    const u = mergeFinding(base, { severity: 3, riskScore: 40, eventCount: 12, firstSeen: NOW - 10 * MIN, lastSeen: NOW });
    expect(u.eventCount).toBe(12);
  });

  it("widens the time span in both directions", () => {
    const u = mergeFinding(base, { severity: 3, riskScore: 40, eventCount: 12, firstSeen: NOW - 30 * MIN, lastSeen: NOW });
    expect(u.firstSeen).toBe(NOW - 30 * MIN);
    expect(u.lastSeen).toBe(NOW);
  });

  it("promotes a freshly detected incident to open", () => {
    const u = mergeFinding({ ...base, status: "detected" }, { severity: 3, riskScore: 40, eventCount: 11, firstSeen: NOW, lastSeen: NOW });
    expect(u.status).toBe("open");
  });

  it("does not undo an operator's acknowledgement", () => {
    const u = mergeFinding({ ...base, status: "acknowledged" }, { severity: 3, riskScore: 40, eventCount: 11, firstSeen: NOW, lastSeen: NOW });
    expect(u.status).toBe("acknowledged");
  });
});
