import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeDb, LIVE_FINGERPRINT_UNIQUE } from "./fake-postgrest";

// ── Doubles ─────────────────────────────────────────────────────────────────
// Telegram is the only real side effect; everything else runs for real.

const { fetchMock, dbHolder } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  dbHolder: { current: null as unknown as { from: unknown; rpc: unknown } },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => dbHolder.current,
}));

import { runSecurityScan } from "./incidents";

const NOW = Date.parse("2026-08-31T12:00:00.000Z");
const MIN = 60_000;

let seq = 1;

function securityEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: seq++,
    event_type: "login_failed",
    severity: 4,
    risk_score: 6,
    risk_reason: "login_failed base 6",
    service: "auth",
    location: "/admin/login",
    actor_type: "anonymous",
    actor_id: null,
    target: "account-1",
    result: "blocked",
    detail: null,
    request_id: "req-1",
    ip_hash: "client-a",
    event_count: 1,
    fingerprint: "auth_attack:admin",
    metadata: {},
    incident_id: null,
    occurred_at: new Date(NOW - 5 * MIN).toISOString(),
    ...overrides,
  };
}

function setupDb(seed: Record<string, Record<string, unknown>[]> = {}) {
  let refSeq = 0;
  const db = new FakeDb(seed, {
    uniques: [LIVE_FINGERPRINT_UNIQUE],
    rpc: {
      next_incident_reference: () => `SEC-20260831-${String(++refSeq).padStart(3, "0")}`,
    },
  });
  dbHolder.current = db as unknown as { from: unknown; rpc: unknown };
  return db;
}

/** Telegram messages actually sent this test. */
function sentMessages(): string[] {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes("api.telegram.org"))
    .map(([, init]) => JSON.parse((init as RequestInit).body as string).text as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  seq = 1;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54331";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.TELEGRAM_BOT_TOKEN = "111:test";
  process.env.TELEGRAM_CHAT_ID = "-100";
  process.env.NEXT_PUBLIC_SITE_URL = "https://library.ptec.edu.kh";
  delete process.env.SECURITY_ALERT_MAX_ATTEMPTS;
  fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "" });
  vi.stubGlobal("fetch", fetchMock);
});

// ─────────────────────────────────────────────────────────────────────────────

describe("login attack → event → incident → Telegram", () => {
  it("turns 12 failed logins into 1 incident and 1 message", async () => {
    const db = setupDb({
      security_events: Array.from({ length: 12 }, (_, i) =>
        securityEvent({ occurred_at: new Date(NOW - (i + 1) * MIN).toISOString() }),
      ),
    });

    const summary = await runSecurityScan(NOW);

    expect(summary.eventsScanned).toBe(12);
    expect(summary.incidentsOpened).toBe(1);
    expect(summary.notificationsSent).toBe(1);

    const incidents = db.rows("security_incidents");
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      fingerprint: "auth_attack:admin",
      status: "open",
      severity: 2,
      alert_count: 1,
    });
    expect(incidents[0].reference).toMatch(/^SEC-\d{8}-\d{3}$/);

    expect(sentMessages()).toHaveLength(1);
    expect(sentMessages()[0]).toContain("⚠️ SEV 2 — SECURITY INCIDENT");
    expect(sentMessages()[0]).toContain("12 failed sign-in attempts");
  });

  it("attaches the evidence to the incident so it can be investigated", async () => {
    const db = setupDb({
      security_events: Array.from({ length: 12 }, () => securityEvent()),
    });
    await runSecurityScan(NOW);
    const incidentId = db.rows("security_incidents")[0].id;
    const attached = db.rows("security_events").filter((e) => e.incident_id === incidentId);
    expect(attached).toHaveLength(12);
  });

  it("never puts the attacked account or a raw address in the message", async () => {
    setupDb({
      security_events: Array.from({ length: 12 }, () =>
        securityEvent({ target: "director@ptec.edu.kh" }),
      ),
    });
    await runSecurityScan(NOW);
    const message = sentMessages()[0];
    expect(message).not.toContain("director@ptec.edu.kh");
    expect(message).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });
});

describe("deduplication across passes", () => {
  it("five consecutive passes over a continuing attack send ONE message", async () => {
    const db = setupDb({
      security_events: Array.from({ length: 12 }, () => securityEvent()),
    });

    for (let pass = 0; pass < 5; pass++) {
      // Each pass the attack continues: two more failures.
      db.table("security_events").push(
        securityEvent({ occurred_at: new Date(NOW + pass * 5 * MIN).toISOString() }),
        securityEvent({ occurred_at: new Date(NOW + pass * 5 * MIN).toISOString() }),
      );
      await runSecurityScan(NOW + pass * 5 * MIN);
    }

    expect(db.rows("security_incidents")).toHaveLength(1);
    expect(sentMessages()).toHaveLength(1);
    expect(db.rows("security_incidents")[0].alert_count).toBe(1);
  });

  it("records every suppressed notification with a reason", async () => {
    const db = setupDb({ security_events: Array.from({ length: 12 }, () => securityEvent()) });
    await runSecurityScan(NOW);
    const second = await runSecurityScan(NOW + 5 * MIN);
    expect(second.notificationsSuppressed).toBe(1);
    expect(second.notes.join(" ")).toContain("Continuing incident");
    expect(db.rows("security_incidents")).toHaveLength(1);
  });

  it("updates the incident's counts as the attack grows, silently", async () => {
    const db = setupDb({ security_events: Array.from({ length: 12 }, () => securityEvent()) });
    await runSecurityScan(NOW);
    for (let i = 0; i < 40; i++) db.table("security_events").push(securityEvent());
    await runSecurityScan(NOW + 5 * MIN);

    expect(db.rows("security_incidents")[0].event_count).toBe(52);
    expect(sentMessages()).toHaveLength(1);
  });
});

describe("escalation", () => {
  it("re-alerts once when an incident becomes more severe", async () => {
    const db = setupDb({ security_events: Array.from({ length: 12 }, () => securityEvent()) });
    await runSecurityScan(NOW);
    expect(sentMessages()).toHaveLength(1);

    // Two hours later the attack is still running — and this time the
    // attacker gets in. The incident escalates from Sev 2 to Sev 1, and we
    // are past the alert cooldown, so it may speak again.
    const later = NOW + 2 * 3600_000;
    for (let i = 0; i < 10; i++) {
      db.table("security_events").push(
        securityEvent({ occurred_at: new Date(later - (i + 2) * MIN).toISOString() }),
      );
    }
    db.table("security_events").push(
      securityEvent({
        event_type: "login_succeeded",
        result: "success",
        occurred_at: new Date(later - MIN).toISOString(),
      }),
    );
    await runSecurityScan(later);

    expect(sentMessages()).toHaveLength(2);
    expect(sentMessages()[1]).toContain("SECURITY INCIDENT ESCALATED");
    expect(sentMessages()[1]).toContain("Sev 2 → Sev 1");
    expect(db.rows("security_incidents")[0].severity).toBe(1);
  });

  it("holds an escalation that lands inside the cooldown", async () => {
    const db = setupDb({ security_events: Array.from({ length: 12 }, () => securityEvent()) });
    await runSecurityScan(NOW);
    db.table("security_events").push(
      securityEvent({ event_type: "login_succeeded", result: "success", occurred_at: new Date(NOW + MIN).toISOString() }),
    );
    await runSecurityScan(NOW + 5 * MIN);
    expect(sentMessages()).toHaveLength(1);
  });
});

describe("recovery", () => {
  it("sends exactly one recovery message after the quiet period", async () => {
    const db = setupDb({ security_events: Array.from({ length: 12 }, () => securityEvent()) });
    await runSecurityScan(NOW);

    // The attack stops. Two passes later, past the quiet period.
    await runSecurityScan(NOW + 40 * MIN);
    await runSecurityScan(NOW + 80 * MIN);

    const recoveries = sentMessages().filter((m) => m.includes("RECOVERED"));
    expect(recoveries).toHaveLength(1);
    expect(recoveries[0]).toContain("✅ SECURITY INCIDENT RECOVERED");
    expect(db.rows("security_incidents")[0].status).toBe("recovered");
  });

  it("does not declare recovery while events keep arriving below the detector threshold", async () => {
    // Regression: an attack that bursts and then trickles stops producing
    // FINDINGS (it falls under the 15-minute threshold) but has not stopped.
    // Recovery is measured from raw events for exactly this case — otherwise
    // the "no further events" message would be untrue.
    const db = setupDb({ security_events: Array.from({ length: 12 }, () => securityEvent()) });
    await runSecurityScan(NOW);
    db.table("security_events").push(securityEvent({ occurred_at: new Date(NOW + 35 * MIN).toISOString() }));
    await runSecurityScan(NOW + 40 * MIN);

    expect(sentMessages().some((m) => m.includes("RECOVERED"))).toBe(false);
    expect(db.rows("security_incidents")[0].status).toBe("open");
  });

  it("a recurrence AFTER recovery opens a new incident, not a resurrection", async () => {
    const db = setupDb({ security_events: Array.from({ length: 12 }, () => securityEvent()) });
    await runSecurityScan(NOW);
    await runSecurityScan(NOW + 40 * MIN); // recovers

    const later = NOW + 10 * 3600_000;
    for (let i = 0; i < 12; i++) {
      db.table("security_events").push(securityEvent({ occurred_at: new Date(later - MIN).toISOString() }));
    }
    await runSecurityScan(later);

    const incidents = db.rows("security_incidents");
    expect(incidents).toHaveLength(2);
    expect(incidents[0].reference).not.toBe(incidents[1].reference);
    expect(incidents.filter((i) => i.status === "open")).toHaveLength(1);
  });
});

describe("severity routing", () => {
  it("keeps a Sev 3 incident off Telegram but still records it", async () => {
    const db = setupDb({
      security_events: Array.from({ length: 30 }, (_, i) =>
        securityEvent({
          event_type: "enumeration",
          location: `/probe-${i}`,
          service: "app",
          fingerprint: "enumeration:/",
          target: null,
        }),
      ),
    });
    const summary = await runSecurityScan(NOW);

    expect(db.rows("security_incidents")).toHaveLength(1);
    expect(db.rows("security_incidents")[0].severity).toBe(3);
    expect(sentMessages()).toHaveLength(0);
    expect(summary.notes.join(" ")).toContain("below the notification threshold");
  });

  it("pages immediately for a super_admin grant", async () => {
    const db = setupDb({
      security_events: [
        securityEvent({
          event_type: "privilege_change",
          location: "setUserRole",
          service: "admin",
          result: "success",
          target: "u-9",
          fingerprint: "privilege:u-9",
          metadata: { from: "reader", to: "super_admin", targetUserId: "u-9" },
        }),
      ],
    });
    await runSecurityScan(NOW);
    expect(db.rows("security_incidents")[0].severity).toBe(1);
    expect(sentMessages()[0]).toContain("🚨 SEV 1");
    expect(sentMessages()[0]).toContain("docs/RUNBOOKS.md §I9");
  });
});

describe("Telegram failure (brief §30)", () => {
  it("keeps the incident when delivery fails, and does not retry forever", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "upstream" });
    const db = setupDb({ security_events: Array.from({ length: 12 }, () => securityEvent()) });

    const summary = await runSecurityScan(NOW);

    expect(summary.notificationsFailed).toBe(1);
    expect(db.rows("security_incidents")).toHaveLength(1);
    const delivery = db.rows("alert_deliveries")[0];
    expect(delivery).toMatchObject({ channel: "telegram", kind: "alert", status: "failed", error_class: "upstream_500" });
  });

  it("does not re-announce on every subsequent pass after a failure", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "" });
    const db = setupDb({ security_events: Array.from({ length: 12 }, () => securityEvent()) });
    await runSecurityScan(NOW);
    const attemptsAfterFirst = fetchMock.mock.calls.length;
    await runSecurityScan(NOW + 5 * MIN);
    await runSecurityScan(NOW + 10 * MIN);
    expect(fetchMock.mock.calls.length).toBe(attemptsAfterFirst);
    expect(db.rows("security_incidents")[0].alert_count).toBe(1);
  });

  it("does not retry a 400 — that will be a 400 forever", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => "" });
    setupDb({ security_events: Array.from({ length: 12 }, () => securityEvent()) });
    await runSecurityScan(NOW);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("telegram"))).toHaveLength(1);
  });

  it("records a skipped delivery when no credentials are configured", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const db = setupDb({ security_events: Array.from({ length: 12 }, () => securityEvent()) });
    await runSecurityScan(NOW);
    expect(db.rows("security_incidents")).toHaveLength(1);
    expect(db.rows("alert_deliveries")[0]).toMatchObject({ status: "skipped", error_class: "no_credentials" });
    expect(sentMessages()).toHaveLength(0);
  });

  it("reports the pipeline as degraded when deliveries fail with no successes", async () => {
    // One attempt per delivery: this test is about the meta-alert, not the
    // retry backoff (covered above), and three retries x two sends would
    // spend the whole test budget sleeping.
    process.env.SECURITY_ALERT_MAX_ATTEMPTS = "1";
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "" });
    const db = setupDb({
      security_events: Array.from({ length: 12 }, () => securityEvent()),
      alert_deliveries: Array.from({ length: 4 }, (_, i) => ({
        id: 900 + i,
        channel: "telegram",
        kind: "alert",
        status: "failed",
        created_at: new Date(NOW - 10 * MIN).toISOString(),
      })),
    });
    const summary = await runSecurityScan(NOW);
    expect(summary.notes.join(" ")).toContain("Alert pipeline degraded");
    expect(db.rows("alert_deliveries").some((d) => d.kind === "alert" && d.status === "failed")).toBe(true);
  });
});

describe("degradation", () => {
  it("does nothing harmful when migration 0127 has not been applied", async () => {
    const db = new FakeDb({}, { missingTables: ["security_events", "security_incidents", "alert_deliveries", "security_baselines"] });
    dbHolder.current = db as unknown as { from: unknown; rpc: unknown };
    const summary = await runSecurityScan(NOW);
    expect(summary.eventsScanned).toBe(0);
    expect(summary.incidentsOpened).toBe(0);
    expect(sentMessages()).toHaveLength(0);
  });

  it("skips cleanly when Supabase is not configured", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const summary = await runSecurityScan(NOW);
    expect(summary.notes.join(" ")).toContain("Supabase is not configured");
  });

  it("reports an empty window without touching Telegram", async () => {
    setupDb({ security_events: [] });
    const summary = await runSecurityScan(NOW);
    expect(summary.findings).toBe(0);
    expect(sentMessages()).toHaveLength(0);
  });
});

describe("concurrency", () => {
  it("two overlapping passes cannot open two incidents for one attack", async () => {
    const db = setupDb({ security_events: Array.from({ length: 12 }, () => securityEvent()) });
    await Promise.all([runSecurityScan(NOW), runSecurityScan(NOW)]);
    // The partial unique index (mirrored in the fake) is what guarantees this.
    expect(db.rows("security_incidents")).toHaveLength(1);
  });
});
