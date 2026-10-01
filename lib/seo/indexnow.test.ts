import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changedUrls, indexNowKey, indexNowPayload } from "./indexnow";
import { localeUrls } from "./alternates";

// ── The pure rules ─────────────────────────────────────────────────────────

describe("indexNowKey", () => {
  it("accepts the protocol's alphabet and length, and nothing else", () => {
    expect(indexNowKey("0123456789abcdef")).toBe("0123456789abcdef");
    expect(indexNowKey("  A1b2-C3d4  ")).toBe("A1b2-C3d4");
    for (const bad of [undefined, null, "", "short", "has space in it", "bad/char/x", "x".repeat(129)]) {
      expect(indexNowKey(bad)).toBeNull();
    }
  });
});

describe("changedUrls", () => {
  it("announces both locales of each path, encoded exactly as the canonicals are", () => {
    const urls = changedUrls(["/books/រលក", "/theses/a"]);
    const { en, km } = localeUrls("/books/រលក");
    expect(urls).toEqual([new URL(en).href, new URL(km).href, new URL(localeUrls("/theses/a").en).href, new URL(localeUrls("/theses/a").km).href]);
    expect(urls[0]).toMatch(/\/books\/%E1%9E%9A%E1%9E%9B%E1%9E%80$/);
  });
  it("drops duplicates and anything that is not a path", () => {
    expect(changedUrls(["/posts/x", "/posts/x", "https://evil.example/x", "posts/y"])).toHaveLength(2);
  });
});

describe("indexNowPayload", () => {
  const site = new URL(localeUrls("/").en).origin;
  it("names this host, the key and where the key file lives", () => {
    const p = indexNowPayload(site, "0123456789abcdef", ["/paths/x"]);
    expect(p).toEqual({
      host: new URL(site).host,
      key: "0123456789abcdef",
      keyLocation: `${site}/0123456789abcdef.txt`,
      urlList: changedUrls(["/paths/x"]),
    });
  });
  it("is null when nothing on this host changed — and an engine would refuse a foreign URL", () => {
    expect(indexNowPayload(site, "0123456789abcdef", [])).toBeNull();
    expect(indexNowPayload("https://other.example", "0123456789abcdef", ["/paths/x"])).toBeNull();
  });
});

// ── The three switches (lib/seo/indexnow.server.ts) ───────────────────────

const after = vi.fn();
const indexable = vi.fn(() => true);
const siteConfig = vi.fn(async () => ({ seo: { indexingEnabled: true } }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => after(fn) }));
vi.mock("@/lib/seo/indexing", () => ({ isIndexableEnvironment: () => indexable() }));
vi.mock("@/lib/system-settings/config", () => ({ getSiteConfig: () => siteConfig() }));

describe("announcePublicChange", () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
  beforeEach(() => {
    after.mockReset();
    indexable.mockReturnValue(true);
    siteConfig.mockResolvedValue({ seo: { indexingEnabled: true } });
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function run(paths: string[]) {
    const { announcePublicChange } = await import("./indexnow.server");
    announcePublicChange(paths);
    for (const [fn] of after.mock.calls) await (fn as () => Promise<void>)();
  }

  it("sends nothing without a key", async () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    await run(["/books/x"]);
    expect(after).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing from a non-indexable environment, even with a key", async () => {
    vi.stubEnv("INDEXNOW_KEY", "0123456789abcdef");
    indexable.mockReturnValue(false);
    await run(["/books/x"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing while the System Settings indexing switch is off", async () => {
    vi.stubEnv("INDEXNOW_KEY", "0123456789abcdef");
    siteConfig.mockResolvedValue({ seo: { indexingEnabled: false } });
    await run(["/books/x"]);
    expect(after).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts both locales of the changed record, after the response, when all three say yes", async () => {
    vi.stubEnv("INDEXNOW_KEY", "0123456789abcdef");
    await run(["/books/x"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.indexnow.org/indexnow");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body)).urlList).toEqual(changedUrls(["/books/x"]));
  });

  it("a failed ping is a log line, never a thrown error", async () => {
    vi.stubEnv("INDEXNOW_KEY", "0123456789abcdef");
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(run(["/books/x"])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

// ── The key file ───────────────────────────────────────────────────────────

describe("GET /{key}.txt", () => {
  afterEach(() => vi.unstubAllEnvs());
  const get = async (key: string) => {
    const { GET } = await import("@/app/api/indexnow-key/[key]/route");
    return GET(new Request(`https://x/${key}.txt`), { params: Promise.resolve({ key }) });
  };

  it("answers the configured key, as text", async () => {
    vi.stubEnv("INDEXNOW_KEY", "0123456789abcdef");
    const res = await get("0123456789abcdef");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("0123456789abcdef");
  });
  it("is a 404 for any other key, and for every key while IndexNow is off", async () => {
    vi.stubEnv("INDEXNOW_KEY", "0123456789abcdef");
    expect((await get("fedcba9876543210")).status).toBe(404);
    vi.stubEnv("INDEXNOW_KEY", "");
    expect((await get("0123456789abcdef")).status).toBe(404);
  });
  it("is reached through an afterFiles rewrite too short to catch robots.txt or llms.txt", () => {
    const config = readFileSync(path.resolve(__dirname, "../../next.config.ts"), "utf8");
    const after = config.slice(config.indexOf("afterFiles:"));
    expect(after).toMatch(/source: "\/:key\(\[A-Za-z0-9-\]\{8,128\}\)\.txt",\s*destination: "\/api\/indexnow-key\/:key"/);
  });
});
