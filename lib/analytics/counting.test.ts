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

describe("every books path that moves a counter asks the rule first", () => {
  // `downloadBook()` used to sit in app/actions/download.ts and bump
  // `books.download_count` on every call with no dedupe at all. Nothing
  // imported it, but a "use server" export in a module the graph already
  // contains is a live action id, so a public number had a second, unmetered
  // way to move. A file with more counter calls than rule consultations has
  // grown one of those again.
  const BOOK_COUNTER_FILES = [
    "app/actions/view-count.ts",
    "app/actions/download.ts",
    "app/api/books/[slug]/download/route.ts",
  ];

  it.each(BOOK_COUNTER_FILES)("%s gates each increment on decideLifetimeCount", (file) => {
    const src = read(file);
    const increments = counterRpcArgs(src).length;
    const decisions = [...src.matchAll(/decideLifetimeCount\(/g)].length;
    expect(increments).toBeGreaterThan(0);
    expect(decisions).toBe(increments);
  });
});

// ── The backfill (0155) ─────────────────────────────────────────────────────
//
// Fixing the counter going forward left the card reading "6 views · 11
// downloads": one number measuring the days since the deploy, the other the
// life of the library. 0155 rebuilds `books.view_count` from `view_logs`,
// which was never broken. These pin the three properties that make that a
// repair rather than a second invented number.

describe("migration 0155 — the lifetime counter backfill", () => {
  const sql = read("supabase/migrations/0155_lifetime_counter_backfill.sql");

  it("replays the ROLLING window rather than bucketing by calendar day", () => {
    // A reader at 23:50 and again at 00:10 is one viewer in one evening. A
    // `(viewer, date)` group would print a number the live rule can never
    // produce again — the whole reason the window has no calendar boundary.
    expect(sql).toMatch(/interval '24 hours'/);
    expect(sql).not.toMatch(/AT TIME ZONE|::date/i);
  });

  it("skips a viewer the log cannot identify", () => {
    // decideLifetimeCount's `unidentified` branch. Counting a row with no
    // account and no session hash would make the repaired number a refresh
    // counter.
    expect(sql).toMatch(/user_id is not null or vl\.session_hash is not null/);
    expect(sql).toMatch(/dl\.user_id is not null/);
  });

  it("only ever raises a counter", () => {
    // A log is a LOWER bound: download_logs cascades away with a closed
    // account, view_logs keeps the row but loses the identity, and anonymous
    // view logging is rate-limited. Rebuilding downward on that evidence
    // trades a frozen counter for a quietly wrong one — and the guard is what
    // makes a second run a no-op.
    const updates = [...sql.matchAll(/update public\.books[\s\S]*?;/g)].map((m) => m[0]);
    expect(updates).toHaveLength(2);
    for (const u of updates) expect(u).toMatch(/counted > coalesce\(b\.(view|download)_count, 0\)/);
  });

  it("touches no counter that was never frozen", () => {
    // research_reports and publications pass `row_id` and have worked the
    // whole time; book_files.download_count is written by the RPC and read by
    // nothing.
    expect(sql).not.toMatch(/update public\.(research_reports|publications|book_files)/);
  });
});
