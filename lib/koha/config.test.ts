import { describe, it, expect } from "vitest";
import { resolveKohaConfig, normalizeKohaBaseUrl, isPrivateHost, kohaCanRead, kohaCanWrite } from "./config";

const REAL = {
  KOHA_INTEGRATION: "read",
  KOHA_BASE_URL: "http://koha:8080",
  KOHA_CLIENT_ID: "client-id",
  KOHA_CLIENT_SECRET: "super-secret-value",
};

describe("resolveKohaConfig — off unless deliberately switched on", () => {
  it.each([undefined, "", "on", "true", "yes", "READ ONLY", "enabled"])("KOHA_INTEGRATION=%s is off", (v) => {
    const cfg = resolveKohaConfig({ ...REAL, KOHA_INTEGRATION: v });
    expect(cfg.mode).toBe("off");
    expect(kohaCanRead(cfg)).toBe(false);
  });

  it("says so when a value was given and ignored", () => {
    expect(resolveKohaConfig({ KOHA_INTEGRATION: "enabled" }).warnings.join(" ")).toMatch(/treated as off/);
    expect(resolveKohaConfig({ KOHA_INTEGRATION: "off" }).warnings).toEqual([]);
  });

  it("accepts the four modes, case-insensitively", () => {
    for (const m of ["off", "mock", "read", "write"]) expect(resolveKohaConfig({ KOHA_INTEGRATION: m.toUpperCase() }).mode).toBe(m);
  });

  it("mock needs no URL or credentials", () => {
    const cfg = resolveKohaConfig({ KOHA_INTEGRATION: "mock" });
    expect(cfg.problems).toEqual([]);
    expect(kohaCanRead(cfg)).toBe(true);
    expect(kohaCanWrite(cfg)).toBe(false);
  });

  it("read/write refuse to run half-configured, naming variables and never values", () => {
    const cfg = resolveKohaConfig({ KOHA_INTEGRATION: "write", KOHA_CLIENT_SECRET: "super-secret-value" });
    expect(cfg.problems).toEqual(["KOHA_BASE_URL is not set.", "KOHA_CLIENT_ID is not set."]);
    expect(kohaCanRead(cfg)).toBe(false);
    expect(kohaCanWrite(cfg)).toBe(false);
    expect(JSON.stringify([cfg.problems, cfg.warnings])).not.toContain("super-secret-value");
  });

  it("only write mode may write", () => {
    expect(kohaCanWrite(resolveKohaConfig(REAL))).toBe(false);
    expect(kohaCanWrite(resolveKohaConfig({ ...REAL, KOHA_INTEGRATION: "write" }))).toBe(true);
  });

  it("warns about plain http to a public host, not to the docker network", () => {
    expect(resolveKohaConfig(REAL).warnings).toEqual([]);
    expect(resolveKohaConfig({ ...REAL, KOHA_BASE_URL: "http://koha.example.org" }).warnings.join(" ")).toMatch(/unencrypted/);
    expect(resolveKohaConfig({ ...REAL, KOHA_BASE_URL: "https://koha.example.org" }).warnings).toEqual([]);
  });

  it("bounds the library code to Koha's 10 characters and reads a timeout", () => {
    expect(resolveKohaConfig({ ...REAL, KOHA_LIBRARY_ID: "ABCDEFGHIJK" }).problems.join(" ")).toMatch(/10-character/);
    expect(resolveKohaConfig({ ...REAL, KOHA_TIMEOUT_MS: "2500" }).timeoutMs).toBe(2500);
    expect(resolveKohaConfig({ ...REAL, KOHA_TIMEOUT_MS: "-1" }).timeoutMs).toBe(8000);
  });
});

describe("normalizeKohaBaseUrl", () => {
  it("strips a trailing slash and a trailing /api/v1", () => {
    expect(normalizeKohaBaseUrl("https://koha.ptec.local/")).toEqual({ url: "https://koha.ptec.local" });
    expect(normalizeKohaBaseUrl("http://koha:8080/api/v1/")).toEqual({ url: "http://koha:8080" });
  });

  it.each([
    ["ftp://koha", /http or https/],
    ["https://user:pw@koha", /credentials/],
    ["https://koha/?x=1", /query/],
    ["not a url", /valid URL/],
  ])("refuses %s", (raw, msg) => {
    const r = normalizeKohaBaseUrl(raw);
    expect("error" in r && r.error).toMatch(msg);
  });
});

describe("isPrivateHost", () => {
  it.each(["localhost", "koha", "koha.local", "10.0.0.5", "192.168.1.20", "172.20.0.3", "100.102.90.52", "127.0.0.1"])("%s is private", (h) => {
    expect(isPrivateHost(h)).toBe(true);
  });
  it.each(["koha.example.org", "8.8.8.8", "172.32.0.1"])("%s is public", (h) => {
    expect(isPrivateHost(h)).toBe(false);
  });
});
