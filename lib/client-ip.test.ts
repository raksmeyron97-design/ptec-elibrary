import { describe, expect, it } from "vitest";
import { clientIp, clientIpOrUndefined, getClientIp, isPrivateAddress } from "@/lib/client-ip";

function h(map: Record<string, string>) {
  return new Headers(map);
}

describe("isPrivateAddress", () => {
  it("classifies the Docker/LAN addresses this deployment sits behind", () => {
    // The two addresses that showed up as "the visitor" after the ZimaOS move.
    expect(isPrivateAddress("172.17.0.1")).toBe(true);
    expect(isPrivateAddress("10.1.1.146")).toBe(true);
    expect(isPrivateAddress("192.168.1.10")).toBe(true);
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("::ffff:10.0.0.4")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
    expect(isPrivateAddress("")).toBe(true);
    expect(isPrivateAddress("unknown")).toBe(true);
  });

  it("leaves public addresses alone", () => {
    expect(isPrivateAddress("203.0.113.9")).toBe(false);
    expect(isPrivateAddress("172.32.0.1")).toBe(false); // just outside 172.16/12
    expect(isPrivateAddress("2001:db8::1")).toBe(false);
  });
});

describe("getClientIp", () => {
  it("prefers cf-connecting-ip — the only header cloudflared guarantees", () => {
    expect(
      getClientIp(h({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "172.17.0.1" })),
    ).toBe("203.0.113.9");
  });

  it("ignores a spoofed cf-connecting-ip that is a private address", () => {
    expect(
      getClientIp(h({ "cf-connecting-ip": "10.0.0.1", "x-forwarded-for": "203.0.113.9" })),
    ).toBe("203.0.113.9");
  });

  it("falls back to true-client-ip then x-real-ip", () => {
    expect(getClientIp(h({ "true-client-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(getClientIp(h({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("skips private hops in x-forwarded-for and reads right-to-left", () => {
    // Cloudflare appends the real client; Docker/proxy hops trail it.
    expect(getClientIp(h({ "x-forwarded-for": "203.0.113.9, 172.17.0.1" }))).toBe("203.0.113.9");
    expect(getClientIp(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("keeps the closest hop when nothing public exists (local dev)", () => {
    expect(getClientIp(h({ "x-forwarded-for": "127.0.0.1" }))).toBe("127.0.0.1");
  });

  it("returns null when no forwarding headers are present at all", () => {
    expect(getClientIp(h({}))).toBeNull();
    expect(clientIp(h({}))).toBe("unknown");
    expect(clientIpOrUndefined(h({}))).toBeUndefined();
  });
});
