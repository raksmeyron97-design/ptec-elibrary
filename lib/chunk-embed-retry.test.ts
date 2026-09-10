// lib/chunk-embed-retry.test.ts
//
// A transient database write must not throw away a metered quota.
//
// MEASURED IN PRODUCTION (2026-09-09). Embedding the last three unembedded
// books, two of them failed at the insert:
//
//   book:563fefa0 — 326/326 chunks…  FAILED: canceling statement due to
//                                            statement timeout
//   book:fbd4958f — 1205/1205 chunks… FAILED: canceling statement due to
//                                            statement timeout
//
// Both succeeded, unchanged, on the very next run — so the failure was
// transient, not a property of those documents. `book_chunks` carries an HNSW
// index over 130k+ 768-dim vectors, so index maintenance for a 40-row batch is
// not free and a busy moment crosses `statement_timeout` (SQLSTATE 57014).
//
// The cost of having no retry is not the failed run. Every embedding is
// computed BEFORE the first write, so 1,531 chunks were embedded, paid for
// against a metered daily quota, and discarded — then paid for a second time.
//
// The second, quieter cost is partial data: the inserts run AFTER the delete,
// so a failure part-way through the batches leaves a record that previously
// had chunks holding only some of them, with nothing recorded to say so.

import { beforeEach, describe, expect, it, vi } from "vitest";

const TIMEOUT = "canceling statement due to statement timeout";

/** Insert attempts seen by the fake, in order. */
let attempts: { rows: number }[];
/** Errors to return, one per attempt; undefined = success. */
let script: (string | undefined)[];

vi.mock("./ai/provider", () => ({
  // One 768-dim vector per text, so the shape is right and nothing is real.
  generateEmbedding: async (texts: string[]) => texts.map(() => new Array(768).fill(0.01)),
}));

function db() {
  return {
    from(table: string) {
      if (table === "book_pages") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  // One long page → several chunks.
                  range: async () => ({
                    data: [{ page_no: 1, content: "PTEC ".repeat(2_000) }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "book_chunks") {
        return {
          delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          insert: async (rows: unknown[]) => {
            attempts.push({ rows: rows.length });
            const err = script[attempts.length - 1];
            return { error: err ? { message: err } : null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  attempts = [];
  script = [];
});

describe("book_chunks insert survives a transient statement timeout", () => {
  it("retries the exact production failure instead of discarding the embeddings", async () => {
    const { embedRecordChunks } = await import("./chunk-embed");
    // First attempt is cancelled, as production did; the rest succeed.
    script = [TIMEOUT];

    const res = await embedRecordChunks({
      recordType: "book",
      recordId: "563fefa0-437b-4673-9332-9114101f0c9f",
      db: db() as never,
    });

    expect(res.embedded).toBe(true);
    // The cancelled batch was retried rather than lost.
    expect(attempts.length).toBeGreaterThanOrEqual(2);
    expect(attempts[0].rows).toBe(attempts[1].rows);
  }, 20_000);

  it("gives up on an error that retrying cannot fix, rather than looping", async () => {
    const { embedRecordChunks } = await import("./chunk-embed");
    script = ['null value in column "embedding" violates not-null constraint'];

    await expect(
      embedRecordChunks({
        recordType: "book",
        recordId: "bd09d094-d698-4143-af19-0fc7aedb630b",
        db: db() as never,
      }),
    ).rejects.toThrow(/not-null constraint/);

    expect(attempts).toHaveLength(1);
  }, 20_000);

  it("stops after a bounded number of attempts when the timeout persists", async () => {
    const { embedRecordChunks } = await import("./chunk-embed");
    script = [TIMEOUT, TIMEOUT, TIMEOUT, TIMEOUT, TIMEOUT, TIMEOUT];

    await expect(
      embedRecordChunks({
        recordType: "book",
        recordId: "fbd4958f-4b5f-44aa-b822-ecbc0d153b89",
        db: db() as never,
      }),
    ).rejects.toThrow(/statement timeout/);

    // Bounded: the first attempt plus the three backoffs, never an open loop.
    expect(attempts).toHaveLength(4);
  }, 30_000);
});
