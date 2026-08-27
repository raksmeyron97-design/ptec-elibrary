import { describe, it, expect } from "vitest";
import { relativeTimeUnit, formatRelativeTime } from "./relative-time";

const NOW = new Date("2026-08-27T12:00:00Z").getTime();

describe("relativeTimeUnit", () => {
  it("buckets under a minute as justNow", () => {
    expect(relativeTimeUnit(new Date(NOW - 30_000).toISOString(), NOW)).toEqual({ unit: "justNow" });
  });

  it("buckets minutes", () => {
    expect(relativeTimeUnit(new Date(NOW - 18 * 60_000).toISOString(), NOW)).toEqual({ unit: "minutes", count: 18 });
  });

  it("buckets hours", () => {
    expect(relativeTimeUnit(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toEqual({ unit: "hours", count: 3 });
  });

  it("buckets days", () => {
    expect(relativeTimeUnit(new Date(NOW - 2 * 86_400_000).toISOString(), NOW)).toEqual({ unit: "days", count: 2 });
  });

  it("buckets weeks for anything 7+ days old", () => {
    expect(relativeTimeUnit(new Date(NOW - 15 * 86_400_000).toISOString(), NOW)).toEqual({ unit: "weeks", count: 2 });
  });

  it("never goes negative for a future timestamp (clock skew)", () => {
    expect(relativeTimeUnit(new Date(NOW + 60_000).toISOString(), NOW)).toEqual({ unit: "justNow" });
  });
});

describe("formatRelativeTime", () => {
  it("calls the translator with the right key and values", () => {
    const calls: Array<[string, Record<string, number> | undefined]> = [];
    const t = (key: string, values?: Record<string, number>) => {
      calls.push([key, values]);
      return `${key}:${JSON.stringify(values ?? {})}`;
    };
    formatRelativeTime(new Date(NOW - 18 * 60_000).toISOString(), t, NOW);
    expect(calls).toEqual([["minutesAgo", { minutes: 18 }]]);
  });
});
