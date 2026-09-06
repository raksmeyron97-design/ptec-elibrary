import { afterEach, describe, expect, it } from "vitest";
import { authCookieName, isSupabaseHost, serverSupabaseUrl, supabaseOrigins } from "./origin";

const saved = { ...process.env };
afterEach(() => {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_INTERNAL_URL", "SUPABASE_URL"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("supabaseOrigins", () => {
  it("derives http and websocket origins for the self-hosted gateway", () => {
    expect(supabaseOrigins("https://supabase.storage-ptec.online")).toEqual({
      http: "https://supabase.storage-ptec.online",
      ws: "wss://supabase.storage-ptec.online",
      host: "supabase.storage-ptec.online",
    });
  });

  it("keeps a port and downgrades to ws:// for a plain-http local stack", () => {
    expect(supabaseOrigins("http://127.0.0.1:54331/")).toEqual({
      http: "http://127.0.0.1:54331",
      ws: "ws://127.0.0.1:54331",
      host: "127.0.0.1",
    });
  });

  it("never throws: missing, empty and garbage all yield null", () => {
    expect(supabaseOrigins(undefined)).toBeNull();
    expect(supabaseOrigins("")).toBeNull();
    expect(supabaseOrigins("not a url")).toBeNull();
    expect(supabaseOrigins("ftp://x")).toBeNull();
  });
});

describe("serverSupabaseUrl", () => {
  it("prefers the internal URL when the box sets one", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.storage-ptec.online";
    process.env.SUPABASE_INTERNAL_URL = "http://kong:8000";
    expect(serverSupabaseUrl()).toBe("http://kong:8000");
  });

  it("falls back to the public URL — Cloud behaviour unchanged", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    delete process.env.SUPABASE_INTERNAL_URL;
    expect(serverSupabaseUrl()).toBe("https://abc.supabase.co");
  });

  it("ignores an empty override", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_INTERNAL_URL = "";
    expect(serverSupabaseUrl()).toBe("https://abc.supabase.co");
  });
});

describe("isSupabaseHost", () => {
  it("matches the configured host exactly and Cloud hosts by suffix", () => {
    expect(isSupabaseHost("supabase.storage-ptec.online", "supabase.storage-ptec.online")).toBe(true);
    expect(isSupabaseHost("abc.supabase.co", "supabase.storage-ptec.online")).toBe(true);
    expect(isSupabaseHost("abc.supabase.co", null)).toBe(true);
  });

  it("does not match the app's own storage hosts or look-alikes", () => {
    expect(isSupabaseHost("api.storage-ptec.online", "supabase.storage-ptec.online")).toBe(false);
    expect(isSupabaseHost("evil-supabase.co", "supabase.storage-ptec.online")).toBe(false);
    expect(isSupabaseHost("supabase.co.evil.example", null)).toBe(false);
  });
});

describe("authCookieName", () => {
  it("names the cookie after the PUBLIC host's first label, like @supabase/ssr does", () => {
    expect(authCookieName("https://supabase.storage-ptec.online")).toBe("sb-supabase-auth-token");
    expect(authCookieName("https://ufeymdoqksojwyysicun.supabase.co")).toBe("sb-ufeymdoqksojwyysicun-auth-token");
    expect(authCookieName("http://127.0.0.1:54331")).toBe("sb-127-auth-token");
  });
  it("never depends on the internal URL, and never throws", () => {
    // The browser only ever sees the public URL; the cookie name must not
    // change because the server was told to call kong directly.
    expect(authCookieName("https://supabase.storage-ptec.online")).not.toBe("sb-kong-auth-token");
    expect(authCookieName(undefined)).toBe("sb-supabase-auth-token");
    expect(authCookieName("not a url")).toBe("sb-supabase-auth-token");
  });
});

