import { describe, expect, it } from "vitest";
import {
  analyticsBucketKey,
  analyticsBucketKeyFromDay,
  intersectAnalyticsInterval,
  parseAnalyticsBucket,
} from "./analytics-time";

describe("canonical analytics buckets", () => {
  it("parses exact Phnom Penh hour/day/week/month boundaries", () => {
    expect(parseAnalyticsBucket("2026-07-20T14:00", "hour")?.start.toISOString()).toBe("2026-07-20T07:00:00.000Z");
    expect(parseAnalyticsBucket("2026-07-20", "day")?.endExclusive.toISOString()).toBe("2026-07-20T17:00:00.000Z");
    expect(parseAnalyticsBucket("2026-07-20", "week")?.endExclusive.toISOString()).toBe("2026-07-26T17:00:00.000Z");
    expect(parseAnalyticsBucket("2026-07-01", "month")?.endExclusive.toISOString()).toBe("2026-07-31T17:00:00.000Z");
  });

  it("rejects non-canonical and impossible keys", () => {
    expect(parseAnalyticsBucket("2026-02-30", "day")).toBeNull();
    expect(parseAnalyticsBucket("2026-07-20T14:30", "hour")).toBeNull();
    expect(parseAnalyticsBucket("2026-07-21", "week")).toBeNull();
    expect(parseAnalyticsBucket("2026-07-02", "month")).toBeNull();
    expect(parseAnalyticsBucket("2026-07-20", "hour")).toBeNull();
  });

  it("generates canonical keys without browser-local parsing", () => {
    const instant = new Date("2026-07-20T07:45:00.000Z");
    expect(analyticsBucketKey(instant, "hour")).toBe("2026-07-20T14:00");
    expect(analyticsBucketKey(instant, "day")).toBe("2026-07-20");
    expect(analyticsBucketKey(instant, "week")).toBe("2026-07-20");
    expect(analyticsBucketKey(instant, "month")).toBe("2026-07-01");
    expect(analyticsBucketKeyFromDay("2026-07-26", "week")).toBe("2026-07-20");
  });

  it("clamps a bucket to the selected range and snapshot", () => {
    const bucket = parseAnalyticsBucket("2026-07-20", "week")!;
    const result = intersectAnalyticsInterval(
      bucket,
      new Date("2026-07-22T17:00:00.000Z"),
      new Date("2026-07-24T03:00:00.000Z"),
    );
    expect(result?.start.toISOString()).toBe("2026-07-22T17:00:00.000Z");
    expect(result?.endInclusive.toISOString()).toBe("2026-07-24T03:00:00.000Z");
  });
});
