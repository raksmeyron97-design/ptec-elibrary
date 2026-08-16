import { describe, expect, it } from "vitest";
import {
  aggregateEngagementBreakdown,
  fetchBoundedBreakdownRows,
  type BreakdownContent,
  type BreakdownEvent,
} from "./engagement-breakdown.server";
import type { EngagementBreakdownRequest } from "./engagement-breakdown";

const request: EngagementBreakdownRequest = {
  metric: "views",
  grain: "day",
  bucket: "2026-07-20",
  range: "30d",
  contentType: "all",
  department: null,
  contentLanguage: "all",
  asOf: "2026-07-22T12:00:00.000Z",
};
const scope = {
  start: new Date("2026-07-19T17:00:00.000Z"),
  endInclusive: new Date("2026-07-20T16:59:59.999Z"),
};
const content: BreakdownContent[] = [
  { id: "b1", type: "book", title: "Book one", department: "Science", language: "en" },
  { id: "b2", type: "book", title: "សៀវភៅពីរ", department: "Arts", language: "km" },
];
const row = (over: Partial<BreakdownEvent> = {}): BreakdownEvent => ({
  ts: "2026-07-20T01:00:00.000Z",
  contentType: "book",
  contentId: "b1",
  userId: "reader-1",
  sessionHash: null,
  ...over,
});

describe("fetchBoundedBreakdownRows", () => {
  it("paginates until the first short page", async () => {
    const source = [1, 2, 3];
    const calls: Array<[number, number]> = [];
    const result = await fetchBoundedBreakdownRows(
      async (from, to) => {
        calls.push([from, to]);
        return { data: source.slice(from, to + 1), error: null };
      },
      { pageSize: 2, maxPages: 4 },
    );
    expect(result).toEqual({ rows: source, partial: false, pages: 2 });
    expect(calls).toEqual([[0, 1], [2, 3]]);
  });

  it("marks a full final allowed page partial rather than inventing completeness", async () => {
    const result = await fetchBoundedBreakdownRows(
      async (from, to) => ({ data: [0, 1, 2, 3].slice(from, to + 1), error: null }),
      { pageSize: 2, maxPages: 2 },
    );
    expect(result).toEqual({ rows: [0, 1, 2, 3], partial: true, pages: 2 });
  });
});

describe("aggregateEngagementBreakdown", () => {
  it.each(["views", "readerOpens", "downloads"] as const)(
    "returns a metric-specific %s ranking without a views fallback",
    (metric) => {
      const result = aggregateEngagementBreakdown({
        request: { ...request, metric },
        scope,
        content,
        rows: [row(), row({ userId: "reader-2" }), row({ contentId: "b2", userId: "staff" })],
        internalUserIds: new Set(["staff"]),
      });
      expect(result.total).toBe(2);
      expect(result.ranking).toMatchObject({ status: "metric", basis: metric });
      expect(result.ranking.items[0]).toMatchObject({ id: "b1", count: 2 });
    },
  );

  it("applies content filters before totals and rankings", () => {
    const result = aggregateEngagementBreakdown({
      request: { ...request, contentLanguage: "km" },
      scope,
      content,
      rows: [row(), row({ contentId: "b2", userId: "reader-2" })],
    });
    expect(result.total).toBe(1);
    expect(result.ranking.items).toEqual([
      expect.objectContaining({ id: "b2", title: "សៀវភៅពីរ", count: 1 }),
    ]);
  });

  it("uses the peak constituent day for weekly visitors and their ranking", () => {
    const result = aggregateEngagementBreakdown({
      request: { ...request, metric: "visitors", grain: "week", bucket: "2026-07-20" },
      scope: {
        start: new Date("2026-07-19T17:00:00.000Z"),
        endInclusive: new Date("2026-07-26T16:59:59.999Z"),
      },
      content,
      rows: [
        row({ ts: "2026-07-20T01:00:00.000Z", userId: "a" }),
        row({ ts: "2026-07-20T02:00:00.000Z", userId: "b" }),
        row({ ts: "2026-07-20T03:00:00.000Z", userId: "a" }),
        row({ ts: "2026-07-21T01:00:00.000Z", userId: "c", contentId: "b2" }),
      ],
    });
    expect(result.scope).toMatchObject({
      aggregationScope: "peakDay",
      representativeDate: "2026-07-20",
      representativeDateTotal: 2,
    });
    expect(result.total).toBe(2);
    expect(result.ranking).toMatchObject({ status: "metric", basis: "visitors" });
    expect(result.ranking.items[0]).toMatchObject({ id: "b1", count: 2 });
  });

  it("never labels capped or unavailable rankings as metric-specific", () => {
    const capped = aggregateEngagementBreakdown({
      request,
      scope,
      content,
      rows: [row()],
      partial: true,
    });
    expect(capped).toMatchObject({
      partial: true,
      ranking: { status: "unavailable", basis: null, items: [], reason: "rowLimit" },
    });

    const unavailable = aggregateEngagementBreakdown({
      request: { ...request, metric: "readerOpens" },
      scope,
      content,
      rows: [],
      sourceUnavailable: true,
    });
    expect(unavailable.ranking).toEqual({
      status: "unavailable",
      basis: null,
      items: [],
      reason: "sourceUnavailable",
    });
  });
});
