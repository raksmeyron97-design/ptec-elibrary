import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { insert } = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => ({ insert }) }),
}));

import { normalizeEvent } from "./model";
import { _drain, _resetSink, _sinkState, hashIp, securitySink, toRow } from "./sink";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  _resetSink();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54331";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  insert.mockResolvedValue({ error: null });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function ev(overrides: Parameters<typeof normalizeEvent>[0]) {
  return normalizeEvent(overrides);
}

describe("toRow", () => {
  it("maps the normalized event onto the 0127 column names", () => {
    const row = toRow(
      ev({
        type: "rate_limited",
        where: "/api/search",
        requestId: "req-1",
        at: Date.parse("2026-08-31T10:00:00Z"),
      }),
    );
    expect(row).toMatchObject({
      event_type: "rate_limited",
      severity: 4,
      service: "search",
      location: "/api/search",
      actor_type: "anonymous",
      result: "blocked",
      request_id: "req-1",
      fingerprint: "rate_limited:/api/search",
      event_count: 1,
      occurred_at: "2026-08-31T10:00:00.000Z",
    });
  });

  it("never writes a raw IP — only a keyed daily hash", () => {
    const row = toRow(ev({ type: "rate_limited", where: "/api/search", ip: "203.0.113.9" }));
    expect(row.ip_hash).toBeTruthy();
    expect(row.ip_hash).not.toContain("203.0.113.9");
    expect(JSON.stringify(row)).not.toContain("203.0.113.9");
  });

  it("drops a non-UUID actor id rather than sending it to a uuid column", () => {
    expect(toRow(ev({ type: "auth_forbidden", where: "x", userId: "not-a-uuid" })).actor_id).toBeNull();
    const real = "9f1c2b7e-1111-4222-8333-abcdefabcdef";
    expect(toRow(ev({ type: "auth_forbidden", where: "x", userId: real })).actor_id).toBe(real);
  });

  it("bounds every text column so a hostile caller cannot bloat a row", () => {
    const row = toRow(
      ev({
        type: "suspicious_input",
        where: "/x".repeat(500),
        target: "t".repeat(500),
        requestId: "r".repeat(500),
        detail: "d".repeat(5000),
      }),
    );
    expect(row.location.length).toBeLessThanOrEqual(200);
    expect(row.target!.length).toBeLessThanOrEqual(200);
    expect(row.request_id!.length).toBeLessThanOrEqual(100);
    expect(row.detail!.length).toBeLessThanOrEqual(300);
  });
});

describe("hashIp", () => {
  it("rotates daily so a visitor cannot be tracked across days", () => {
    const day1 = hashIp("203.0.113.9", new Date("2026-08-31T23:00:00Z"));
    const day2 = hashIp("203.0.113.9", new Date("2026-09-01T01:00:00Z"));
    expect(day1).toBeTruthy();
    expect(day1).not.toBe(day2);
  });

  it("is stable within a day so one attacker's events group", () => {
    expect(hashIp("203.0.113.9", new Date("2026-08-31T01:00:00Z"))).toBe(
      hashIp("203.0.113.9", new Date("2026-08-31T22:00:00Z")),
    );
  });

  it("returns null rather than something reversible when no secret is set", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(hashIp("203.0.113.9")).toBeNull();
  });

  it("returns null for an absent or unknown address", () => {
    expect(hashIp(undefined)).toBeNull();
    expect(hashIp("unknown")).toBeNull();
  });
});

describe("securitySink", () => {
  it("buffers low-severity events instead of writing one row per request", () => {
    securitySink(ev({ type: "rate_limited", where: "/api/search" }));
    securitySink(ev({ type: "rate_limited", where: "/api/search" }));
    expect(insert).not.toHaveBeenCalled();
    expect(_sinkState().buffered).toBe(2);
  });

  it("flushes a Sev 1/2 event immediately", async () => {
    securitySink(ev({ type: "cron_auth_failed", where: "/api/cron/cleanup" }));
    await _drain();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toHaveLength(1);
  });

  it("writes a whole batch in ONE insert", async () => {
    for (let i = 0; i < 30; i++) {
      securitySink(ev({ type: "rate_limited", where: "/api/search" }));
    }
    await _drain();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0].length).toBeGreaterThanOrEqual(25);
  });

  it("bounds memory under a sustained flood and reports what it dropped", async () => {
    insert.mockImplementation(() => new Promise(() => {})); // never resolves
    for (let i = 0; i < 3000; i++) {
      securitySink(ev({ type: "rate_limited", where: "/api/search" }));
    }
    expect(_sinkState().buffered).toBeLessThanOrEqual(1000);
    expect(_sinkState().dropped).toBeGreaterThan(0);
  });

  it("disables itself (once, quietly) when 0127 has not been applied", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    insert.mockResolvedValue({ error: { code: "42P01", message: "relation does not exist" } });

    securitySink(ev({ type: "cron_auth_failed", where: "/api/cron/cleanup" }));
    await _drain();
    expect(_sinkState().disabled).toBe(true);

    securitySink(ev({ type: "cron_auth_failed", where: "/api/cron/cleanup" }));
    await _drain();
    expect(insert).toHaveBeenCalledTimes(1); // no retry storm
    expect(warn).toHaveBeenCalledTimes(1); // no log spam
    warn.mockRestore();
  });

  it("retries a transient failure, then gives up without throwing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    insert.mockResolvedValue({ error: { code: "08006", message: "connection failure" } });

    securitySink(ev({ type: "cron_auth_failed", where: "/api/cron/cleanup" }));
    await expect(_drain()).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(3);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("never throws at the call site, whatever the client does", () => {
    insert.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => securitySink(ev({ type: "cron_auth_failed", where: "/x" }))).not.toThrow();
  });

  it("does nothing when Supabase is not configured", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    _resetSink();
    securitySink(ev({ type: "cron_auth_failed", where: "/x" }));
    await _drain();
    expect(insert).not.toHaveBeenCalled();
  });
});
