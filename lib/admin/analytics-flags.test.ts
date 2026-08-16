import { describe, expect, it } from "vitest";
import { resolveEngagementChartVersion } from "./analytics-flags";

describe("resolveEngagementChartVersion", () => {
  it.each(["production", "development", "test"])("forces V2 with on in %s", (nodeEnv) => {
    expect(resolveEngagementChartVersion({ flag: "on", nodeEnv })).toBe("v2");
  });

  it.each(["production", "development", "test"])("forces legacy with off in %s", (nodeEnv) => {
    expect(resolveEngagementChartVersion({ flag: "off", nodeEnv })).toBe("legacy");
  });

  it("defaults unset production to legacy", () => {
    expect(resolveEngagementChartVersion({ flag: undefined, nodeEnv: "production" })).toBe("legacy");
  });

  it.each(["development", "test"])("defaults unset %s to V2", (nodeEnv) => {
    expect(resolveEngagementChartVersion({ flag: undefined, nodeEnv })).toBe("v2");
  });

  it("fails closed to legacy for an invalid explicit value", () => {
    expect(resolveEngagementChartVersion({ flag: "maybe", nodeEnv: "development" })).toBe("legacy");
  });
});
