import { describe, expect, it } from "vitest";
import {
  ANALYTICS_LIMITS,
  engagementBreakdownCacheKey,
  engagementBreakdownUrl,
  parseEngagementBreakdownRequest,
  type EngagementBreakdownRequest,
} from "./engagement-breakdown";

const NOW = new Date("2026-07-22T12:00:00.000Z");
const base = {
  metric: "views",
  grain: "day",
  bucket: "2026-07-22",
  range: "30d",
  contentType: "all",
  contentLanguage: "all",
  asOf: "2026-07-22T11:00:00.000Z",
};

function params(over: Record<string, string> = {}) {
  return new URLSearchParams({ ...base, ...over });
}

describe("parseEngagementBreakdownRequest", () => {
  it("accepts every canonical grain", () => {
    expect(parseEngagementBreakdownRequest(params({ grain: "hour", bucket: "2026-07-22T14:00" }), NOW).ok).toBe(true);
    expect(parseEngagementBreakdownRequest(params({ grain: "day", bucket: "2026-07-22" }), NOW).ok).toBe(true);
    expect(parseEngagementBreakdownRequest(params({ grain: "week", bucket: "2026-07-20" }), NOW).ok).toBe(true);
    expect(parseEngagementBreakdownRequest(params({ grain: "month", bucket: "2026-07-01" }), NOW).ok).toBe(true);
  });

  it("rejects mismatched bucket/grain and invalid enums", () => {
    expect(parseEngagementBreakdownRequest(params({ grain: "hour", bucket: "2026-07-22" }), NOW)).toMatchObject({ ok: false, error: "invalid_bucket" });
    expect(parseEngagementBreakdownRequest(params({ metric: "searches" }), NOW)).toMatchObject({ ok: false, error: "invalid_metric" });
    expect(parseEngagementBreakdownRequest(params({ contentLanguage: "fr" }), NOW)).toMatchObject({ ok: false, error: "invalid_content_language" });
  });

  it("validates custom ranges against the named maximum", () => {
    const ok = params({ range: "custom", from: "2026-01-01", to: "2026-12-31" });
    expect(parseEngagementBreakdownRequest(ok, NOW).ok).toBe(true);
    const tooLong = params({ range: "custom", from: "2025-01-01", to: "2026-12-31" });
    expect(parseEngagementBreakdownRequest(tooLong, NOW)).toMatchObject({ ok: false, error: "invalid_custom_range" });
    expect(ANALYTICS_LIMITS.maxCustomRangeDays).toBe(365);
  });

  it("rejects malformed and materially future snapshots but tolerates clock skew", () => {
    expect(parseEngagementBreakdownRequest(params({ asOf: "yesterday" }), NOW)).toMatchObject({ ok: false, error: "invalid_as_of" });
    expect(parseEngagementBreakdownRequest(params({ asOf: "2026-07-22T12:06:00.000Z" }), NOW)).toMatchObject({ ok: false, error: "future_as_of" });
    expect(parseEngagementBreakdownRequest(params({ asOf: "2026-07-22T12:04:59.000Z" }), NOW).ok).toBe(true);
  });

  it("sanitizes Khmer department text without requiring a UI locale", () => {
    const result = parseEngagementBreakdownRequest(params({ department: "  ស្ថិតិ\u0000  " }), NOW);
    expect(result).toMatchObject({ ok: true, value: { department: "ស្ថិតិ", contentLanguage: "all" } });
    expect(params().has("uiLocale")).toBe(false);
  });
});

describe("canonical request serialization", () => {
  const request: EngagementBreakdownRequest = {
    metric: "readerOpens",
    grain: "week",
    bucket: "2026-07-20",
    range: "custom",
    from: "2026-07-01",
    to: "2026-07-31",
    contentType: "book",
    department: "Science",
    contentLanguage: "en",
    asOf: "2026-07-22T11:00:00.000Z",
  };

  it("uses stable ordering for URLs and cache keys", () => {
    const key = engagementBreakdownCacheKey(request);
    expect(key).toContain("metric=readerOpens&grain=week&bucket=2026-07-20&range=custom");
    expect(engagementBreakdownUrl(request)).toBe(`/api/admin/dashboard/engagement-breakdown?${key}`);
  });

  it("isolates cache entries by metric, grain, filters and snapshot", () => {
    expect(engagementBreakdownCacheKey({ ...request, metric: "downloads" })).not.toBe(engagementBreakdownCacheKey(request));
    expect(engagementBreakdownCacheKey({ ...request, grain: "month", bucket: "2026-07-01" })).not.toBe(engagementBreakdownCacheKey(request));
    expect(engagementBreakdownCacheKey({ ...request, contentLanguage: "km" })).not.toBe(engagementBreakdownCacheKey(request));
    expect(engagementBreakdownCacheKey({ ...request, asOf: "2026-07-22T11:01:00.000Z" })).not.toBe(engagementBreakdownCacheKey(request));
  });
});
