import { describe, it, expect } from "vitest";
import { lookupIsbnMetadata, type ProviderFn } from "./resolver";
import { CACHE_TTL_MS, createSupabaseIsbnCache, type CachedAnswer, type IsbnCache } from "./cache";
import type { IsbnCandidate, IsbnProvider, ProviderResult } from "./types";

const cand = (provider: IsbnProvider, title: string): IsbnCandidate => ({
  provider, providerRecordId: `${provider}:${title}`, title, subtitle: null, authors: [], publisher: null, year: null,
  language: null, pageCount: null, edition: null, subjects: [], description: null, coverSource: null, isbn13: "9780134685991", isbn10: null,
});

function memoryCache() {
  const rows = new Map<string, CachedAnswer>();
  const cache: IsbnCache = {
    async get(isbn13, p) { return rows.get(`${isbn13}|${p}`) ?? null; },
    async set(isbn13, p, a) { rows.set(`${isbn13}|${p}`, a); },
  };
  return { cache, rows };
}

function counted(result: ProviderResult) {
  let calls = 0;
  const fn: ProviderFn = async () => { calls++; return result; };
  return { fn, calls: () => calls };
}

describe("lookupIsbnMetadata", () => {
  it("multiple results: both providers' candidates, in provider order", async () => {
    const ol = counted({ status: "found", candidates: [cand("open_library", "A")] });
    const gb = counted({ status: "found", candidates: [cand("google_books", "B")] });
    const r = await lookupIsbnMetadata("9780134685991", null, {
      providers: [{ name: "open_library", lookup: ol.fn }, { name: "google_books", lookup: gb.fn }],
    });
    expect(r.candidates.map((c) => c.title)).toEqual(["A", "B"]);
    expect(r.outcomes).toEqual([
      { provider: "open_library", status: "found", count: 1, cached: false },
      { provider: "google_books", status: "found", count: 1, cached: false },
    ]);
  });

  it("provider failure: one provider down costs only its own answer", async () => {
    const ol = counted({ status: "found", candidates: [cand("open_library", "A")] });
    const gb = counted({ status: "error", kind: "quota", message: "quota" });
    const r = await lookupIsbnMetadata("9780134685991", null, {
      providers: [{ name: "open_library", lookup: ol.fn }, { name: "google_books", lookup: gb.fn }],
    });
    expect(r.candidates).toHaveLength(1);
    expect(r.outcomes[1]).toEqual({ provider: "google_books", status: "error", kind: "quota", message: "quota" });
  });

  it("a provider that throws is reported, not propagated", async () => {
    const boom: ProviderFn = async () => { throw new Error("bug"); };
    const r = await lookupIsbnMetadata("9780134685991", null, { providers: [{ name: "open_library", lookup: boom }] });
    expect(r.outcomes[0]).toMatchObject({ status: "error", kind: "bad_response" });
  });

  it("caches found and not-found, never errors — and a cached answer skips the provider", async () => {
    const { cache, rows } = memoryCache();
    const ol = counted({ status: "not_found" });
    const gb = counted({ status: "error", kind: "timeout", message: "slow" });
    const deps = { providers: [{ name: "open_library" as const, lookup: ol.fn }, { name: "google_books" as const, lookup: gb.fn }], cache };
    await lookupIsbnMetadata("9780134685991", null, deps);
    expect([...rows.keys()]).toEqual(["9780134685991|open_library"]);
    const again = await lookupIsbnMetadata("9780134685991", null, deps);
    expect(ol.calls()).toBe(1);
    expect(gb.calls()).toBe(2);
    expect(again.outcomes[0]).toEqual({ provider: "open_library", status: "not_found", cached: true });
  });

  it("no result: every provider says not found", async () => {
    const r = await lookupIsbnMetadata("9780000000002", null, {
      providers: [{ name: "open_library", lookup: counted({ status: "not_found" }).fn }],
    });
    expect(r).toEqual({ candidates: [], outcomes: [{ provider: "open_library", status: "not_found", cached: false }] });
  });

  it("a cache that fails to read is a miss, not a failed lookup", async () => {
    const broken: IsbnCache = { get: async () => { throw new Error("db down"); }, set: async () => { throw new Error("db down"); } };
    const r = await lookupIsbnMetadata("9780134685991", null, {
      providers: [{ name: "open_library", lookup: counted({ status: "found", candidates: [cand("open_library", "A")] }).fn }],
      cache: broken,
    });
    expect(r.candidates).toHaveLength(1);
  });
});

describe("createSupabaseIsbnCache", () => {
  function fakeDb(row: Record<string, unknown> | null) {
    const writes: Record<string, unknown>[] = [];
    const db = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
        upsert: async (r: Record<string, unknown>) => { writes.push(r); return { error: null }; },
      }),
    };
    return { db: db as unknown as Parameters<typeof createSupabaseIsbnCache>[0], writes };
  }
  const now = new Date("2026-09-25T00:00:00Z");

  it("an expired row is a miss", async () => {
    const { db } = fakeDb({ status: "not_found", candidates: [], expires_at: "2026-09-24T00:00:00Z" });
    expect(await createSupabaseIsbnCache(db).get("9780134685991", "open_library", now)).toBeNull();
  });

  it("writes the expiry from the answer's TTL", async () => {
    const { db, writes } = fakeDb(null);
    await createSupabaseIsbnCache(db).set("9780134685991", "open_library", { status: "not_found" }, now);
    expect(writes[0]).toMatchObject({ status: "not_found", candidates: [], expires_at: new Date(now.getTime() + CACHE_TTL_MS.not_found).toISOString() });
  });
});
