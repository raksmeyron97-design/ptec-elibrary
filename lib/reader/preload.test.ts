import { describe, expect, it } from "vitest";
import { classifyMeasured, classifyNetwork, preloadPolicy, readNetworkHints } from "./preload";

describe("classifyNetwork", () => {
  it("defaults to normal without Network Information (Safari, Firefox)", () => {
    expect(classifyNetwork(undefined)).toBe("normal");
    expect(classifyNetwork({})).toBe("normal");
  });
  it("respects Save-Data above everything", () => {
    expect(classifyNetwork({ saveData: true, effectiveType: "4g", downlink: 50 })).toBe("slow");
    expect(classifyNetwork({ saveData: true }, { bytes: 10_000_000, durationMs: 100 })).toBe("slow");
  });
  it("maps effective types", () => {
    expect(classifyNetwork({ effectiveType: "slow-2g" })).toBe("slow");
    expect(classifyNetwork({ effectiveType: "2g" })).toBe("slow");
    expect(classifyNetwork({ effectiveType: "3g" })).toBe("normal");
    expect(classifyNetwork({ effectiveType: "4g" })).toBe("fast");
  });
  it("lets a measured downlink refine a 4g label", () => {
    expect(classifyNetwork({ effectiveType: "4g", downlink: 1 })).toBe("slow");
    expect(classifyNetwork({ effectiveType: "4g", downlink: 5 })).toBe("normal");
    expect(classifyNetwork({ effectiveType: "4g", downlink: 20 })).toBe("fast");
  });
  it("falls back to the measured first-page transfer where the API is absent", () => {
    // 2 MB in 8 s → 2 Mbps: normal. 2 MB in 1 s → 16 Mbps: fast. 200 KB in 2 s → 0.8 Mbps: slow.
    expect(classifyNetwork(undefined, { bytes: 2_000_000, durationMs: 7_000 })).toBe("normal");
    expect(classifyNetwork(undefined, { bytes: 2_000_000, durationMs: 1_000 })).toBe("fast");
    expect(classifyNetwork(undefined, { bytes: 200_000, durationMs: 2_000 })).toBe("slow");
    // Chromium's own hint wins over the measurement.
    expect(classifyNetwork({ effectiveType: "3g" }, { bytes: 2_000_000, durationMs: 1_000 })).toBe("normal");
  });
});

describe("classifyMeasured", () => {
  it("refuses to judge a sample too small to mean anything", () => {
    expect(classifyMeasured(undefined)).toBeUndefined();
    expect(classifyMeasured({ bytes: 3_000, durationMs: 300 })).toBeUndefined();
    expect(classifyMeasured({ bytes: 0, durationMs: 300 })).toBeUndefined();
    expect(classifyMeasured({ bytes: 500_000, durationMs: 0 })).toBeUndefined();
  });
  it("calls a very slow first page slow even with a small sample", () => {
    expect(classifyMeasured({ bytes: 3_000, durationMs: 9_000 })).toBe("slow");
  });
});

describe("preloadPolicy", () => {
  it("preloads NOTHING until page 1 has painted, on every tier", () => {
    for (const hints of [undefined, { effectiveType: "4g", downlink: 50 }, { saveData: true }]) {
      expect(preloadPolicy(hints, false)).toMatchObject({ overscan: 0, prefetchPages: 0, neighbours: 0 });
    }
  });
  it("keeps the default tier's window (4 pages) and stays within two pages of it", () => {
    expect(preloadPolicy(undefined, true)).toMatchObject({ tier: "normal", overscan: 2, prefetchPages: 4, neighbours: 2 });
    expect(preloadPolicy({ saveData: true }, true)).toMatchObject({ tier: "slow", overscan: 1, prefetchPages: 2, neighbours: 1 });
    expect(preloadPolicy({ effectiveType: "4g", downlink: 30 }, true)).toMatchObject({ tier: "fast", overscan: 3, prefetchPages: 6, neighbours: 2 });
  });
  it("never exceeds six extra pages — canvas memory, not bandwidth, is the ceiling", () => {
    expect(preloadPolicy({ effectiveType: "4g", downlink: 1000 }, true).prefetchPages).toBeLessThanOrEqual(6);
    expect(preloadPolicy(undefined, true, { bytes: 50_000_000, durationMs: 100 }).prefetchPages).toBeLessThanOrEqual(6);
  });
});

describe("readNetworkHints", () => {
  it("returns undefined where the API is missing and only well-typed fields otherwise", () => {
    expect(readNetworkHints({})).toBeUndefined();
    expect(readNetworkHints(undefined)).toBeUndefined();
    expect(readNetworkHints({ connection: { effectiveType: "3g", saveData: "yes", downlink: "fast" } })).toEqual({
      effectiveType: "3g",
      saveData: undefined,
      downlink: undefined,
    });
  });
});
