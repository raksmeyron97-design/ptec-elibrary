import { describe, it, expect } from "vitest";
import {
  chunked,
  IN_FILTER_CHUNK,
  pagedScan,
  POSTGREST_MAX_ROWS,
  type PagedScanError,
} from "./paged-scan";

/** A fake table of `total` rows that honours the requested range and, like
 *  PostgREST, never returns more than POSTGREST_MAX_ROWS in one response. */
function fakeTable(total: number) {
  const calls: [number, number][] = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    const width = Math.min(to - from + 1, POSTGREST_MAX_ROWS);
    const rows = Array.from({ length: Math.max(0, Math.min(width, total - from)) }, (_, i) => ({
      id: from + i,
    }));
    return Promise.resolve({ data: rows, error: null });
  };
  return { page, calls };
}

describe("pagedScan", () => {
  it("reads past the 1000-row response cap a one-shot select is clipped to", async () => {
    const { page } = fakeTable(1_734);
    const { data, error } = await pagedScan<{ id: number }>(page, 10_000);

    expect(error).toBeNull();
    // The bug this exists for: a single request would have returned 1000, and
    // 1734 - 1000 = 734 was published as "Missing PDFs".
    expect(data).toHaveLength(1_734);
    expect(new Set(data.map((r) => r.id)).size).toBe(1_734);
  });

  it("stops on a short page rather than asking for another", async () => {
    const { page, calls } = fakeTable(1_200);
    await pagedScan(page, 10_000);
    expect(calls).toEqual([
      [0, 999],
      [1_000, 1_999],
    ]);
  });

  it("makes exactly one request for a set smaller than a page", async () => {
    const { page, calls } = fakeTable(42);
    const { data } = await pagedScan<{ id: number }>(page, 10_000);
    expect(data).toHaveLength(42);
    expect(calls).toHaveLength(1);
  });

  it("returns an empty set, and no error, for an empty table", async () => {
    const { page, calls } = fakeTable(0);
    const { data, error } = await pagedScan(page, 10_000);
    expect(data).toEqual([]);
    expect(error).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("never reads beyond maxRows, and never asks for a wider page than is left", async () => {
    const { page, calls } = fakeTable(10_000);
    const { data } = await pagedScan<{ id: number }>(page, 1_500);
    expect(data).toHaveLength(1_500);
    expect(calls).toEqual([
      [0, 999],
      [1_000, 1_499],
    ]);
  });

  it("surfaces the PostgREST error object, not a rethrown Error", async () => {
    // Callers branch on the CODE: 42703 means the column is missing because a
    // migration has not been applied, and the scan is retried without it.
    const error: PagedScanError = { code: "42703", message: 'column "updated_at" does not exist' };
    const res = await pagedScan(() => Promise.resolve({ data: null, error }), 10_000);
    expect(res.error).toBe(error);
    expect(res.error?.code).toBe("42703");
  });

  it("stops at the first failing page instead of returning a partial set as complete", async () => {
    let n = 0;
    const res = await pagedScan<{ id: number }>(() => {
      n += 1;
      if (n === 1) {
        return Promise.resolve({
          data: Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => ({ id: i })),
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: { code: "57014", message: "canceling statement" } });
    }, 10_000);

    // The rows it did read are still returned, but `error` is set — a caller
    // that ignores it and subtracts this from a total reproduces the 734 bug,
    // so the signal has to be present rather than swallowed.
    expect(res.error).not.toBeNull();
    expect(res.data).toHaveLength(POSTGREST_MAX_ROWS);
    expect(n).toBe(2);
  });
});

describe("pagedScan reports an incomplete read", () => {
  it("is not truncated when the set simply ran out", async () => {
    const { page } = fakeTable(1_734);
    const { truncated } = await pagedScan<{ id: number }>(page, 10_000);
    expect(truncated).toBe(false);
  });

  it("is truncated when it stopped at the ceiling with rows still to come", async () => {
    // The distinction the public loaders act on: 1,500 of 10,000 rows is not
    // an answer, and publishing it as a count is the whole defect. A caller
    // that only checked `error` would read this as a complete set.
    const { data, error, truncated } = await pagedScan<{ id: number }>(fakeTable(10_000).page, 1_500);
    expect(error).toBeNull();
    expect(data).toHaveLength(1_500);
    expect(truncated).toBe(true);
  });

  it("errs toward `true` when the set is exactly the ceiling", async () => {
    // Indistinguishable from a set of 1,501 without another request. A false
    // alarm costs a raised ceiling; the other direction costs a wrong number.
    const { truncated } = await pagedScan<{ id: number }>(fakeTable(1_000).page, 1_000);
    expect(truncated).toBe(true);
  });

  it("does not claim truncation on a failed page", async () => {
    // `error` already says the set is incomplete, and for a different reason.
    const res = await pagedScan(
      () => Promise.resolve({ data: null, error: { code: "57014" } }),
      1_000,
    );
    expect(res.error).not.toBeNull();
    expect(res.truncated).toBe(false);
  });
});

describe("chunked", () => {
  it("keeps every batch below the response cap", () => {
    expect(IN_FILTER_CHUNK).toBeLessThan(POSTGREST_MAX_ROWS);
  });

  it("splits an id list into batches no single response can clip", () => {
    // The Ministry of Education's 1,037 canonical credits, asked for by id in
    // one `.in()` filter, came back as 1,000 — and the author page rendered
    // that as their complete works.
    const ids = Array.from({ length: 1_037 }, (_, i) => `id-${i}`);
    const batches = chunked(ids);
    expect(batches.map((b) => b.length)).toEqual([500, 500, 37]);
    expect(batches.flat()).toEqual(ids);
    for (const batch of batches) expect(batch.length).toBeLessThanOrEqual(POSTGREST_MAX_ROWS);
  });

  it("returns no batches for an empty list, so no pointless request is made", () => {
    expect(chunked([])).toEqual([]);
  });

  it("refuses a size that would never terminate", () => {
    expect(() => chunked(["a"], 0)).toThrow();
  });
});
