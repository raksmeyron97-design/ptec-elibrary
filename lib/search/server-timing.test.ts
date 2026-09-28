import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ServerTiming, parseServerTiming } from "./server-timing";

describe("Server-Timing for the search route", () => {
  it("times each leg, passes its value through, and ends with the total", async () => {
    const t = new ServerTiming();
    expect(await t.time("catalog", Promise.resolve(42))).toBe(42);
    t.note("cache", "miss");
    const header = t.header();
    expect(header).toMatch(/^catalog;dur=\d+\.\d, cache;desc="miss", total;dur=\d+\.\d$/);
    const parsed = parseServerTiming(header);
    expect(Object.keys(parsed)).toEqual(["catalog", "total"]);
    expect(parsed.total).toBeGreaterThanOrEqual(parsed.catalog);
  });

  it("records a leg that throws, and rethrows it unchanged", async () => {
    const t = new ServerTiming();
    const boom = new Error("leg failed");
    await expect(t.time("book", Promise.reject(boom))).rejects.toBe(boom);
    expect(parseServerTiming(t.header())).toHaveProperty("book");
  });

  it("never emits a name or description the header grammar would reject", () => {
    const t = new ServerTiming();
    t.note("learning path", 'a "quoted" \\ value');
    expect(t.header()).toMatch(/^learning_path;desc="a quoted  value", total;dur=/);
  });

  it("parses what other servers send, ignoring metrics without a duration", () => {
    expect(parseServerTiming('cfL4;desc="x", book;dur=12.5, db;dur=3;desc="q"')).toEqual({ book: 12.5, db: 3 });
    expect(parseServerTiming(null)).toEqual({});
  });

  it("is sent by every answer of the native route after the query is read", () => {
    // Source scan: each Response.json that carries search results must carry the header,
    // or the benchmark reads a leg as missing rather than as slow.
    const src = readFileSync(join(process.cwd(), "app/api/search/native/route.ts"), "utf8");
    const answers = src.slice(src.indexOf("const cacheKey = JSON.stringify"));
    const responses = answers.match(/Response\.json\([^;]*;/g) ?? [];
    expect(responses.length).toBeGreaterThanOrEqual(5);
    for (const r of responses) expect(r).toMatch(/"Server-Timing"|withTiming\(/);
  });
});
