import { describe, expect, it } from "vitest";
import { deriveRateComparison, MIN_MEANINGFUL_PREVIOUS_BASE } from "./engagement-insights";

describe("engagement insight presentation math", () => {
  it("preserves the prior 20-event baseline threshold and one-decimal delta", () => {
    expect(MIN_MEANINGFUL_PREVIOUS_BASE).toBe(20);
    expect(deriveRateComparison({
      current: { pct: 17.26, comparable: true },
      previous: { pct: 12.11, comparable: true },
      previousDenominator: 20,
      compare: true,
      collecting: false,
    })).toEqual({ showPrevious: true, delta: 5.2 });
  });

  it("suppresses noisy, collecting, disabled, and incomparable comparisons", () => {
    const base = {
      current: { pct: 20, comparable: true },
      previous: { pct: 10, comparable: true },
      previousDenominator: 19,
      compare: true,
      collecting: false,
    };
    expect(deriveRateComparison(base)).toEqual({ showPrevious: false, delta: null });
    expect(deriveRateComparison({ ...base, previousDenominator: 20, collecting: true }).showPrevious).toBe(false);
    expect(deriveRateComparison({ ...base, previousDenominator: 20, compare: false }).showPrevious).toBe(false);
    expect(deriveRateComparison({
      ...base,
      previousDenominator: 20,
      current: { pct: 120, comparable: false },
    }).delta).toBeNull();
  });
});
