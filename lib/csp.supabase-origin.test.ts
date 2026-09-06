import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The CSP must follow NEXT_PUBLIC_SUPABASE_URL. Before this pin, both policies
 * hardcoded `*.supabase.co` and the env escape hatch fired only for http://,
 * so an https self-hosted gateway would have been blocked by connect-src on
 * every page — the single largest cutover risk in the migration audit — and
 * no test would have noticed. lib/csp.ts reads the env at module load, so
 * each case re-imports it.
 */
async function policyFor(url: string | undefined) {
  vi.resetModules();
  if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  const mod = await import("./csp");
  return mod.buildPublicCsp({ withEval: false });
}
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  vi.resetModules();
});

describe("CSP follows the configured Supabase origin", () => {
  it("self-hosted https gateway: connect-src gets the origin AND its wss:// twin; img-src gets the origin", async () => {
    const csp = await policyFor("https://supabase.storage-ptec.online");
    const connect = directive(csp, "connect-src");
    expect(connect).toContain(" https://supabase.storage-ptec.online");
    expect(connect).toContain(" wss://supabase.storage-ptec.online");
    expect(directive(csp, "img-src")).toContain(" https://supabase.storage-ptec.online");
  });

  it("plain-http local stack: http:// and ws:// on the same host:port", async () => {
    const csp = await policyFor("http://192.168.0.157:54331");
    const connect = directive(csp, "connect-src");
    expect(connect).toContain(" http://192.168.0.157:54331");
    expect(connect).toContain(" ws://192.168.0.157:54331");
  });

  it("Supabase Cloud: no duplicate — the legacy wildcard already covers it", async () => {
    const csp = await policyFor("https://ufeymdoqksojwyysicun.supabase.co");
    const connect = directive(csp, "connect-src");
    expect(connect).toContain("https://*.supabase.co wss://*.supabase.co");
    expect(connect).not.toContain("ufeymdoqksojwyysicun");
  });

  it("keeps the legacy Cloud wildcard during the migration window (rollback safety)", async () => {
    const csp = await policyFor("https://supabase.storage-ptec.online");
    expect(directive(csp, "connect-src")).toContain("https://*.supabase.co wss://*.supabase.co");
  });

  it("missing or malformed URL: policy unchanged, nothing throws", async () => {
    const base = await policyFor(undefined);
    expect(await policyFor("not a url")).toBe(base);
    expect(base).not.toContain("undefined");
    expect(base).not.toContain("null");
  });

  it("never emits the internal Docker address — browsers cannot reach it", async () => {
    process.env.SUPABASE_INTERNAL_URL = "http://kong:8000";
    try {
      const csp = await policyFor("https://supabase.storage-ptec.online");
      expect(csp).not.toContain("kong:8000");
    } finally {
      delete process.env.SUPABASE_INTERNAL_URL;
    }
  });
});
