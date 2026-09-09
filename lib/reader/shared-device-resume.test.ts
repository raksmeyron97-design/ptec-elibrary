import { describe, expect, it } from "vitest";
import { parseLocalPosition, resolveResumePage } from "./resume";

/*
 * SHARED-DEVICE ISOLATION FOR THE READING POSITION — the half 0141 left out.
 *
 * `app/actions/reader-bookmarks-isolation.test.ts` and
 * `components/ui/reader/bookmark-ownership.test.ts` cover the same guarantee
 * for BOOKMARKS: the device record is stamped with the account that wrote it,
 * so the next student to sign in on a lab PC does not absorb the previous
 * student's pages. `lib/offline.ts` stamps downloaded books for the same
 * reason, and says so.
 *
 * The reading POSITION (`ebook:pos:<bookId>`) was left unstamped, and
 * localStorage is per-ORIGIN, not per-account. Sign-out is a server route
 * that clears cookies and touches no local storage, so the record survives it.
 * The consequence is not cosmetic: `resolveResumePage` prefers the device's
 * exact page whenever the server knows nothing (`serverPct === 0`), which is
 * precisely the state of a reader opening a book for the first time. So
 * account B lands on account A's page — and `useReaderProgress` then autosaves
 * that page to B's account 1.5 s later, with no action from B at all.
 *
 * The rule below is the bookmark rule, verbatim: a record stamped for SOMEONE
 * ELSE is not this reader's to resume from; an UNSTAMPED record (written
 * before this change) is trusted and claimed, which is what carries an
 * existing reader's position forward; and when the account is unknown — the
 * offline reader, the signed-out thesis/publication preview — nothing changes,
 * because those surfaces never had an account to disagree with.
 */

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("resolveResumePage account stamping", () => {
  const numPages = 500;
  /** Alice read to page 237 on this machine and signed out. */
  const alicePosition = { p: 237, pct: 47, o: ALICE };

  it("does not resume a second account onto the previous reader's page", () => {
    expect(
      resolveResumePage({
        local: alicePosition,
        // Bob has never opened this book, so the server holds nothing for him.
        serverPct: 0,
        isLoggedIn: true,
        accountId: BOB,
        numPages,
      }),
    ).toBeNull();
  });

  it("still resumes the account that wrote the record", () => {
    expect(
      resolveResumePage({
        local: alicePosition,
        serverPct: 0,
        isLoggedIn: true,
        accountId: ALICE,
        numPages,
      }),
    ).toBe(237);
  });

  it("claims an unstamped record, so an existing reader's position survives", () => {
    expect(
      resolveResumePage({
        local: { p: 237, pct: 47 },
        serverPct: 0,
        isLoggedIn: true,
        accountId: BOB,
        numPages,
      }),
    ).toBe(237);
  });

  it("leaves the offline reader and signed-out previews exactly as they were", () => {
    // No account to compare against: the offline reader (isLoggedIn false by
    // construction) and the thesis/publication previews must keep resuming.
    expect(
      resolveResumePage({ local: alicePosition, serverPct: 0, isLoggedIn: false, numPages }),
    ).toBe(237);
    expect(
      resolveResumePage({
        local: alicePosition,
        serverPct: 0,
        isLoggedIn: false,
        accountId: null,
        numPages,
      }),
    ).toBe(237);
  });

  it("refuses a foreign record even when its percentage agrees with the server", () => {
    // The tolerance path is a second way in: two readers of the same book can
    // sit within two points of each other by coincidence.
    expect(
      resolveResumePage({
        local: { p: 237, pct: 47, o: ALICE },
        serverPct: 47,
        isLoggedIn: true,
        accountId: BOB,
        numPages,
      }),
    ).toBeNull();
  });

  it("refuses a foreign record even when it carries the newer timestamp", () => {
    const serverAt = Date.parse("2026-09-09T10:00:00Z");
    expect(
      resolveResumePage({
        local: { p: 237, pct: 47, o: ALICE, t: serverAt + 60_000 },
        serverPct: 12,
        serverAt,
        isLoggedIn: true,
        accountId: BOB,
        numPages,
      }),
    ).toBeNull();
  });

  it("refuses a foreign record whose synced marker matches the server", () => {
    // `s === serverPct` is the clock-free "nothing was read elsewhere" path.
    // It reasons about a device, and must not speak for a different account.
    expect(
      resolveResumePage({
        local: { p: 237, pct: 47, o: ALICE, s: 30 },
        serverPct: 30,
        isLoggedIn: true,
        accountId: BOB,
        numPages,
      }),
    ).toBeNull();
  });
});

describe("parseLocalPosition owner", () => {
  it("round-trips the account stamp", () => {
    expect(parseLocalPosition(`{"p":237,"pct":47,"o":"${ALICE}"}`)?.o).toBe(ALICE);
  });

  it("reads a pre-existing unstamped record as unowned rather than as corrupt", () => {
    const parsed = parseLocalPosition('{"p":237,"pct":47}');
    expect(parsed?.p).toBe(237);
    expect(parsed?.o).toBeUndefined();
  });

  it("ignores a non-string stamp rather than storing it", () => {
    expect(parseLocalPosition('{"p":237,"o":42}')?.o).toBeUndefined();
  });
});
