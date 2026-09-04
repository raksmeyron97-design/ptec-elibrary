/* lib/indexing/retry.test.ts
 *
 * The rules that decide whether a book is retried, abandoned, or left alone.
 *
 * Every case below is anchored to something that actually happened in
 * production, because this file's whole purpose is to stop those from
 * happening twice.
 */

import { describe, it, expect } from "vitest";
import {
  BACKOFF_SECONDS,
  MAX_ATTEMPTS,
  STALE_CLAIM_MS,
  classifyFailure,
  compareWork,
  isClaimReclaimable,
  isDue,
  nextAttemptAt,
  nextAttemptCount,
  shouldOverwrite,
} from "./retry";

const NOW = new Date("2026-09-04T10:00:00.000Z");

describe("classifyFailure", () => {
  it("calls our own allow-list refusal a CONFIG failure, not a file problem", () => {
    // The 203-book incident in one assertion. `unresolvable-url` is emitted
    // when toAllowedStorageUrl() refuses a URL that came out of our own
    // database — which means the process is pointed at the wrong storage, and
    // says nothing whatsoever about the PDF.
    expect(classifyFailure("unfetchable", "unresolvable-url")).toBe("config");
  });

  it("calls a storage refusal TRANSIENT — that one IS about the file", () => {
    expect(classifyFailure("unfetchable", "HTTP 503")).toBe("transient");
    expect(classifyFailure("unfetchable", "fetch failed")).toBe("transient");
  });

  it("treats provider quota exhaustion as transient", () => {
    // gemini-embedding-001's free tier has a per-DAY cap, so a large backfill
    // is EXPECTED to stop partway. Marking those records permanently failed
    // would abandon every book the run did not reach.
    for (const msg of [
      "Quota exceeded for quota metric",
      "429 Too Many Requests",
      "RESOURCE_EXHAUSTED",
      "rate limit reached",
    ]) {
      expect(classifyFailure("failed", msg)).toBe("transient");
    }
  });

  it("treats a missing bundled module as CONFIG, never as a bad document", () => {
    // This class has bitten twice: pdf.worker.mjs, then @napi-rs/canvas. Both
    // are build defects. Filing either as `permanent` would mark a perfectly
    // good PDF as unusable and stop anything ever retrying it.
    expect(
      classifyFailure("failed", `Cannot find module '/app/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'`),
    ).toBe("config");
    expect(classifyFailure("failed", "DOMMatrix is not defined")).toBe("config");
    expect(classifyFailure("failed", 'Setting up fake worker failed: "..."')).toBe("config");
  });

  it("treats a document defect as permanent", () => {
    expect(classifyFailure("failed", "Invalid PDF structure")).toBe("permanent");
    expect(classifyFailure("failed", "File is encrypted")).toBe("permanent");
    expect(classifyFailure("no_text_layer")).toBe("permanent");
  });

  it("defaults an unrecognised error to transient, not permanent", () => {
    // Being wrong by retrying costs MAX_ATTEMPTS of work. Being wrong by
    // abandoning costs a book that is never searchable again.
    expect(classifyFailure("failed", "something nobody has seen before")).toBe("transient");
    expect(classifyFailure("failed", undefined)).toBe("transient");
  });

  it("classifies success and in-flight as no failure at all", () => {
    expect(classifyFailure("indexed")).toBeNull();
    expect(classifyFailure("running")).toBeNull();
  });
});

describe("nextAttemptAt", () => {
  it("never reschedules a permanent failure", () => {
    expect(nextAttemptAt("permanent", 1, NOW)).toBeNull();
    expect(nextAttemptAt("permanent", 9, NOW)).toBeNull();
  });

  it("backs off transient failures, then gives up at the budget", () => {
    const first = nextAttemptAt("transient", 1, NOW)!;
    expect(first.getTime() - NOW.getTime()).toBe(BACKOFF_SECONDS[0] * 1000);
    const second = nextAttemptAt("transient", 2, NOW)!;
    expect(second.getTime()).toBeGreaterThan(first.getTime());
    expect(nextAttemptAt("transient", MAX_ATTEMPTS, NOW)).toBeNull();
  });

  it("keeps retrying a config failure — environments get fixed and redeployed", () => {
    // The record never actually failed, so it must heal on its own after the
    // deployment is corrected rather than waiting for someone to remember it.
    expect(nextAttemptAt("config", 1, NOW)).not.toBeNull();
    expect(nextAttemptAt("config", 99, NOW)).not.toBeNull();
  });

  it("schedules nothing for a success", () => {
    expect(nextAttemptAt(null, 0, NOW)).toBeNull();
  });
});

describe("nextAttemptCount", () => {
  it("resets on success", () => {
    expect(nextAttemptCount(null, 4)).toBe(0);
  });

  it("counts transient and permanent attempts", () => {
    expect(nextAttemptCount("transient", 2)).toBe(3);
    expect(nextAttemptCount("permanent", 0)).toBe(1);
  });

  it("does NOT let a config failure consume the retry budget", () => {
    // Otherwise one misconfigured sweep exhausts every record's attempts and
    // leaves the whole library permanently un-retried after the fix ships.
    expect(nextAttemptCount("config", 2)).toBe(2);
    expect(nextAttemptCount("config", 0)).toBe(0);
  });
});

describe("shouldOverwrite", () => {
  it("refuses to let a config failure erase a healthy state", () => {
    // This single rule is the difference between the laptop incident being a
    // no-op and it being 203 false verdicts in production.
    expect(shouldOverwrite("config", { status: "indexed", failureKind: null })).toBe(false);
  });

  it("refuses to let a config failure create a state where there was none", () => {
    expect(shouldOverwrite("config", null)).toBe(false);
  });

  it("lets a config failure replace another config failure", () => {
    // Refreshing the reason for a still-broken environment is useful.
    expect(shouldOverwrite("config", { status: "unfetchable", failureKind: "config" })).toBe(true);
  });

  it("lets any real outcome overwrite anything — newest truth wins", () => {
    expect(shouldOverwrite(null, { status: "unfetchable", failureKind: "config" })).toBe(true);
    expect(shouldOverwrite("transient", { status: "indexed", failureKind: null })).toBe(true);
    expect(shouldOverwrite("permanent", null)).toBe(true);
  });
});

describe("isDue", () => {
  it("is never due without a schedule", () => {
    expect(isDue({ status: "failed", nextAttemptAt: null }, NOW)).toBe(false);
  });

  it("is due once the time passes, and accepts the DB's string form", () => {
    expect(isDue({ status: "failed", nextAttemptAt: "2026-09-04T09:59:00.000Z" }, NOW)).toBe(true);
    expect(isDue({ status: "failed", nextAttemptAt: "2026-09-04T10:01:00.000Z" }, NOW)).toBe(false);
  });

  it("is not due on an unparseable timestamp", () => {
    expect(isDue({ status: "failed", nextAttemptAt: "not-a-date" }, NOW)).toBe(false);
  });
});

describe("claims", () => {
  it("protects a live claim so two runners cannot process one record", () => {
    const fresh = new Date(NOW.getTime() - 60_000).toISOString();
    expect(isClaimReclaimable(fresh, NOW)).toBe(false);
  });

  it("reclaims a cold one — a killed runner must not strand a record", () => {
    const cold = new Date(NOW.getTime() - STALE_CLAIM_MS - 1).toISOString();
    expect(isClaimReclaimable(cold, NOW)).toBe(true);
    expect(isClaimReclaimable(null, NOW)).toBe(true);
    expect(isClaimReclaimable("garbage", NOW)).toBe(true);
  });
});

describe("work priority", () => {
  it("puts stale first — it is the only state that is actively WRONG", () => {
    // An indexed-but-stale record makes search quote text the current PDF does
    // not contain. Everything else is merely absent.
    const order = (["transient", "never_attempted", "stale", "config", "reclaimed"] as const)
      .slice()
      .sort(compareWork);
    expect(order[0]).toBe("stale");
    expect(order.indexOf("never_attempted")).toBeLessThan(order.indexOf("transient"));
  });
});
