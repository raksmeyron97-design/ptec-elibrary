import { describe, it, expect } from "vitest";
import { createTokenProvider, TOKEN_REFRESH_MARGIN_MS } from "./auth";
import { KohaError } from "./errors";
import { createMockKoha, MOCK_KOHA_BASE_URL } from "./mock";

const opts = (fetch: Parameters<typeof createTokenProvider>[0]["fetch"], now = () => 0) => ({
  baseUrl: MOCK_KOHA_BASE_URL,
  clientId: "id",
  clientSecret: "the-secret",
  timeoutMs: 1_000,
  fetch,
  now,
});

describe("Koha client-credentials tokens", () => {
  it("sends the secret only as Basic auth to the token endpoint", async () => {
    const mock = createMockKoha();
    await createTokenProvider(opts(mock.fetch)).getToken();
    expect(mock.calls).toHaveLength(1);
    const call = mock.calls[0];
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/api/v1/oauth/token");
    expect(call.headers.authorization).toBe(`Basic ${Buffer.from("id:the-secret").toString("base64")}`);
  });

  it("reuses a token until shortly before it expires, then fetches a new one", async () => {
    const mock = createMockKoha();
    let t = 0;
    const p = createTokenProvider(opts(mock.fetch, () => t));
    const first = await p.getToken();
    t = 3_600_000 - TOKEN_REFRESH_MARGIN_MS - 1;
    expect(await p.getToken()).toBe(first);
    t = 3_600_000 - TOKEN_REFRESH_MARGIN_MS;
    expect(await p.getToken()).not.toBe(first);
    expect(mock.calls.filter((c) => c.path.endsWith("/oauth/token"))).toHaveLength(2);
  });

  it("mints ONE token for concurrent callers", async () => {
    const mock = createMockKoha();
    const p = createTokenProvider(opts(mock.fetch));
    const tokens = await Promise.all(Array.from({ length: 10 }, () => p.getToken()));
    expect(new Set(tokens).size).toBe(1);
    expect(mock.calls).toHaveLength(1);
  });

  it("drops a token only when it is the cached one", async () => {
    const mock = createMockKoha();
    const p = createTokenProvider(opts(mock.fetch));
    const first = await p.getToken();
    p.invalidate("some-other-token");
    expect(await p.getToken()).toBe(first);
    p.invalidate(first);
    expect(await p.getToken()).not.toBe(first);
  });

  it("names the Koha setting when the grant type is disabled", async () => {
    const fetch = async () => new Response(JSON.stringify({ error: "Unimplemented grant type" }), { status: 400 });
    const err = await createTokenProvider(opts(fetch)).getToken().catch((e) => e);
    expect(err).toBeInstanceOf(KohaError);
    expect(err.kind).toBe("config");
    expect(err.message).toMatch(/RESTOAuth2ClientCredentials/);
  });

  it("reports rejected credentials as a setup problem and never echoes the secret", async () => {
    const fetch = async () => new Response(JSON.stringify({ error: "Invalid client" }), { status: 401 });
    const err = await createTokenProvider(opts(fetch)).getToken().catch((e) => e);
    expect(err.kind).toBe("auth");
    expect(err.failureKind).toBe("config");
    expect(err.message).not.toContain("the-secret");
  });

  it("an answer without a token is a bad response, not a token", async () => {
    const fetch = async () => new Response(JSON.stringify({ token_type: "Bearer" }), { status: 200 });
    const err = await createTokenProvider(opts(fetch)).getToken().catch((e) => e);
    expect(err.kind).toBe("bad_response");
  });

  it("an unreachable Koha is transient", async () => {
    const fetch = async () => { throw new TypeError("fetch failed"); };
    const err = await createTokenProvider(opts(fetch)).getToken().catch((e) => e);
    expect(err.kind).toBe("unreachable");
    expect(err.retryable).toBe(true);
  });
});
