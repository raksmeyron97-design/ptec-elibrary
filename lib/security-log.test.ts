import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  logSecurityEvent,
  registerSecuritySink,
  getSecuritySinkHealth,
  _getSecuritySink,
  _resetSpikeDetector,
  _resetSecuritySinkRegistry,
  type NormalizedSecurityEvent,
} from "./security-log";

function loggedEvents(warn: ReturnType<typeof vi.spyOn>): Array<{ type: string }> {
  return warn.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])));
}

describe("security-log spike detector", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetSpikeDetector();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    vi.useRealTimers();
  });

  it("emits every event as a structured JSON line", () => {
    logSecurityEvent({ type: "auth_forbidden", where: "/x", userId: "u1" });
    const events = loggedEvents(warn);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ evt: "security", type: "auth_forbidden", where: "/x" });
  });

  it("escalates once when one type crosses the threshold within the window", () => {
    for (let i = 0; i < 25; i++) {
      logSecurityEvent({ type: "rate_limited", where: "/api/x" });
    }
    const events = loggedEvents(warn);
    const spikes = events.filter((e) => e.type === "security_spike");
    // Exactly one escalation for the burst — not one per event past threshold.
    expect(spikes).toHaveLength(1);
    expect(events.filter((e) => e.type === "rate_limited")).toHaveLength(25);
  });

  it("counts types independently — mixed events below threshold do not spike", () => {
    for (let i = 0; i < 15; i++) {
      logSecurityEvent({ type: "rate_limited", where: "/a" });
      logSecurityEvent({ type: "auth_forbidden", where: "/b" });
    }
    // 15 each: neither type reached the default threshold of 20.
    const spikes = loggedEvents(warn).filter((e) => e.type === "security_spike");
    expect(spikes).toHaveLength(0);
  });

  it("re-arms after the window rolls over", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 20; i++) logSecurityEvent({ type: "rate_limited", where: "/a" });
    vi.advanceTimersByTime(61_000);
    for (let i = 0; i < 20; i++) logSecurityEvent({ type: "rate_limited", where: "/a" });
    const spikes = loggedEvents(warn).filter((e) => e.type === "security_spike");
    expect(spikes).toHaveLength(2);
  });

  it("never counts security_spike itself (no self-amplification)", () => {
    for (let i = 0; i < 100; i++) logSecurityEvent({ type: "rate_limited", where: "/a" });
    const spikes = loggedEvents(warn).filter((e) => e.type === "security_spike");
    expect(spikes).toHaveLength(1);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Durable sink delivery.
//
// The regression these protect is not hypothetical and was not caught by any
// existing test: `security_events` held ZERO rows in production while the
// emitter logged normally, registration reported success and nothing threw.
// The cause was that `let sink = null` at module scope is not a singleton —
// Next's webpack build emitted this module into FOUR server chunks, each with
// its own copy, so `instrumentation.ts` registered into one and every route
// read another. The registry is process-global now, and these assert both the
// delivery contract and the diagnostic that names that failure class.
// ─────────────────────────────────────────────────────────────────────────────

describe("security-log durable sink", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetSpikeDetector();
    _resetSecuritySinkRegistry();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    registerSecuritySink(null);
    _resetSecuritySinkRegistry();
    warn.mockRestore();
    error.mockRestore();
  });

  it("hands every event to an installed sink", () => {
    const seen: NormalizedSecurityEvent[] = [];
    registerSecuritySink((e) => seen.push(e));

    logSecurityEvent({ type: "cron_auth_failed", where: "/api/cron/cleanup" });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: "cron_auth_failed", where: "/api/cron/cleanup" });
    expect(getSecuritySinkHealth()).toMatchObject({ installed: true, emitted: 1, delivered: 1, undelivered: 0 });
  });

  it("survives a sink that is not installed, and SAYS SO — once", () => {
    // The production failure, exactly: events emitted, nothing persisted.
    logSecurityEvent({ type: "cron_auth_failed", where: "/api/cron/cleanup" });
    logSecurityEvent({ type: "cron_auth_failed", where: "/api/cron/cleanup" });
    logSecurityEvent({ type: "cron_auth_failed", where: "/api/cron/cleanup" });

    const health = getSecuritySinkHealth();
    expect(health).toMatchObject({ installed: false, emitted: 3, delivered: 0, undelivered: 3 });

    // Loud enough to find, quiet enough to survive an incident: one warning
    // for the state, not one per event.
    const shouts = error.mock.calls.filter((c: unknown[]) => String(c[0]).includes("NO DURABLE SINK INSTALLED"));
    expect(shouts).toHaveLength(1);

    // The console line is still the fallback record for all three.
    expect(loggedEvents(warn).filter((e) => e.type === "cron_auth_failed")).toHaveLength(3);
  });

  it("counts a throwing sink as undelivered rather than reporting a write that did not happen", () => {
    registerSecuritySink(() => {
      throw new Error("database unreachable");
    });

    // The request must still complete — logging never throws into a caller.
    expect(() => logSecurityEvent({ type: "auth_forbidden", where: "/admin" })).not.toThrow();

    expect(getSecuritySinkHealth()).toMatchObject({ installed: true, emitted: 1, delivered: 0, undelivered: 1 });
    // And the stdout record survives, which is the whole point of the fallback.
    expect(loggedEvents(warn).some((e) => e.type === "auth_forbidden")).toBe(true);
  });

  it("registering twice replaces the sink rather than fanning out", () => {
    const a: string[] = [];
    const b: string[] = [];
    registerSecuritySink((e) => a.push(e.type));
    registerSecuritySink((e) => b.push(e.type));

    logSecurityEvent({ type: "rate_limited", where: "/api/x" });

    expect(a).toHaveLength(0);
    expect(b).toEqual(["rate_limited"]);
  });

  it("registering null removes the sink and resumes stdout-only", () => {
    registerSecuritySink(() => {});
    expect(_getSecuritySink()).not.toBeNull();
    registerSecuritySink(null);
    expect(_getSecuritySink()).toBeNull();
    expect(getSecuritySinkHealth().installed).toBe(false);
  });

  it("resolves the registry through the cross-realm symbol, not a module binding", () => {
    // THIS is the test that catches the production failure class. A second
    // copy of this module — which is what webpack actually produced — reaches
    // the same registry object, so a sink registered by `instrumentation.ts`
    // is visible to a route handler that loaded a different copy.
    //
    // Asserting on `Symbol.for` is asserting on the mechanism: a refactor back
    // to a module-local `let sink` passes every other test in this file and
    // fails this one.
    const registry = (globalThis as Record<symbol, unknown>)[
      Symbol.for("ptec.security-log.registry")
    ] as { sink: unknown; instances: Set<string> } | undefined;

    expect(registry).toBeDefined();
    expect(registry!.instances.size).toBeGreaterThanOrEqual(1);

    const seen: string[] = [];
    registerSecuritySink((e) => seen.push(e.type));
    // Read the sink back off the GLOBAL registry rather than the module, the
    // way a duplicated copy would have to.
    expect(typeof registry!.sink).toBe("function");
    (registry!.sink as (e: NormalizedSecurityEvent) => void)({
      type: "auth_forbidden",
    } as NormalizedSecurityEvent);
    expect(seen).toEqual(["auth_forbidden"]);
  });

  it("reports how many copies of the emitter module exist", () => {
    // 1 is healthy. More than 1 is the bug that made this fix necessary, and
    // the admin console renders it as a warning rather than leaving an
    // operator to infer it from an empty table.
    expect(getSecuritySinkHealth().moduleInstances).toBeGreaterThanOrEqual(1);
  });

  it("never persists a secret handed to it by mistake", () => {
    const seen: NormalizedSecurityEvent[] = [];
    registerSecuritySink((e) => seen.push(e));

    logSecurityEvent({
      type: "cron_auth_failed",
      where: "/api/cron/cleanup",
      detail: "authorization: Bearer sk_live_NOT_A_REAL_KEY_000000 password=hunter2",
      metadata: { authorization: "Bearer sk_live_NOT_A_REAL_KEY_000000", attempts: 3 },
    });

    const serialized = JSON.stringify(seen[0]);
    expect(serialized).not.toContain("sk_live_NOT_A_REAL_KEY_000000");
    expect(serialized).not.toContain("hunter2");
    // Non-sensitive context survives — this is redaction, not deletion.
    expect(serialized).toContain("3");

    // And the stdout fallback is held to the same standard, because it is the
    // record whenever the sink is the thing that is broken.
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sk_live_NOT_A_REAL_KEY_000000");
  });
});
