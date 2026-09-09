import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncReaderBookmarks } from "./reader-bookmarks";

/*
 * ACCOUNT ISOLATION ON SYNC — the server half of the guarantee.
 *
 * `components/ui/reader/bookmark-ownership.test.ts` covers the device half:
 * localStorage stamps the record with the account that wrote it. Its own
 * docstring says the other half is that the SERVER decides, "because the
 * browser cannot know which account it is talking to" — and that half had no
 * test. This is it.
 *
 * Why it matters: PTEC students read on shared lab machines and localStorage
 * is per-ORIGIN, not per-account. `localPages` and `localOwner` arrive as
 * Server Action arguments, which are as caller-controlled as a request body.
 * If the server trusted them, the next student to sign in on that PC would
 * silently absorb the previous reader's bookmarks into their own account —
 * and `user_id` would say the pages were theirs, so nothing afterwards could
 * tell them apart.
 *
 * The fake records every upsert so the assertions are about what would reach
 * the database, not about a return value.
 */

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BOOK = "33333333-3333-4333-8333-333333333301";

/** Rows the action tried to write, in call order. */
let upserts: Array<Record<string, unknown>[]>;
/** Who `auth.getUser()` reports. Null models a signed-out caller. */
let currentUser: { id: string } | null;
/** Rows already in reader_bookmarks, keyed by owner. */
let existing: Array<Record<string, unknown>>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from(table: string) {
      if (table !== "reader_bookmarks") throw new Error(`unexpected table ${table}`);
      const filters: Array<[string, unknown]> = [];
      const chain: Record<string, unknown> = {
        upsert: async (rows: Record<string, unknown>[]) => {
          upserts.push(rows);
          return { error: null };
        },
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return chain;
        },
        order: () => chain,
        // The read-back applies the same filters Postgres would, so "Bob sees
        // only Bob's" is decided by user_id rather than by the test.
        limit: async () => ({
          data: existing.filter((r) => filters.every(([c, v]) => r[c] === v)),
          error: null,
        }),
      };
      return chain;
    },
  }),
}));

beforeEach(() => {
  upserts = [];
  currentUser = { id: BOB };
  existing = [
    { user_id: BOB, record_type: "book", record_id: BOOK, page_number: 7, label: "Bob's note" },
    { user_id: ALICE, record_type: "book", record_id: BOOK, page_number: 99, label: "Alice's note" },
  ];
});

describe("syncReaderBookmarks account isolation", () => {
  it("uploads nothing when the device record belongs to another account", async () => {
    const res = await syncReaderBookmarks("book", BOOK, [101, 102], ALICE);

    // Alice's pages must not become Bob's rows.
    expect(upserts).toEqual([]);
    expect(res.ownerKey).toBe(BOB);
    expect(res.bookmarks.map((b) => b.page_number)).not.toContain(101);
  });

  it("returns only the signed-in account's bookmarks, never the other account's", async () => {
    const res = await syncReaderBookmarks("book", BOOK, [], ALICE);

    const pages = res.bookmarks.map((b) => b.page_number);
    expect(pages).toContain(7);
    expect(pages).not.toContain(99);
  });

  it("claims an unstamped pre-0141 record, which is what migrates an existing reader", async () => {
    await syncReaderBookmarks("book", BOOK, [3, 4], null);

    expect(upserts).toHaveLength(1);
    expect(upserts[0].map((r) => r.page_number).sort()).toEqual([3, 4]);
    // Stamped with the SERVER's idea of who is calling.
    expect(new Set(upserts[0].map((r) => r.user_id))).toEqual(new Set([BOB]));
  });

  it("stamps uploads with the authenticated user, not anything the caller supplied", async () => {
    await syncReaderBookmarks("book", BOOK, [11], BOB);

    expect(upserts[0][0]).toMatchObject({ user_id: BOB, page_number: 11 });
  });

  it("writes nothing for a signed-out caller", async () => {
    currentUser = null;
    const res = await syncReaderBookmarks("book", BOOK, [5], null);

    expect(upserts).toEqual([]);
    expect(res).toEqual({ ownerKey: null, bookmarks: [] });
  });

  it("drops junk page numbers rather than storing them", async () => {
    await syncReaderBookmarks("book", BOOK, [1, 1, 0, -3, 2.5, NaN, Infinity, 6], null);

    expect(upserts[0].map((r) => r.page_number)).toEqual([1, 6]);
  });
});
