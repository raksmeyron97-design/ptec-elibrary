/* lib/indexing/reconcile.test.ts
 *
 * What the reconciler decides to work on, and what it refuses to touch.
 *
 * `selectWork` is pure, so the eligibility rules — the ones that decide
 * whether a book ever becomes searchable again — are tested without a
 * database, a network, or a PDF.
 */

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";

import { selectWork, type ResourceRef } from "./reconcile";
import { judgeEnvironment, describeTarget } from "./environment";
import { sourceDigest } from "./state";
import { STALE_CLAIM_MS } from "./retry";

const NOW = new Date("2026-09-04T10:00:00.000Z");
const URL_A = "https://storage-ptec.online/files/books/a/one.pdf";
const URL_B = "https://storage-ptec.online/files/books/a/two.pdf";

function ref(id: string, fileUrl = URL_A): ResourceRef {
  return { recordType: "book", recordId: id, title: `Book ${id}`, fileUrl };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function states(...rows: Array<Record<string, any>>): ReadonlyMap<string, any> {
  return new Map(
    rows.map((r) => [
      `${r.record_type ?? "book"}:${r.record_id}`,
      {
        record_type: "book",
        status: "indexed",
        failure_kind: null,
        source_digest: null,
        next_attempt_at: null,
        claimed_at: null,
        ...r,
      },
    ]),
  );
}

describe("selectWork", () => {
  it("picks up a resource that has never been attempted", () => {
    const work = selectWork([ref("a")], states(), NOW, 10);
    expect(work).toHaveLength(1);
    expect(work[0].reason).toBe("never_attempted");
  });

  it("leaves a healthy, current record alone", () => {
    const work = selectWork(
      [ref("a")],
      states({ record_id: "a", status: "indexed", source_digest: sourceDigest(URL_A) }),
      NOW,
      10,
    );
    expect(work).toHaveLength(0);
  });

  it("re-indexes a record whose PDF was replaced", () => {
    // Indexed from URL_A, but the book points at URL_B now. This is the only
    // state that is actively WRONG: search would quote text the current
    // document does not contain.
    const work = selectWork(
      [ref("a", URL_B)],
      states({ record_id: "a", status: "indexed", source_digest: sourceDigest(URL_A) }),
      NOW,
      10,
    );
    expect(work.map((w) => w.reason)).toEqual(["stale"]);
  });

  it("never retries a permanent failure", () => {
    // A scan gets no next_attempt_at, so nothing picks it up — ever.
    const work = selectWork(
      [ref("a")],
      states({
        record_id: "a",
        status: "no_text_layer",
        failure_kind: "permanent",
        next_attempt_at: null,
      }),
      NOW,
      10,
    );
    expect(work).toHaveLength(0);
  });

  it("retries a transient failure once its backoff has elapsed, not before", () => {
    const due = states({
      record_id: "a",
      status: "unfetchable",
      failure_kind: "transient",
      next_attempt_at: "2026-09-04T09:59:00.000Z",
    });
    const notYet = states({
      record_id: "a",
      status: "unfetchable",
      failure_kind: "transient",
      next_attempt_at: "2026-09-04T10:30:00.000Z",
    });
    expect(selectWork([ref("a")], due, NOW, 10)).toHaveLength(1);
    expect(selectWork([ref("a")], notYet, NOW, 10)).toHaveLength(0);
  });

  it("respects a live claim but reclaims a cold one", () => {
    const live = states({
      record_id: "a",
      status: "running",
      claimed_at: new Date(NOW.getTime() - 60_000).toISOString(),
    });
    const cold = states({
      record_id: "a",
      status: "running",
      claimed_at: new Date(NOW.getTime() - STALE_CLAIM_MS - 1).toISOString(),
    });
    expect(selectWork([ref("a")], live, NOW, 10)).toHaveLength(0);
    expect(selectWork([ref("a")], cold, NOW, 10).map((w) => w.reason)).toEqual(["reclaimed"]);
  });

  it("is bounded — an hourly job must not walk the whole library", () => {
    const many = Array.from({ length: 50 }, (_, i) => ref(`b${i}`));
    expect(selectWork(many, states(), NOW, 10)).toHaveLength(10);
  });

  it("does the actively-wrong records first", () => {
    const work = selectWork(
      [ref("fresh"), ref("changed", URL_B)],
      states({ record_id: "changed", status: "indexed", source_digest: sourceDigest(URL_A) }),
      NOW,
      10,
    );
    expect(work[0].reason).toBe("stale");
  });
});

describe("judgeEnvironment", () => {
  const prod = "https://storage-ptec.online/files/books/x/y.pdf";

  it("refuses when the allow-list cannot reach any of the target's files", () => {
    // The 203-book incident: a laptop's ZIMA_API_URL against production rows.
    const previous = process.env.ZIMA_API_URL;
    process.env.ZIMA_API_URL = "http://localhost:4000";
    try {
      const verdict = judgeEnvironment([prod, prod, prod]);
      expect(verdict.ok).toBe(false);
      expect(verdict.resolvable).toBe(0);
      // The message has to name both sides — an operator seeing only "failed"
      // would go looking at the PDFs, which are fine.
      expect(verdict.reason).toContain("storage-ptec.online");
      expect(verdict.reason).toContain("localhost");
    } finally {
      process.env.ZIMA_API_URL = previous;
    }
  });

  it("allows a correctly configured process", () => {
    const previous = process.env.ZIMA_API_URL;
    process.env.ZIMA_API_URL = "https://api.storage-ptec.online";
    try {
      const verdict = judgeEnvironment([prod]);
      expect(verdict.ok).toBe(true);
      expect(verdict.resolvable).toBe(1);
    } finally {
      process.env.ZIMA_API_URL = previous;
    }
  });

  it("does not trip on a legacy collection of bare R2 keys", () => {
    // Those resolve through the presigner, not the allow-list; counting them
    // as failures would block a backfill on a collection that is fine.
    const verdict = judgeEnvironment(["books/legacy/key.pdf", "books/legacy/other.pdf"]);
    expect(verdict.ok).toBe(true);
  });

  it("has nothing to judge on an empty library", () => {
    expect(judgeEnvironment([]).ok).toBe(true);
  });
});

describe("describeTarget", () => {
  it("distinguishes local from remote and never prints a secret", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54331";
      expect(describeTarget().isProduction).toBe(false);

      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ufeymdoqksojwyysicun.supabase.co";
      const remote = describeTarget();
      expect(remote.isProduction).toBe(true);
      expect(remote.label).toContain("ufeymdoqksojwyysicun");
      expect(remote.label).not.toMatch(/key|secret|eyJ/i);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });
});

describe("staleness digest parity with SQL", () => {
  it("sourceDigest() is a plain full sha256 hex, matching digest(url,'sha256')", () => {
    // Migration 0134's view computes staleness in SQL as
    //   encode(extensions.digest(file_url,'sha256'),'hex')
    // and compares it to the source_digest this function wrote. If the two
    // ever diverge, every indexed record silently reads as stale and the
    // reconciler re-extracts the entire library on a loop.
    const url = "https://x/y.pdf";
    expect(sourceDigest(url)).toBe(createHash("sha256").update(url).digest("hex"));
    expect(sourceDigest(url)).toMatch(/^[0-9a-f]{64}$/);
  });
});
