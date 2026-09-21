import { describe, it, expect } from "vitest";
import { resolveSeoFlag } from "./seo-flags";

describe("resolveSeoFlag", () => {
  it("is on only for exactly \"on\"", () => {
    expect(resolveSeoFlag("on")).toBe(true);
    expect(resolveSeoFlag("ON")).toBe(true);
    expect(resolveSeoFlag("  on  ")).toBe(true);
  });

  it("is off for everything else, including the near-misses", () => {
    // A flag that can be switched on by accident is not a flag. "true" and
    // "1" are the two people reach for, and both must fail.
    for (const v of [undefined, "", " ", "off", "OFF", "true", "1", "yes", "enabled", "no", "0"]) {
      expect(resolveSeoFlag(v), `${JSON.stringify(v)} must not enable a flag`).toBe(false);
    }
  });
});
