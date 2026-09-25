import { describe, it, expect } from "vitest";
import { createKohaClient, kohaPath, assertSafePath, RETRY_DELAYS_MS } from "./client";
import { resolveKohaConfig } from "./config";
import { KohaError, kohaErrorFromResponse } from "./errors";
import { MOCK_KOHA_BASE_URL, MOCK_KOHA_LIBRARIES } from "./mock";
import { isKohaLibraryList, isKohaVersion } from "./types";
import type { FetchLike } from "./auth";

const REAL = resolveKohaConfig({
  KOHA_INTEGRATION: "read",
  KOHA_BASE_URL: "http://koha.test",
  KOHA_CLIENT_ID: "id",
  KOHA_CLIENT_SECRET: "secret",
  KOHA_LIBRARY_ID: "PTEC",
  KOHA_TIMEOUT_MS: "200",
});

/** A scripted Koha: token endpoint always works; each API call takes the next answer. */
function scripted(answers: Array<Response | Error | "hang">) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    if (url.endsWith("/api/v1/oauth/token")) {
      return new Response(JSON.stringify({ access_token: `tok-${calls.length}`, expires_in: 3600 }), { status: 200 });
    }
    calls.push({ url, init });
    const a = answers.shift();
    if (a === "hang") {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    if (a instanceof Error) throw a;
    return a ?? new Response("[]", { status: 200 });
  };
  const sleeps: number[] = [];
  const client = createKohaClient(REAL, { fetch, sleep: async (ms) => void sleeps.push(ms), newRequestId: () => "req-1" });
  return { client, calls, sleeps };
}

const ok = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers });

describe("paths — nothing can steer a privileged call elsewhere", () => {
  it("encodes each parameter as one segment", () => {
    expect(kohaPath("/biblios/{id}/items", { id: 42 })).toBe("/biblios/42/items");
    expect(kohaPath("/items/{b}", { b: "A/../x" })).toBe("/items/A%2F..%2Fx");
    expect(kohaPath("/items/{b}", { b: "https://evil" })).toBe("/items/https%3A%2F%2Fevil");
  });

  it.each(["//evil.example/x", "/a/../oauth", "/a/./b", "http://x", "/items?x=1", "/items#x", "relative", "/", "/a//b"])(
    "refuses %s",
    (p) => expect(() => assertSafePath(p)).toThrow(KohaError),
  );

  it("a missing template parameter is an error, not an empty segment", () => {
    expect(() => kohaPath("/biblios/{id}", {})).toThrow(/missing parameter/);
  });
});

describe("createKohaClient", () => {
  it("off and half-configured modes refuse before any network call", async () => {
    let called = false;
    const fetch: FetchLike = async () => { called = true; return ok([]); };
    const off = createKohaClient(resolveKohaConfig({}), { fetch });
    await expect(off.get("/libraries", isKohaLibraryList)).rejects.toMatchObject({ kind: "disabled" });
    const half = createKohaClient(resolveKohaConfig({ KOHA_INTEGRATION: "read" }), { fetch });
    await expect(half.get("/libraries", isKohaLibraryList)).rejects.toMatchObject({ kind: "config", failureKind: "config" });
    expect(called).toBe(false);
  });

  it("sends the bearer token, the request id and the library, to the configured host only", async () => {
    const { client, calls } = scripted([ok(MOCK_KOHA_LIBRARIES, { "X-Total-Count": "1" })]);
    const r = await client.get("/libraries", isKohaLibraryList, { query: { _per_page: 100, unused: undefined } });
    expect(r).toEqual({ data: MOCK_KOHA_LIBRARIES, total: 1, requestId: "req-1" });
    expect(calls[0].url).toBe("http://koha.test/api/v1/libraries?_per_page=100");
    const h = calls[0].init!.headers as Record<string, string>;
    expect(h.Authorization).toMatch(/^Bearer tok-/);
    expect(h["x-koha-request-id"]).toBe("req-1");
    expect(h["x-koha-library"]).toBe("PTEC");
    expect(calls[0].init!.method).toBe("GET");
  });

  it("retries a transient failure of a read, with backoff, then succeeds", async () => {
    const { client, calls, sleeps } = scripted([new TypeError("fetch failed"), new Response("{}", { status: 503 }), ok(MOCK_KOHA_LIBRARIES)]);
    const r = await client.get("/libraries", isKohaLibraryList);
    expect(r.data).toEqual(MOCK_KOHA_LIBRARIES);
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([...RETRY_DELAYS_MS]);
  });

  it("gives up after the last retry with the transient error", async () => {
    const { client, calls } = scripted([new Response("{}", { status: 502 }), new Response("{}", { status: 502 }), new Response("{}", { status: 502 })]);
    await expect(client.get("/libraries", isKohaLibraryList)).rejects.toMatchObject({ kind: "server", status: 502 });
    expect(calls).toHaveLength(1 + RETRY_DELAYS_MS.length);
  });

  it("never retries a permanent answer", async () => {
    const { client, calls } = scripted([new Response(JSON.stringify({ error: "Biblio not found" }), { status: 404 })]);
    await expect(client.get("/biblios/1", isKohaVersion)).rejects.toMatchObject({ kind: "not_found", failureKind: "permanent" });
    expect(calls).toHaveLength(1);
  });

  it("a call that outlives its budget is a timeout, and is retried as transient", async () => {
    const { client, calls } = scripted(["hang", ok(MOCK_KOHA_LIBRARIES)]);
    const r = await client.get("/libraries", isKohaLibraryList);
    expect(r.data).toEqual(MOCK_KOHA_LIBRARIES);
    expect(calls).toHaveLength(2);
  });

  it("refreshes the token once on 401, then treats the credentials as wrong", async () => {
    const refreshed = scripted([new Response("{}", { status: 401 }), ok(MOCK_KOHA_LIBRARIES)]);
    await expect(refreshed.client.get("/libraries", isKohaLibraryList)).resolves.toMatchObject({ data: MOCK_KOHA_LIBRARIES });

    const wrong = scripted([new Response("{}", { status: 401 }), new Response("{}", { status: 401 })]);
    await expect(wrong.client.get("/libraries", isKohaLibraryList)).rejects.toMatchObject({ kind: "auth", failureKind: "config" });
    expect(wrong.calls).toHaveLength(2);
  });

  it("a 2xx body of the wrong shape is a bad response, not data", async () => {
    const { client } = scripted([ok([{ id: 1 }])]);
    await expect(client.get("/libraries", isKohaLibraryList)).rejects.toMatchObject({ kind: "bad_response" });
  });

  it("mock mode runs the real client against the in-process Koha", async () => {
    const client = createKohaClient(resolveKohaConfig({ KOHA_INTEGRATION: "mock" }));
    const v = await client.get("/status/version", isKohaVersion);
    expect(v.data.release).toBe("26.05");
    const libs = await client.get("/libraries", isKohaLibraryList);
    expect(libs.total).toBe(1);
    expect(MOCK_KOHA_BASE_URL).toBe("http://koha.mock");
  });
});

describe("kohaErrorFromResponse", () => {
  it("names the permissions a 403 says are missing — a setup problem", () => {
    const e = kohaErrorFromResponse(403, { error: "Authorization failure. Missing required permission(s).", required_permissions: { catalogue: "1" } }, "GET /libraries");
    expect(e.kind).toBe("forbidden");
    expect(e.failureKind).toBe("config");
    expect(e.message).toMatch(/catalogue/);
  });

  it.each([
    [400, "invalid_request", "permanent"],
    [409, "conflict", "permanent"],
    [412, "conflict", "permanent"],
    [429, "rate_limited", "transient"],
    [500, "server", "transient"],
  ])("%i → %s (%s)", (status, kind, owner) => {
    const e = kohaErrorFromResponse(status, null, "GET /x");
    expect(e.kind).toBe(kind);
    expect(e.failureKind).toBe(owner);
  });

  it("caps Koha's own reason so a huge error body cannot flood a log", () => {
    const e = kohaErrorFromResponse(400, { error: "x".repeat(5_000) }, "GET /x");
    expect(e.message.length).toBeLessThan(400);
  });
});
