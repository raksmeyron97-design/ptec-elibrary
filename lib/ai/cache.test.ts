// lib/ai/cache.test.ts — §28 "Token control / repeated queries" + "Fallbacks".
//
// The cache exists so that the same question asked twice costs one round of
// work. What it must NOT do is outlive its usefulness, grow without bound, or
// turn a transient Gemini error into a five-minute outage.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheKey, cacheStats, cached, clearAllCaches } from "./cache";
import { normalizeQuery } from "./intent";
import { MODEL_IDS, resolveTier, thinkingBudgetFor } from "./models";

beforeEach(() => {
  clearAllCaches();
  vi.useRealTimers();
});

describe("cached", () => {
  it("runs the loader once for repeated identical keys", async () => {
    const loader = vi.fn().mockResolvedValue([1, 2, 3]);
    const a = await cached("embedding", "k", loader);
    const b = await cached("embedding", "k", loader);
    expect(loader).toHaveBeenCalledOnce();
    expect(a.hit).toBe(false);
    expect(b.hit).toBe(true);
    expect(b.value).toEqual([1, 2, 3]);
  });

  it("keeps different keys apart", async () => {
    const loader = vi.fn().mockImplementation(async () => Math.random());
    const a = await cached("retrieval", "one", loader);
    const b = await cached("retrieval", "two", loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(a.value).not.toBe(b.value);
  });

  it("does not cache a loader failure — a Gemini hiccup must not persist", async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue("ok");
    await expect(cached("embedding", "flaky", loader)).rejects.toThrow("boom");
    const retry = await cached("embedding", "flaky", loader);
    expect(retry.value).toBe("ok");
    expect(retry.hit).toBe(false);
  });

  it("expires entries once the TTL passes", async () => {
    const loader = vi.fn().mockResolvedValue("v");
    await cached("answer", "ttl", loader, 20);
    await new Promise((r) => setTimeout(r, 40));
    const after = await cached("answer", "ttl", loader, 20);
    expect(after.hit).toBe(false);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("evicts least-recently-used entries rather than growing without bound", async () => {
    for (let i = 0; i < 700; i++) {
      await cached("embedding", `k${i}`, async () => i);
    }
    const stats = cacheStats("embedding");
    expect(stats.size).toBeLessThanOrEqual(500);
    expect(stats.evictions).toBeGreaterThan(0);
  });

  it("tracks hits and misses for the performance dashboard", async () => {
    await cached("faq", "a", async () => 1);
    await cached("faq", "a", async () => 1);
    await cached("faq", "b", async () => 2);
    const s = cacheStats("faq");
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(2);
  });
});

describe("cacheKey", () => {
  it("collapses cosmetic query differences onto one entry", () => {
    const a = cacheKey(["works", normalizeQuery("Psychology Books?"), "book", 5]);
    const b = cacheKey(["works", normalizeQuery("  psychology   books "), "book", 5]);
    expect(a).toBe(b);
  });

  it("separates queries that differ in a meaningful option", () => {
    expect(cacheKey(["works", "x", "book", 5])).not.toBe(cacheKey(["works", "x", "research", 5]));
  });
});

describe("model tiering", () => {
  it("spends nothing on a request the deterministic path already answered", () => {
    expect(
      resolveTier({ intent: "book_search", verbosity: "normal", confidence: 0.9, evidenceCount: 3, deterministic: true }),
    ).toBe("none");
  });

  it("answers a confident library fact without a model", () => {
    expect(
      resolveTier({ intent: "faq", verbosity: "normal", confidence: 0.9, evidenceCount: 0, deterministic: false }),
    ).toBe("none");
  });

  it("escalates an ambiguous library fact to the cheap model, not the expensive one", () => {
    expect(
      resolveTier({ intent: "faq", verbosity: "normal", confidence: 0.6, evidenceCount: 0, deterministic: false }),
    ).toBe("fast");
  });

  it("uses the reasoning tier only for multi-passage or explicitly deep synthesis", () => {
    const shallow = resolveTier({ intent: "pdf_question", verbosity: "normal", confidence: 0.8, evidenceCount: 1, deterministic: false });
    const deep = resolveTier({ intent: "pdf_question", verbosity: "detailed", confidence: 0.8, evidenceCount: 1, deterministic: false });
    const multi = resolveTier({ intent: "pdf_question", verbosity: "normal", confidence: 0.8, evidenceCount: 3, deterministic: false });
    expect(shallow).toBe("fast");
    expect(deep).toBe("reasoning");
    expect(multi).toBe("reasoning");
  });

  it("never burns thinking tokens outside the reasoning tier", () => {
    expect(thinkingBudgetFor("fast")).toBe(0);
    expect(thinkingBudgetFor("none")).toBe(0);
    expect(thinkingBudgetFor("reasoning")).toBeGreaterThan(0);
  });

  it("declares model ids in exactly one place", () => {
    expect(MODEL_IDS.fast).toBeTruthy();
    expect(MODEL_IDS.reasoning).toBeTruthy();
  });
});
