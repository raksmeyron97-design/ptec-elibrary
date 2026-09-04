/* lib/indexing/state.test.ts
 *
 * The mapping from "what the indexer did" to "what the admin screen says".
 *
 * The defect this module exists to prevent was not a wrong number — it was
 * FOUR different outcomes wearing the same face. A scan with no text layer, a
 * storage outage, and a crash on the extractor's first statement all rendered
 * as "this record has no pages", which is also what a healthy library of
 * photographed textbooks looks like. Everything below is about keeping those
 * apart.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { IndexPdfResult } from "../pdf-page-index";
import {
  INDEX_STATUSES,
  RETRYABLE_STATUSES,
  MAX_DETAIL_CHARS,
  outcomeFromResult,
  outcomeFromError,
  sanitizeDetail,
  sourceDigest,
  toRow,
  writeIndexState,
} from "./state";

afterEach(() => vi.restoreAllMocks());

describe("outcomeFromResult", () => {
  it("records a success with its page count", () => {
    expect(outcomeFromResult({ indexed: true, pages: 172 })).toEqual({
      status: "indexed",
      pages: 172,
    });
  });

  it("calls a scanned PDF a scan, not a failure", () => {
    // Permanent and legitimate: re-running the indexer will never help, and
    // flagging it as `failed` would bury the real failures in noise.
    expect(outcomeFromResult({ indexed: false, reason: "no-text-layer" }).status).toBe(
      "no_text_layer",
    );
  });

  it.each(["unresolvable-url", "fetch-failed"] as const)(
    "calls %s unfetchable, so a sweep retries it",
    (reason) => {
      const outcome = outcomeFromResult({ indexed: false, reason });
      expect(outcome.status).toBe("unfetchable");
      expect(RETRYABLE_STATUSES.has(outcome.status)).toBe(true);
    },
  );

  it("keeps the HTTP status of a fetch failure", () => {
    expect(
      outcomeFromResult({ indexed: false, reason: "fetch-failed", detail: "HTTP 503" }).detail,
    ).toBe("HTTP 503");
  });

  it("treats an unrecognised reason as failed rather than as a skip", () => {
    // A new reason added to indexPdfPages without updating this file is a code
    // change that forgot the observability half. Surfacing it beats counting
    // it as a legitimate skip, which is how the original defect looked.
    const rogue = { indexed: false, reason: "quantum-tunnelling" } as unknown as IndexPdfResult;
    const outcome = outcomeFromResult(rogue);
    expect(outcome.status).toBe("failed");
    expect(outcome.detail).toContain("quantum-tunnelling");
  });

  it("never reports pages for anything but a success", () => {
    const failures: IndexPdfResult[] = [
      { indexed: false, reason: "no-text-layer" },
      { indexed: false, reason: "unresolvable-url" },
      { indexed: false, reason: "fetch-failed" },
    ];
    for (const f of failures) expect(outcomeFromResult(f).pages).toBe(0);
  });
});

describe("outcomeFromError", () => {
  it("is always `failed` — a throw is evidence about us, not the document", () => {
    // The production exception, verbatim. If this ever mapped to
    // `no_text_layer`, the table would have written the reassuring answer 120
    // times and the outage would still be invisible.
    const err = new Error(
      `Setting up fake worker failed: "Cannot find module '/app/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'".`,
    );
    const outcome = outcomeFromError(err);
    expect(outcome.status).toBe("failed");
    expect(outcome.pages).toBe(0);
    expect(outcome.detail).toContain("pdf.worker.mjs");
  });

  it("survives a non-Error throw", () => {
    expect(outcomeFromError("boom").detail).toBe("boom");
    expect(outcomeFromError(undefined).detail).toBe("unknown error");
    expect(outcomeFromError(null).status).toBe("failed");
  });

  it("only ever produces a declared status", () => {
    expect(INDEX_STATUSES).toContain(outcomeFromError(new Error("x")).status);
  });
});

describe("sanitizeDetail", () => {
  it("strips control characters and newlines that could forge a log line", () => {
    expect(sanitizeDetail("bad\r\n[pdf-index] fake: indexed 999 pages")).toBe(
      "bad [pdf-index] fake: indexed 999 pages",
    );
    expect(sanitizeDetail("esc\u001b[31mred\u0000")).toBe("esc[31mred");
  });

  it("caps length so an admin table cannot be flooded", () => {
    expect(sanitizeDetail("x".repeat(5000))!.length).toBe(MAX_DETAIL_CHARS);
  });

  it("returns undefined for nothing worth storing", () => {
    expect(sanitizeDetail(undefined)).toBeUndefined();
    expect(sanitizeDetail(null)).toBeUndefined();
    expect(sanitizeDetail("   ")).toBeUndefined();
  });
});

describe("sourceDigest", () => {
  it("is stable and differs when the file changes", () => {
    const a = "https://storage.example/files/books/x/a.pdf";
    expect(sourceDigest(a)).toBe(sourceDigest(a));
    expect(sourceDigest(a)).not.toBe(sourceDigest(a.replace("a.pdf", "b.pdf")));
  });

  it("does not contain the URL it describes", () => {
    // A storage URL is a permanent credential-free download link. The whole
    // point of storing a digest is that this table is not a second place one
    // can leak from.
    const url = "https://storage.example/files/books/secret-folder/secret.pdf";
    const digest = sourceDigest(url);
    expect(digest).not.toContain("secret");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("toRow", () => {
  const base = { recordType: "book" as const, recordId: "id-1", status: "indexed" as const };

  it("maps to the 0133 column names", () => {
    const row = toRow({ ...base, pages: 12, chunks: 40, detail: "ok", sourceDigest: "abc" });
    expect(row).toMatchObject({
      record_type: "book",
      record_id: "id-1",
      status: "indexed",
      pages: 12,
      chunks: 40,
      detail: "ok",
      source_digest: "abc",
    });
    expect(typeof row.attempted_at).toBe("string");
  });

  it("clamps counts to the CHECK constraints rather than letting the insert fail", () => {
    const row = toRow({ ...base, pages: -3, chunks: 2.7 });
    expect(row.pages).toBe(0);
    expect(row.chunks).toBe(2);
  });

  it("writes null, not undefined, for absent optional columns", () => {
    const row = toRow({ ...base, pages: 0, chunks: 0 });
    expect(row.detail).toBeNull();
    expect(row.source_digest).toBeNull();
  });
});

describe("writeIndexState", () => {
  /* A stub standing in for the PostgREST builder: `writeIndexState` now READS
     the current row before deciding whether it may overwrite it, so the mock
     has to answer both halves. `existing` is what the read returns. */
  function db(
    result: { error: { message: string } | null },
    existing: Record<string, unknown> | null = null,
  ) {
    const upsert = vi.fn().mockResolvedValue(result);
    const maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });
    const select = vi.fn(() => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }));
    return { client: { from: vi.fn(() => ({ upsert, select })) }, upsert };
  }

  it("upserts on the composite key so a re-index replaces the old outcome", async () => {
    const { client, upsert } = db({ error: null });
    await writeIndexState(client, {
      recordType: "research",
      recordId: "r1",
      status: "indexed",
      pages: 5,
      chunks: 9,
    });
    expect(client.from).toHaveBeenCalledWith("resource_index_state");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ record_id: "r1" }), {
      onConflict: "record_type,record_id",
    });
  });

  it("never throws — it is bookkeeping for a job that must not fail a save", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = db({ error: { message: "relation does not exist" } });
    await expect(
      writeIndexState(client, {
        recordType: "book",
        recordId: "b1",
        status: "failed",
        pages: 0,
        chunks: 0,
      }),
    ).resolves.toBeUndefined();
    // ...but it is loud, because a table that cannot accept this row means the
    // admin screen is about to under-report.
    expect(spy).toHaveBeenCalled();
  });
});
