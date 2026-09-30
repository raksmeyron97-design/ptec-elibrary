// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

// The handler is CommonJS because Next loads it outside the bundler.
const require = createRequire(import.meta.url);
const IsrCacheHandler = require("./isr-cache-handler.js");
const { shortenCacheKey, LONG_COMPONENT_BYTES } = IsrCacheHandler;

// Production's first thesis: 110 Khmer characters, 312 bytes of UTF-8.
const KHMER_SLUG =
  "គុណភាពនៃការបង្រៀន-និង-រៀន-របាយការណ៍ស្រាវជ្រាវប្រតិបត្តិជ្រើសរើស-គរុនិស្សិត១២-៤-ជំនាន់ទី២-ឆ្នាំសិក្សា-២០២២-២០២៣";
const bytes = (s: string) => Buffer.byteLength(s, "utf8");

describe("shortenCacheKey", () => {
  it("is exercised by a slug that cannot be a file name", () => {
    expect(bytes(KHMER_SLUG)).toBe(312);
    expect(bytes(`${KHMER_SLUG}.segments`)).toBeGreaterThan(255);
  });

  it("leaves every key that could already be written exactly as it is", () => {
    for (const key of [
      "/en/theses/reading-fluency-grade-3.html",
      "/km/theses/ការសិក្សា.segments/__PAGE__.segment.rsc",
      "/en/books/" + "ក".repeat(80) + ".meta", // 240 bytes: the largest name left alone
      "a3f1c09e5b7d2e4f",
    ]) {
      expect(shortenCacheKey(key)).toBe(key);
    }
    expect(bytes("ក".repeat(80))).toBe(LONG_COMPONENT_BYTES);
  });

  it("renames an over-long component to a short, stable name that keeps its suffix", () => {
    const out = shortenCacheKey(`/en/theses/${KHMER_SLUG}.html`);
    expect(out.startsWith("/en/theses/គុណភាព")).toBe(true);
    expect(out).toMatch(/~[0-9a-f]{24}\.html$/);
    for (const part of out.split("/")) expect(bytes(part)).toBeLessThanOrEqual(255);
    expect(shortenCacheKey(`/en/theses/${KHMER_SLUG}.html`)).toBe(out);
  });

  it("gives every file of one entry the same name, however the cache derives it", () => {
    const html = shortenCacheKey(`/en/theses/${KHMER_SLUG}.html`);
    const stem = html.slice(0, -".html".length);
    // set() derives .meta and .segments from the .html path it was handed…
    const setMeta = html.replace(/\.html$/, ".meta");
    const setSegment = html.replace(/\.html$/, ".segments") + "/__PAGE__.segment.rsc";
    // …while get() builds each from the key.
    expect(shortenCacheKey(`/en/theses/${KHMER_SLUG}.meta`)).toBe(setMeta);
    expect(shortenCacheKey(`/en/theses/${KHMER_SLUG}.segments/__PAGE__.segment.rsc`)).toBe(setSegment);
    expect(shortenCacheKey(`/en/theses/${KHMER_SLUG}.rsc`)).toBe(`${stem}.rsc`);
  });

  it("never splits a character in the readable prefix", () => {
    const out = shortenCacheKey(`/${KHMER_SLUG}`).slice(1);
    const prefix = out.split("~")[0];
    expect(KHMER_SLUG.startsWith(prefix)).toBe(true);
    expect(prefix).not.toMatch(/�/);
  });

  it("keeps two different long slugs apart", () => {
    const other = KHMER_SLUG.replace("២០២២-២០២៣", "២០២៣-២០២៤");
    expect(shortenCacheKey(`/${other}.html`)).not.toBe(shortenCacheKey(`/${KHMER_SLUG}.html`));
  });
});

// The part that matters: a real round trip through Next's own FileSystemCache,
// which this handler extends. It fails if a Next upgrade moves the class or
// changes how it names files, instead of production quietly returning to
// ENAMETOOLONG.
describe("IsrCacheHandler, round trip on disk", () => {
  let dir: string;
  const nodeFs = {
    readFile: (f: string, enc?: BufferEncoding) => fs.promises.readFile(f, enc as never),
    writeFile: (f: string, d: string | Buffer) => fs.promises.writeFile(f, d),
    mkdir: (d: string) => fs.promises.mkdir(d, { recursive: true }),
    stat: (f: string) => fs.promises.stat(f).then((s) => ({ mtime: s.mtime })),
  };
  // Like .next/server: pages go to <serverDistDir>/app, the data cache to
  // <serverDistDir>/../cache/fetch-cache, so both stay inside the temp dir.
  const handler = () =>
    new IsrCacheHandler({
      fs: nodeFs,
      flushToDisk: true,
      serverDistDir: path.join(dir, "server"),
      revalidatedTags: [],
      maxMemoryCacheSize: 0,
    });
  const page = (html: string) => ({
    kind: "APP_PAGE",
    html,
    rscData: Buffer.from("rsc"),
    headers: { "x-next-cache-tags": "research_reports" },
    status: 200,
    postponed: undefined,
    segmentData: new Map([["/__PAGE__", Buffer.from("segment")]]),
  });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "isr-cache-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("writes a 312-byte Khmer slug to disk and reads it back", async () => {
    const key = `/en/theses/${KHMER_SLUG}`;
    await handler().set(key, page("<p>thesis</p>"), { isRoutePPREnabled: false, isFallback: false });

    const written = fs.readdirSync(path.join(dir, "server/app/en/theses"));
    expect(written.some((f) => f.endsWith(".html"))).toBe(true);
    expect(written.some((f) => f.endsWith(".meta"))).toBe(true);
    expect(written.some((f) => f.endsWith(".segments"))).toBe(true);

    // A fresh handler (as after a restart) has nothing in memory: this read is the disk.
    const hit = await handler().get(key, { kind: "APP_PAGE", isRoutePPREnabled: false, isFallback: false });
    expect(hit?.value?.html).toBe("<p>thesis</p>");
    expect(hit?.value?.headers?.["x-next-cache-tags"]).toBe("research_reports");
  });

  it("writes a short slug exactly where Next would", async () => {
    await handler().set("/en/theses/reading-fluency-grade-3", page("<p>short</p>"), {
      isRoutePPREnabled: false,
      isFallback: false,
    });
    expect(fs.existsSync(path.join(dir, "server/app/en/theses/reading-fluency-grade-3.html"))).toBe(true);
  });

  it("keeps Next's 2 MB limit on data-cache entries, which a custom handler would otherwise lift", async () => {
    const big = { kind: "FETCH", data: { body: "x".repeat(2 * 1024 * 1024 + 1), headers: {}, url: "" }, revalidate: 60 };
    await handler().set("a3f1c09e5b7d2e4f", big, { fetchCache: true, fetchUrl: "https://example/x" });
    expect(fs.existsSync(path.join(dir, "cache/fetch-cache/a3f1c09e5b7d2e4f"))).toBe(false);
  });
});
