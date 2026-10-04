import { describe, it, expect, vi, beforeEach } from "vitest";

// DNS is the attack surface (a public name that resolves to the LAN), so the
// tests decide what each name resolves to.
const resolved = new Map<string, { address: string; family: number }[]>();
vi.mock("node:dns", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:dns")>();
  const lookup = (host: string, _o: unknown, cb: (e: Error | null, a: unknown) => void) => {
    const hit = resolved.get(host);
    if (hit) cb(null, hit);
    else cb(Object.assign(new Error(`ENOTFOUND ${host}`), { code: "ENOTFOUND" }), []);
  };
  return { ...real, default: { ...real, lookup }, lookup };
});

const { checkPublicUrl, fetchPublicHtml, isPublicAddress } = await import("./public-fetch");

beforeEach(() => resolved.clear());

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1", "10.1.1.5", "172.17.0.1", "192.168.1.20", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
    "255.255.255.255", "198.18.0.1", "::1", "::", "fe80::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:7f00:1",
    "::ffff:c0a8:0114", "64:ff9b::a00:1", "2002:c0a8:0101::1", "ff02::1", "2001:db8::1", "not-an-ip",
  ])("refuses %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["151.101.1.69", "8.8.8.8", "2606:4700::6810:84e5", "::ffff:8.8.8.8"])("allows %s", (ip) =>
    expect(isPublicAddress(ip)).toBe(true),
  );
});

describe("checkPublicUrl", () => {
  it("accepts an ordinary publisher page", () => {
    expect(checkPublicUrl("https://link.springer.com/book/10.1007/978-0-387-09742-8").ok).toBe(true);
    expect(checkPublicUrl("http://example.org:80/x").ok).toBe(true);
  });

  it.each([
    ["ftp://example.org/x", "invalid_url"],
    ["file:///etc/passwd", "invalid_url"],
    ["javascript:alert(1)", "invalid_url"],
    ["not a url", "invalid_url"],
    ["https://user:pass@example.org/", "invalid_url"],
    ["https://example.org:8481/", "blocked_address"],
    ["http://localhost/", "blocked_address"],
    ["http://koha/", "blocked_address"],
    ["http://zimaos.local/", "blocked_address"],
    ["http://127.0.0.1/", "blocked_address"],
    ["http://[::1]/", "blocked_address"],
    ["http://192.168.1.10/", "blocked_address"],
    ["http://2130706433/", "blocked_address"], // 127.0.0.1 as one number — URL normalises it
  ])("refuses %s", (url, reason) => expect(checkPublicUrl(url)).toEqual({ ok: false, reason }));
});

describe("fetchPublicHtml", () => {
  const opts = { userAgent: "test", timeoutMs: 3_000 };

  it("refuses a public-looking name that resolves to the LAN, before any socket", async () => {
    resolved.set("rebind.example.org", [{ address: "192.168.1.20", family: 4 }]);
    expect(await fetchPublicHtml("http://rebind.example.org/", opts)).toEqual({ ok: false, reason: "blocked_address" });
  });

  it("refuses when ANY of a name's addresses is private", async () => {
    resolved.set("mixed.example.org", [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }]);
    expect(await fetchPublicHtml("http://mixed.example.org/", opts)).toEqual({ ok: false, reason: "blocked_address" });
  });

  it("reports a name that does not resolve as unreachable", async () => {
    expect(await fetchPublicHtml("http://nowhere.example.org/", opts)).toEqual({ ok: false, reason: "unreachable" });
  });
});
