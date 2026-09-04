import { describe, expect, it } from "vitest";
import { classifyNetwork, preloadPolicy, readNetworkHints } from "./preload";

describe("classifyNetwork", () => {
  it("defaults to normal without Network Information (Safari, Firefox)", () => {
    expect(classifyNetwork(undefined)).toBe("normal");
    expect(classifyNetwork({})).toBe("normal");
  });
  it("respects Save-Data above everything", () => {
    expect(classifyNetwork({ saveData: true, effectiveType: "4g", downlink: 50 })).toBe("slow");
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
});

describe("preloadPolicy", () => {
  it("preloads NOTHING until page 1 has painted, on every tier", () => {
    for (const hints of [undefined, { effectiveType: "4g", downlink: 50 }, { saveData: true }]) {
      expect(preloadPolicy(hints, false)).toMatchObject({ overscan: 0, neighbours: 0 });
    }
  });
  it("keeps today's constant (2) as the default and stays within one page of it", () => {
    expect(preloadPolicy(undefined, true)).toMatchObject({ tier: "normal", overscan: 2, neighbours: 2 });
    expect(preloadPolicy({ saveData: true }, true)).toMatchObject({ tier: "slow", overscan: 1, neighbours: 1 });
    expect(preloadPolicy({ effectiveType: "4g", downlink: 30 }, true)).toMatchObject({ tier: "fast", overscan: 3, neighbours: 2 });
  });
  it("never exceeds three rows per side — canvas memory, not bandwidth, is the ceiling", () => {
    expect(preloadPolicy({ effectiveType: "4g", downlink: 1000 }, true).overscan).toBeLessThanOrEqual(3);
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
