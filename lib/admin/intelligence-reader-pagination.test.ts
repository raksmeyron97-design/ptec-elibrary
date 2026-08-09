import { describe, expect, it, vi } from "vitest";
import { fetchReaderOpenRows } from "./intelligence";

const window = {
  start: new Date("2026-07-20T00:00:00.000Z"),
  end: new Date("2026-07-21T00:00:00.000Z"),
  prevStart: new Date("2026-07-19T00:00:00.000Z"),
  granularity: "day" as const,
  bucketKeys: ["2026-07-20"],
  keyOf: () => "2026-07-20",
  label: "test",
  vsLabel: "previous",
};

function clientFor(rows: unknown[], error: { message: string } | null = null) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "gte", "lte", "order"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.range = vi.fn((from: number, to: number) =>
    Promise.resolve({ data: error ? null : rows.slice(from, to + 1), error }),
  );
  return {
    client: { from: vi.fn(() => chain) },
    range: chain.range as ReturnType<typeof vi.fn>,
  };
}

describe("reader-open pagination correction", () => {
  it("reads beyond the former 5,000-row single-query cap in ordered pages", async () => {
    const rows = Array.from({ length: 5_250 }, (_, index) => ({
      content_type: "book",
      content_id: `book-${index % 3}`,
      user_id: `reader-${index}`,
      session_hash: null,
      locale: "en",
      opened_at: "2026-07-20T01:00:00.000Z",
    }));
    const { client, range } = clientFor(rows);
    const result = await fetchReaderOpenRows(client as never, window as never);
    expect(result).toHaveLength(5_250);
    expect(range).toHaveBeenCalledTimes(6);
    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(6, 5_000, 5_999);
  });

  it("preserves the collecting state when the source is unavailable", async () => {
    const { client } = clientFor([], { message: "relation reader_open_logs does not exist" });
    await expect(fetchReaderOpenRows(client as never, window as never)).resolves.toBeNull();
  });
});
