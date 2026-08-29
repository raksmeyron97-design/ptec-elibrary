import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));

import { rateLimit, _resetEmergencyLimiter } from "./rate-limit";

describe("rateLimit fail modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetEmergencyLimiter();
  });

  it("passes through the DB decision when the RPC succeeds", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect((await rateLimit("k", 5, 60_000)).success).toBe(true);
    rpc.mockResolvedValue({ data: false, error: null });
    expect((await rateLimit("k", 5, 60_000)).success).toBe(false);
  });

  it("failMode 'closed' denies on DB error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    const res = await rateLimit("k", 5, 60_000, { failMode: "closed" });
    expect(res.success).toBe(false);
  });

  it("failMode 'open' allows on DB error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    const res = await rateLimit("k", 5, 60_000, { failMode: "open" });
    expect(res.success).toBe(true);
  });

  it("default (emergency) enforces the limit in-memory during a DB outage", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    const limit = 3;
    for (let i = 0; i < limit; i++) {
      expect((await rateLimit("burst", limit, 60_000)).success).toBe(true);
    }
    // The (limit+1)th call within the window is denied — the outage did not
    // remove the limit.
    expect((await rateLimit("burst", limit, 60_000)).success).toBe(false);
  });

  it("emergency limiter keys are independent", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    expect((await rateLimit("a", 1, 60_000)).success).toBe(true);
    expect((await rateLimit("a", 1, 60_000)).success).toBe(false);
    expect((await rateLimit("b", 1, 60_000)).success).toBe(true);
  });

  it("emergency window slides — old hits expire", async () => {
    vi.useFakeTimers();
    try {
      rpc.mockResolvedValue({ data: null, error: { message: "down" } });
      expect((await rateLimit("w", 1, 1_000)).success).toBe(true);
      expect((await rateLimit("w", 1, 1_000)).success).toBe(false);
      vi.advanceTimersByTime(1_500);
      expect((await rateLimit("w", 1, 1_000)).success).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
