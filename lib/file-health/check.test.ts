import { describe, expect, it } from "vitest";
import {
  BASE_RETRY_DELAY_MS,
  MAX_PROBE_ATTEMPTS,
  MAX_RETRY_DELAY_MS,
  decideProbe,
  isTransientStatus,
  retryDelayMs,
  shouldFallBackToRangedGet,
} from "./check";

describe("file-health probe classification", () => {
  it("a 2xx settles as ok", () => {
    expect(decideProbe({ httpStatus: 200, attempt: 1 })).toEqual({
      kind: "settle",
      verdict: { status: "ok", httpStatus: 200 },
    });
    expect(decideProbe({ httpStatus: 206, attempt: 1 })).toEqual({
      kind: "settle",
      verdict: { status: "ok", httpStatus: 206 },
    });
  });

  it("a definite refusal settles as broken on the first attempt", () => {
    for (const status of [400, 401, 403, 404, 410]) {
      expect(decideProbe({ httpStatus: status, attempt: 1 })).toEqual({
        kind: "settle",
        verdict: { status: "broken", httpStatus: status },
      });
    }
  });

  it("HTTP 429 is NEVER broken — retried, then unknown with the status kept", () => {
    // The production false alarm: ~100 rows written as broken/429 by one
    // anonymous sweep. A rate limit says nothing about the file.
    expect(decideProbe({ httpStatus: 429, attempt: 1 }).kind).toBe("retry");
    expect(decideProbe({ httpStatus: 429, attempt: MAX_PROBE_ATTEMPTS - 1 }).kind).toBe("retry");
    expect(decideProbe({ httpStatus: 429, attempt: MAX_PROBE_ATTEMPTS })).toEqual({
      kind: "settle",
      verdict: { status: "unknown", httpStatus: 429 },
    });
  });

  it("5xx, 408 and no-response are transient, not broken", () => {
    for (const status of [500, 502, 503, 504, 408, null]) {
      const first = decideProbe({ httpStatus: status, attempt: 1 });
      expect(first.kind).toBe("retry");
      const last = decideProbe({ httpStatus: status, attempt: MAX_PROBE_ATTEMPTS });
      expect(last).toEqual({ kind: "settle", verdict: { status: "unknown", httpStatus: status } });
    }
    expect(isTransientStatus(404)).toBe(false);
    expect(isTransientStatus(429)).toBe(true);
  });

  it("honours Retry-After in seconds, clamped to the ceiling", () => {
    expect(decideProbe({ httpStatus: 429, attempt: 1, retryAfter: "7" })).toEqual({
      kind: "retry",
      delayMs: 7_000,
    });
    expect(retryDelayMs(1, "3600")).toBe(MAX_RETRY_DELAY_MS);
    expect(retryDelayMs(1, "0")).toBe(BASE_RETRY_DELAY_MS);
  });

  it("honours an HTTP-date Retry-After relative to now", () => {
    const now = Date.parse("2026-09-07T00:00:00Z");
    const at = new Date(now + 5_000).toUTCString();
    expect(retryDelayMs(1, at, now)).toBe(5_000);
  });

  it("backs off exponentially without Retry-After", () => {
    expect(retryDelayMs(1)).toBe(1_000);
    expect(retryDelayMs(2)).toBe(2_000);
    expect(retryDelayMs(3)).toBe(4_000);
    expect(retryDelayMs(1, "not-a-header")).toBe(1_000);
  });

  it("falls back to a ranged GET only for 405/501", () => {
    expect(shouldFallBackToRangedGet(405)).toBe(true);
    expect(shouldFallBackToRangedGet(501)).toBe(true);
    expect(shouldFallBackToRangedGet(404)).toBe(false);
    expect(shouldFallBackToRangedGet(429)).toBe(false);
  });
});
