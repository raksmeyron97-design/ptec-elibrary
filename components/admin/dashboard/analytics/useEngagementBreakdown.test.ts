import { describe, expect, it } from "vitest";
import { BoundedBreakdownCache } from "./useEngagementBreakdown";
import type { EngagementBreakdownResponse } from "@/lib/admin/engagement-breakdown";

const response = (total: number): EngagementBreakdownResponse => ({
  metric: "views",
  grain: "day",
  scope: {
    bucket: "2026-07-20",
    start: "2026-07-19T17:00:00.000Z",
    end: "2026-07-20T16:59:59.999Z",
    aggregationScope: "fullBucket",
  },
  total,
  partial: false,
  rowsScanned: total,
  ranking: { status: "metric", basis: "views", items: [] },
  unattributed: 0,
});

describe("BoundedBreakdownCache", () => {
  it("evicts least-recently-used entries at the named bound", () => {
    const cache = new BoundedBreakdownCache(2, 1_000, () => 0);
    cache.set("a", response(1));
    cache.set("b", response(2));
    expect(cache.get("a")?.total).toBe(1); // refresh a
    cache.set("c", response(3));
    expect(cache.get("b")).toBeNull();
    expect(cache.get("a")?.total).toBe(1);
    expect(cache.get("c")?.total).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("expires entries after the configured TTL", () => {
    let now = 0;
    const cache = new BoundedBreakdownCache(2, 100, () => now);
    cache.set("a", response(1));
    now = 99;
    expect(cache.get("a")).not.toBeNull();
    now = 100;
    expect(cache.get("a")).toBeNull();
  });
});
