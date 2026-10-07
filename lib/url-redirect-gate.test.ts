import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetUrlRedirectGate,
  decodeRequestPath,
  gateUrlRedirect,
  redirectLocation,
  resolveUrlRedirect,
  urlRedirectsEnabled,
  type UrlRedirectRow,
} from "@/lib/url-redirect-gate";

const KHMER_OLD = "/books/ថ្នាក់ទី៩-សិក្ាសង្គម";
const KHMER_NEW = "/books/ថ្នាក់ទី៩-សិក្សាសង្គម";

function rows(...list: UrlRedirectRow[]) {
  return new Map(list.map((r) => [r.old_path, r]));
}

describe("resolveUrlRedirect — pure", () => {
  it("301 → the target path", () => {
    const map = rows({ old_path: "/books/old", target_path: "/books/new", status: 301 });
    expect(resolveUrlRedirect("/books/old", map)).toEqual({ kind: "redirect", path: "/books/new" });
  });

  it("410 → gone", () => {
    const map = rows({ old_path: "/books/removed", target_path: null, status: 410 });
    expect(resolveUrlRedirect("/books/removed", map)).toEqual({ kind: "gone" });
  });

  it("an unknown path → none (the 404 stands)", () => {
    expect(resolveUrlRedirect("/books/never-existed", rows())).toEqual({ kind: "none" });
  });

  it("a self-target is never followed", () => {
    const map = rows({ old_path: "/books/loop", target_path: "/books/loop", status: 301 });
    expect(resolveUrlRedirect("/books/loop", map)).toEqual({ kind: "none" });
  });

  it("a malformed row is never followed", () => {
    expect(
      resolveUrlRedirect("/books/a", rows({ old_path: "/books/a", target_path: null, status: 301 })),
    ).toEqual({ kind: "none" });
    expect(
      resolveUrlRedirect("/books/a", rows({ old_path: "/books/a", target_path: "https://evil.example/x", status: 301 })),
    ).toEqual({ kind: "none" });
    expect(
      resolveUrlRedirect("/books/a", rows({ old_path: "/books/a", target_path: "/books/b", status: 302 })),
    ).toEqual({ kind: "none" });
    expect(
      resolveUrlRedirect("/books/a", rows({ old_path: "/books/a", target_path: "/books/b", status: 410 })),
    ).toEqual({ kind: "none" });
  });

  it("follows a deeper target (C7: /journals/articles/<slug>)", () => {
    const map = rows({ old_path: "/books/x", target_path: "/journals/articles/y", status: 301 });
    expect(resolveUrlRedirect("/books/x", map)).toEqual({ kind: "redirect", path: "/journals/articles/y" });
  });
});

describe("redirectLocation", () => {
  it("keeps the /km prefix", () => {
    expect(redirectLocation("/km", "/books/new", "")).toBe("/km/books/new");
  });

  it("keeps an English request unprefixed", () => {
    expect(redirectLocation("", "/books/new", "")).toBe("/books/new");
  });

  it("encodes a Khmer slug exactly once", () => {
    const location = redirectLocation("", KHMER_NEW, "");
    expect(location).toBe(`/books/${encodeURIComponent("ថ្នាក់ទី៩-សិក្សាសង្គម")}`);
    expect(location).not.toContain("%25"); // not double-encoded
    expect(decodeURIComponent(location)).toBe(KHMER_NEW);
  });

  it("keeps the query string", () => {
    expect(redirectLocation("/km", "/books/new", "?page=2&utm_source=x")).toBe("/km/books/new?page=2&utm_source=x");
  });
});

describe("decodeRequestPath", () => {
  it("decodes each segment once", () => {
    expect(decodeRequestPath(`/books/${encodeURIComponent("ថ្នាក់ទី៩-សិក្ាសង្គម")}`)).toBe(KHMER_OLD);
  });

  it("a malformed escape → null (and the gate answers none)", async () => {
    expect(decodeRequestPath("/books/%E0%A4")).toBeNull();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(gateUrlRedirect("/books/%E0%A4", { supabaseUrl: "http://db", anonKey: "k" })).resolves.toEqual({
      kind: "none",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("refuses an absurdly long path without decoding it", () => {
    expect(decodeRequestPath(`/books/${"a".repeat(2000)}`)).toBeNull();
  });
});

describe("urlRedirectsEnabled — the rollback switch", () => {
  it("is on by default and for any value but off", () => {
    expect(urlRedirectsEnabled({})).toBe(true);
    expect(urlRedirectsEnabled({ URL_REDIRECTS: "on" })).toBe(true);
    expect(urlRedirectsEnabled({ URL_REDIRECTS: "maybe" })).toBe(true);
  });

  it("only an explicit off disables it", () => {
    expect(urlRedirectsEnabled({ URL_REDIRECTS: "off" })).toBe(false);
    expect(urlRedirectsEnabled({ URL_REDIRECTS: " OFF " })).toBe(false);
  });
});

describe("gateUrlRedirect — snapshot behaviour", () => {
  const env = { supabaseUrl: "http://db.local", anonKey: "anon" };

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  beforeEach(() => {
    __resetUrlRedirectGate();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("answers a redirect from the snapshot, decoding the request path", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([{ old_path: KHMER_OLD, target_path: KHMER_NEW, status: 301 }])));
    const raw = `/books/${encodeURIComponent("ថ្នាក់ទី៩-សិក្ាសង្គម")}`;
    await expect(gateUrlRedirect(raw, env)).resolves.toEqual({ kind: "redirect", path: KHMER_NEW });
  });

  it("reads only the decision columns — never `reason`", async () => {
    const fetchSpy = vi.fn(async () => json([]));
    vi.stubGlobal("fetch", fetchSpy);
    await gateUrlRedirect("/books/x", env);
    const url = String((fetchSpy.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("select=old_path,target_path,status");
    expect(url).not.toContain("reason");
  });

  it.each([
    ["a 4xx", async () => json({ message: "permission denied" }, 401)],
    ["a 5xx", async () => json({ message: "boom" }, 503)],
    ["a throw", async () => { throw new TypeError("fetch failed"); }],
  ])("fails open on %s — null, so the caller serves the 404 it would have anyway", async (_label, impl) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    await expect(gateUrlRedirect("/books/x", env)).resolves.toBeNull();
  });

  it("is a no-op without credentials", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(gateUrlRedirect("/books/x", { supabaseUrl: "", anonKey: "" })).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a fresh, complete snapshot is authoritative: a miss makes no network call (C6)", async () => {
    const fetchSpy = vi.fn(async () => json([{ old_path: "/books/a", target_path: "/books/b", status: 301 }]));
    vi.stubGlobal("fetch", fetchSpy);
    await gateUrlRedirect("/books/a", env); // loads the snapshot
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await expect(gateUrlRedirect("/books/unknown-1", env)).resolves.toEqual({ kind: "none" });
    await expect(gateUrlRedirect("/books/unknown-2", env)).resolves.toEqual({ kind: "none" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("a snapshot at the row cap confirms a miss exactly once", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({
      old_path: `/books/old-${i}`,
      target_path: `/books/new-${i}`,
      status: 301,
    }));
    const fetchSpy = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("old_path=eq.")) {
        return json([{ old_path: "/books/beyond-cap", target_path: null, status: 410 }]);
      }
      return json(full);
    });
    vi.stubGlobal("fetch", fetchSpy);
    await expect(gateUrlRedirect("/books/beyond-cap", env)).resolves.toEqual({ kind: "gone" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const confirm = String((fetchSpy.mock.calls[1] as unknown[])[0]);
    expect(confirm).toContain("old_path=eq.%2Fbooks%2Fbeyond-cap");
    // The confirmed row is remembered: asking again costs nothing.
    await expect(gateUrlRedirect("/books/beyond-cap", env)).resolves.toEqual({ kind: "gone" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("a truncated snapshot whose confirming read fails falls open", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ old_path: `/books/o-${i}`, target_path: null, status: 410 }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => (String(input).includes("old_path=eq.") ? json({}, 500) : json(full))),
    );
    await expect(gateUrlRedirect("/books/elsewhere", env)).resolves.toBeNull();
  });

  it("serves a stale snapshot while one refresh runs", async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return calls === 1
          ? json([{ old_path: "/books/a", target_path: "/books/b", status: 301 }])
          : json([{ old_path: "/books/a", target_path: "/books/c", status: 301 }]);
      }),
    );
    await expect(gateUrlRedirect("/books/a", env)).resolves.toEqual({ kind: "redirect", path: "/books/b" });
    vi.advanceTimersByTime(121_000);
    // Stale: answered from the old snapshot, refresh kicked off in the background.
    await expect(gateUrlRedirect("/books/a", env)).resolves.toEqual({ kind: "redirect", path: "/books/b" });
    await vi.runAllTimersAsync();
    await expect(gateUrlRedirect("/books/a", env)).resolves.toEqual({ kind: "redirect", path: "/books/c" });
    expect(calls).toBe(2);
  });

  it("never asks for a path outside the stored shape", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(gateUrlRedirect("/", env)).resolves.toEqual({ kind: "none" });
    await expect(gateUrlRedirect("/Books/x", env)).resolves.toEqual({ kind: "none" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
