// lib/analytics/counting.test.ts
//
// Two things are pinned here.
//
// 1. THE RULE the public lifetime counters apply (pure, offline).
//
// 2. THE RPC ARGUMENT NAME, by scanning the source. This is the defect the
//    whole change exists to fix: `increment_view_count` / `increment_download_count`
//    have been declared `(row_id uuid)` since the initial schema, every books
//    call site passed `book_id`, and PostgREST resolves functions BY ARGUMENT
//    NAME — so the call answered 404 PGRST202 instead of throwing. Nothing
//    failed loudly, no type checked it, and `books.view_count` simply stopped
//    moving while the theses and publications counters (which pass `row_id`)
//    kept working. A unit test of the functions cannot see this; only a scan
//    of the call sites can.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COUNT_DEDUPE_WINDOW_MS,
  decideLifetimeCount,
  dedupeWindowStart,
  viewerIdentity,
  type ViewerIdentity,
} from "./counting";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const USER: ViewerIdentity = { column: "user_id", value: "u-1" };
const GUEST: ViewerIdentity = { column: "session_hash", value: "abc123" };

describe("dedupe window", () => {
  it("is a rolling 24 hours, not a calendar day", () => {
    expect(COUNT_DEDUPE_WINDOW_MS).toBe(86_400_000);
    const now = new Date("2026-09-23T03:15:00.000Z");
    expect(dedupeWindowStart(now)).toBe("2026-09-22T03:15:00.000Z");
  });

  it("has no boundary a Phnom Penh reading session can straddle", () => {
    // UTC midnight is 07:00 in Cambodia. Two views either side of it are one
    // viewer in one morning, and must collapse to one count.
    const before = new Date("2026-09-22T23:55:00.000Z"); // 06:55 local
    const after = new Date("2026-09-23T00:05:00.000Z"); // 07:05 local
    expect(new Date(dedupeWindowStart(after)).getTime()).toBeLessThan(before.getTime());
  });
});

describe("viewerIdentity", () => {
  it("prefers the account over the session hash", () => {
    // A reader who signs in mid-session must not be counted twice.
    expect(viewerIdentity({ userId: "u-1", sessionHash: "abc123" })).toEqual(USER);
  });

  it("falls back to the anonymous session hash", () => {
    expect(viewerIdentity({ userId: null, sessionHash: "abc123" })).toEqual(GUEST);
  });

  it("is null when nothing identifies the viewer", () => {
    expect(viewerIdentity({ userId: null, sessionHash: null })).toBeNull();
  });
});

describe("decideLifetimeCount", () => {
  it("counts a first view from a signed-in reader", () => {
    expect(decideLifetimeCount({ isBot: false, identity: USER, countedWithinWindow: false })).toBe("count");
  });

  it("counts a first view from a guest — the badge is not signed-in-only", () => {
    expect(decideLifetimeCount({ isBot: false, identity: GUEST, countedWithinWindow: false })).toBe("count");
  });

  it("refuses a repeat inside the window", () => {
    expect(decideLifetimeCount({ isBot: false, identity: USER, countedWithinWindow: true })).toBe("repeat");
    expect(decideLifetimeCount({ isBot: false, identity: GUEST, countedWithinWindow: true })).toBe("repeat");
  });

  it("never counts a bot, even a first-time one", () => {
    expect(decideLifetimeCount({ isBot: true, identity: GUEST, countedWithinWindow: false })).toBe("bot");
  });

  it("checks for a bot before anything else", () => {
    // A bot with no identity is still reported as a bot: the two skips have
    // different causes and the telemetry must not confuse them.
    expect(decideLifetimeCount({ isBot: true, identity: null, countedWithinWindow: false })).toBe("bot");
  });

  it("refuses a viewer it cannot deduplicate", () => {
    // sessionHash is null only when the HMAC secret is missing. Counting then
    // would turn the badge into a refresh counter.
    expect(decideLifetimeCount({ isBot: false, identity: null, countedWithinWindow: false })).toBe("unidentified");
  });
});

// ── The scan ────────────────────────────────────────────────────────────────

const COUNTER_CALL_SITES = [
  "app/actions/view-count.ts",
  "app/actions/download.ts",
  "app/actions/theses.ts",
  "app/actions/publications.ts",
  "app/api/books/[slug]/download/route.ts",
  "app/api/theses/[id]/download/route.ts",
];

/** Every `.rpc("increment_*_count", { ... })` argument object in a file. */
function counterRpcArgs(source: string): string[] {
  return [...source.matchAll(/\.rpc\(\s*"(increment_\w*count)"\s*,\s*\{([^}]*)\}/g)].map(
    (m) => `${m[1]}(${m[2].trim()})`,
  );
}

describe("counter RPC call sites", () => {
  const calls = COUNTER_CALL_SITES.flatMap((f) => counterRpcArgs(read(f)).map((c) => ({ file: f, call: c })));

  it("finds the call sites at all", () => {
    // Guards the assertions below, which would pass vacuously on a bad regex.
    expect(calls.length).toBeGreaterThanOrEqual(6);
    expect(new Set(calls.map((c) => c.file)).size).toBe(COUNTER_CALL_SITES.length);
  });

  it("passes row_id — the name every increment_*_count function declares", () => {
    const wrong = calls.filter((c) => !/\brow_id\s*:/.test(c.call)).map((c) => `${c.file}: ${c.call}`);
    expect(wrong).toEqual([]);
  });

  it("never passes book_id, which resolves to no function and answers 404", () => {
    const bookId = calls.filter((c) => /\bbook_id\s*:/.test(c.call)).map((c) => `${c.file}: ${c.call}`);
    expect(bookId).toEqual([]);
  });

  it("keeps every increment_*_count function declared with a row_id parameter", () => {
    // If the SQL is ever renamed, the assertions above would enforce a name
    // the database no longer has.
    const schema = read("supabase/migrations/00000000000000_initial_schema.sql");
    const declared = [...schema.matchAll(/FUNCTION public\.(increment_\w*count)\((\w+) uuid\)/g)];
    expect(declared.length).toBeGreaterThanOrEqual(4);
    expect(declared.filter((d) => d[2] !== "row_id").map((d) => d[1])).toEqual([]);
  });
});

describe("the download counter is not applied twice", () => {
  it("leaves book_files.download_count to the RPC that already bumps it", () => {
    // increment_download_count(row_id) updates books AND book_files. A second
    // read-then-write on book_files in the same path double-counts the file.
    const src = read("app/actions/download.ts");
    expect(src).not.toMatch(/from\("book_files"\)[\s\S]{0,200}?\.update\(\s*\{\s*download_count/);
  });
});
