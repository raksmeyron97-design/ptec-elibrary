import { describe, it, expect } from "vitest";
import { splitDuration, progressState, progressPercent, STATUS_ORDER } from "./format";

describe("splitDuration", () => {
  it("returns null for null/zero/negative/non-finite", () => {
    expect(splitDuration(null)).toBeNull();
    expect(splitDuration(0)).toBeNull();
    expect(splitDuration(-5)).toBeNull();
    expect(splitDuration(Infinity)).toBeNull();
    expect(splitDuration(undefined)).toBeNull();
  });
  it("splits minutes into hours + minutes", () => {
    expect(splitDuration(45)).toEqual({ hours: 0, minutes: 45 });
    expect(splitDuration(60)).toEqual({ hours: 1, minutes: 0 });
    expect(splitDuration(90)).toEqual({ hours: 1, minutes: 30 });
    expect(splitDuration(605)).toEqual({ hours: 10, minutes: 5 });
  });
  it("rounds fractional minutes", () => {
    expect(splitDuration(90.4)).toEqual({ hours: 1, minutes: 30 });
  });
});

describe("progressState", () => {
  it("is not-started for null/empty progress", () => {
    expect(progressState(null)).toBe("not-started");
    expect(progressState({ completedSteps: 0, totalSteps: 0, completedAt: null })).toBe("not-started");
    expect(progressState({ completedSteps: 0, totalSteps: 5, completedAt: null })).toBe("not-started");
  });
  it("is in-progress when some but not all done", () => {
    expect(progressState({ completedSteps: 2, totalSteps: 5, completedAt: null })).toBe("in-progress");
  });
  it("is completed when all done or completedAt set", () => {
    expect(progressState({ completedSteps: 5, totalSteps: 5, completedAt: null })).toBe("completed");
    expect(progressState({ completedSteps: 3, totalSteps: 5, completedAt: "2026-01-01" })).toBe("completed");
  });
});

describe("progressPercent", () => {
  it("computes and clamps", () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(1, 4)).toBe(25);
    expect(progressPercent(3, 3)).toBe(100);
    expect(progressPercent(9, 4)).toBe(100);
  });
});

describe("STATUS_ORDER", () => {
  it("orders scheduled/draft before published, archived last", () => {
    expect(STATUS_ORDER.scheduled).toBeLessThan(STATUS_ORDER.published);
    expect(STATUS_ORDER.draft).toBeLessThan(STATUS_ORDER.published);
    expect(STATUS_ORDER.archived).toBeGreaterThan(STATUS_ORDER.published);
  });
});
