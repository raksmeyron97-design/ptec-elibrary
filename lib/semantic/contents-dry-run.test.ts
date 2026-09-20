// The SEO5-08 dry run reads PRODUCTION. Its safety properties are asserted
// here rather than described in its header, because a comment saying
// "read-only" is worth exactly nothing next to an `.update()` somebody added
// later.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "scripts/audit-book-contents.ts"), "utf8");

/** Comments quote the very calls these rules forbid. */
const body = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the contents dry run cannot write", () => {
  it.each([".insert(", ".update(", ".upsert(", ".delete(", ".rpc("])(
    "contains no %s",
    (call) => {
      expect(body).not.toContain(call);
    },
  );

  it("reads through .select() only", () => {
    expect(body).toContain(".select(");
  });
});

describe("the dry run is bounded the way the owner asked", () => {
  it("prints the target host BEFORE it connects", () => {
    // "Stop and ask if it's not what you expect" only works if the operator
    // is told first. The log line must precede createClient().
    expect(body.indexOf("target host")).toBeGreaterThan(-1);
    expect(body.indexOf("target host")).toBeLessThan(body.indexOf("createClient("));
  });

  it("refuses to run without explicitly-named credentials", () => {
    // Deliberately NOT the app's own NEXT_PUBLIC_SUPABASE_URL: a stray .env
    // pointing at production is exactly how a laptop backfill once wrote
    // `unfetchable` against 203 healthy books.
    expect(body).toContain("AUDIT_SUPABASE_URL");
    expect(body).toContain("AUDIT_SUPABASE_SERVICE_ROLE_KEY");
    expect(body).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(body).toMatch(/process\.exit\(2\)/);
  });

  it("bounds the batch, the pause and the request", () => {
    expect(body).toMatch(/BOOK_BATCH\s*=\s*(\d+)/);
    expect(Number(/BOOK_BATCH\s*=\s*(\d+)/.exec(body)?.[1])).toBeLessThanOrEqual(100);
    expect(body).toMatch(/BATCH_PAUSE_MS\s*=\s*\d+/);
    expect(body).toMatch(/AbortSignal\.timeout\(REQUEST_TIMEOUT_MS\)/);
  });

  it("reads only the front and back windows, never a whole book", () => {
    expect(Number(/FRONT_WINDOW\s*=\s*(\d+)/.exec(body)?.[1])).toBe(30);
    expect(Number(/BACK_WINDOW\s*=\s*(\d+)/.exec(body)?.[1])).toBe(15);
    // The front window is bounded by a page-number filter, not by a limit
    // that happens to be small.
    expect(body).toMatch(/\.lte\("page_no", FRONT_WINDOW\)/);
    expect(body).toMatch(/\.gte\("page_no", backFrom\)/);
  });

  it("counts front and back contents separately", () => {
    // classifyPage decides "contents" by POSITION, so a Khmer book printing
    // មាតិកា at the end is `back-matter`. Folding them together would report
    // "Khmer detection still broken" when the truth is "Khmer books put it
    // somewhere else".
    expect(body).toContain("frontContents");
    expect(body).toContain("backContents");
  });

  it("prints counts, never page text", () => {
    // The one thing that would turn a counts-only report into a data dump.
    expect(body).not.toMatch(/console\.log\([^)]*\bcontent\b/);
    expect(body).not.toMatch(/console\.log\([^)]*\.title/);
  });
});
