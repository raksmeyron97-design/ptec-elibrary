import { describe, it, expect } from "vitest";
import { createKohaClient } from "./client";
import { resolveKohaConfig } from "./config";
import { checkKohaHealth } from "./health";
import { createMockKoha } from "./mock";

describe("checkKohaHealth", () => {
  it("off reports not ready and calls nothing", async () => {
    const cfg = resolveKohaConfig({});
    const h = await checkKohaHealth(cfg, createKohaClient(cfg));
    expect(h).toMatchObject({ mode: "off", ready: false, checks: [] });
  });

  it("mock with the default library is ready", async () => {
    const cfg = resolveKohaConfig({ KOHA_INTEGRATION: "mock", KOHA_LIBRARY_ID: "PTEC" });
    const h = await checkKohaHealth(cfg, createKohaClient(cfg));
    expect(h.ready).toBe(true);
    expect(h.version).toBe("26.05.03.000");
    expect(h.checks.map((c) => c.name)).toEqual(["version", "libraries", "library"]);
  });

  it("names a library code Koha does not have", async () => {
    const cfg = resolveKohaConfig({ KOHA_INTEGRATION: "mock", KOHA_LIBRARY_ID: "NOPE" });
    const h = await checkKohaHealth(cfg, createKohaClient(cfg));
    expect(h.ready).toBe(false);
    expect(h.checks.find((c) => c.name === "library")?.detail).toMatch(/"NOPE" does not exist in Koha/);
  });

  it("an older Koha without /status/version is not treated as broken", async () => {
    const mock = createMockKoha({ version: null });
    const cfg = resolveKohaConfig({ KOHA_INTEGRATION: "mock" });
    const h = await checkKohaHealth(cfg, createKohaClient(cfg, { fetch: mock.fetch }));
    expect(h.checks[0]).toMatchObject({ name: "version", ok: true });
    expect(h.ready).toBe(true);
  });

  it("stops after an auth failure instead of repeating it", async () => {
    const cfg = resolveKohaConfig({
      KOHA_INTEGRATION: "read", KOHA_BASE_URL: "http://koha.test", KOHA_CLIENT_ID: "x", KOHA_CLIENT_SECRET: "y",
    });
    const fetch = async () => new Response(JSON.stringify({ error: "Invalid client" }), { status: 401 });
    const h = await checkKohaHealth(cfg, createKohaClient(cfg, { fetch, sleep: async () => {} }));
    expect(h.ready).toBe(false);
    expect(h.checks).toHaveLength(1);
    expect(h.checks[0].detail).toMatch(/rejected the API client credentials/);
  });
});
