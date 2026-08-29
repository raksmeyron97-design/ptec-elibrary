import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logSecurityEvent, _resetSpikeDetector } from "./security-log";

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
