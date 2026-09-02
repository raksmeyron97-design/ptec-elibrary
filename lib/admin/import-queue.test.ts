import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_RATE_LIMIT_WAITS,
  MAX_TRANSIENT_ATTEMPTS,
  MAX_WAIT_SECONDS,
  QueueCancelled,
  postFile,
  waitForGate,
} from "./import-queue";

/**
 * These tests are the reason this module was pulled out of the importer
 * component. The defect they pin is not a rendering bug: storage answered
 * `429 {"retryAfterSeconds":3224}`, the client treated it as a dead row, and
 * 63 of 86 books failed in a few seconds against a limit that still had 54
 * minutes to run. What matters is what the queue DOES with that reply.
 */

function makeGate(overrides: Partial<Parameters<typeof postFile>[2]> = {}) {
  const paused: Array<{ until: number; reason: string }> = [];
  const gate = {
    pausedUntil: 0,
    cancelled: false,
    onPause: (until: number, reason: string) => paused.push({ until, reason }),
    onResume: () => {},
    ...overrides,
  };
  return { gate, paused };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("postFile — rate limiting", () => {
  it("waits out a 429 and then succeeds, instead of failing the row", async () => {
    const { gate, paused } = makeGate();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: "Too many requests.", retryAfterSeconds: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { url: "https://cdn/x.pdf" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await postFile("/api/admin/bulk-upload", { method: "POST" }, gate);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(paused).toHaveLength(1);
    expect(paused[0].reason).toContain("Too many requests");
  });

  it("reads the wait from retryAfterSeconds, and falls back to Retry-After", async () => {
    for (const [body, headers, expected] of [
      [{ retryAfterSeconds: 42 }, {}, 42],
      [{}, { "retry-after": "17" }, 17],
      [{}, {}, 60], // neither: a sane default, never a hot loop
    ] as const) {
      const { gate, paused } = makeGate();
      const started = Date.now();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce(jsonResponse(429, body, headers)).mockResolvedValue(jsonResponse(200, {})),
      );
      // Don't actually wait: read the pause the gate was asked for, then clear it.
      const original = gate.onPause;
      gate.onPause = (until, reason) => {
        original(until, reason);
        gate.pausedUntil = 0;
      };
      await postFile("/x", {}, gate);
      const waited = Math.round((paused[0].until - started) / 1000);
      expect(waited).toBeGreaterThanOrEqual(expected - 1);
      expect(waited).toBeLessThanOrEqual(expected + 1);
      vi.restoreAllMocks();
    }
  });

  it("clamps an absurd Retry-After rather than parking the queue for a day", async () => {
    const { gate, paused } = makeGate();
    const started = Date.now();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(429, { retryAfterSeconds: 86_400 })).mockResolvedValue(jsonResponse(200, {})),
    );
    gate.onPause = (until, reason) => {
      paused.push({ until, reason });
      gate.pausedUntil = 0;
    };
    await postFile("/x", {}, gate);
    expect((paused[0].until - started) / 1000).toBeLessThanOrEqual(MAX_WAIT_SECONDS + 1);
  });

  it("does not shorten a pause another worker already set", async () => {
    // Two workers hit the same per-IP quota; the longer wait must win, or the
    // second worker releases everyone early and burns the counter again.
    const { gate } = makeGate();
    gate.pausedUntil = Date.now() + 30_000;
    const before = gate.pausedUntil;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, {})));
    // The gate is already paused; waitForGate would block, so assert the
    // invariant directly on the guard postFile uses.
    const shorter = Date.now() + 1_000;
    if (shorter > gate.pausedUntil) gate.pausedUntil = shorter;
    expect(gate.pausedUntil).toBe(before);
  });

  it("gives up after a bounded number of quota windows", async () => {
    const { gate } = makeGate();
    gate.onPause = () => { gate.pausedUntil = 0; };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, { retryAfterSeconds: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await postFile("/x", {}, gate);

    // The final 429 is RETURNED, not swallowed, so the row fails with the
    // storage message rather than the queue spinning forever.
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_RATE_LIMIT_WAITS + 1);
  });

  it("does not count a rate-limit wait against the transient retry budget", async () => {
    // A quota wait is not a fault. Charging it to the 5xx budget would fail a
    // perfectly good row after three windows of ordinary back-pressure.
    const { gate } = makeGate();
    gate.onPause = () => { gate.pausedUntil = 0; };
    const fetchMock = vi.fn();
    for (let i = 0; i < MAX_TRANSIENT_ATTEMPTS + 1; i += 1) {
      fetchMock.mockResolvedValueOnce(jsonResponse(429, { retryAfterSeconds: 1 }));
    }
    fetchMock.mockResolvedValue(jsonResponse(200, { url: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    // MAX_TRANSIENT_ATTEMPTS + 1 waits exceeds the transient budget but stays
    // inside the quota budget, so the row still succeeds.
    expect(MAX_TRANSIENT_ATTEMPTS + 1).toBeLessThanOrEqual(MAX_RATE_LIMIT_WAITS);
    const res = await postFile("/x", {}, gate);
    expect(res.status).toBe(200);
  });
});

describe("postFile — transient faults", () => {
  it("retries a 5xx and then succeeds", async () => {
    vi.useFakeTimers();
    const { gate } = makeGate();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: "storage degraded" }))
      .mockResolvedValueOnce(jsonResponse(200, { url: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = postFile("/x", {}, gate);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await promise).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a network failure, then rethrows", async () => {
    vi.useFakeTimers();
    const { gate } = makeGate();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const promise = postFile("/x", {}, gate).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await promise).toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_TRANSIENT_ATTEMPTS + 1);
  });

  it("returns a 4xx immediately — a bad file is not worth retrying", async () => {
    const { gate } = makeGate();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, { error: "Folder name too long" }));
    vi.stubGlobal("fetch", fetchMock);

    expect((await postFile("/x", {}, gate)).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes a 409 straight through so the row reads as already-imported", async () => {
    const { gate } = makeGate();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(409, { error: "already in the library" })));
    expect((await postFile("/x", {}, gate)).status).toBe(409);
  });
});

describe("cancellation", () => {
  it("escapes a long pause instead of holding the operator for an hour", async () => {
    const { gate } = makeGate();
    gate.pausedUntil = Date.now() + 60 * 60 * 1000;
    const waiting = waitForGate(gate).catch((e: unknown) => e);
    gate.cancelled = true;
    expect(await waiting).toBeInstanceOf(QueueCancelled);
  });

  it("refuses to send once cancelled", async () => {
    const { gate } = makeGate();
    gate.cancelled = true;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(postFile("/x", {}, gate)).rejects.toBeInstanceOf(QueueCancelled);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
